-- One audited, company-scoped command for the Vehicle permission editor.
-- Remove direct column-permission writes so a browser cannot leave a partial set.
REVOKE INSERT, UPDATE, DELETE ON public.column_permissions FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS admin_full_access ON public.column_permissions;
DROP POLICY IF EXISTS user_own_permissions ON public.column_permissions;
DROP POLICY IF EXISTS admin_manage_permissions ON public.column_permissions;
DROP POLICY IF EXISTS admin_update_permissions ON public.column_permissions;
DROP POLICY IF EXISTS admin_delete_permissions ON public.column_permissions;

CREATE POLICY column_permissions_scoped_read ON public.column_permissions
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles actor
    JOIN public.profiles target ON target.id = column_permissions.user_id
    WHERE actor.id = auth.uid()
      AND actor.status = 'active'
      AND actor.role IN ('super_admin', 'company_admin')
      AND (
        (actor.role = 'super_admin' AND actor.access_scope = 'global')
        OR actor.company_id = target.company_id
      )
  )
);

CREATE OR REPLACE FUNCTION public.save_vehicle_user_permissions(
  p_user_id uuid,
  p_can_edit boolean,
  p_can_bulk_edit boolean,
  p_can_view_details boolean,
  p_columns jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_target public.profiles%ROWTYPE;
  v_before_columns jsonb;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() FOR SHARE;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF v_actor.id IS NULL OR v_actor.status <> 'active'
    OR v_target.id IS NULL OR v_target.id = v_actor.id
    OR v_actor.role NOT IN ('super_admin', 'company_admin')
    OR NOT (
      (v_actor.role = 'super_admin' AND v_actor.access_scope = 'global')
      OR (v_actor.role = 'company_admin' AND v_actor.company_id IS NOT NULL AND v_actor.company_id = v_target.company_id)
    )
    OR (v_actor.role = 'company_admin' AND (v_target.role = 'super_admin' OR v_target.access_scope = 'global'))
  THEN
    RAISE EXCEPTION 'Not authorized to change Vehicle permissions' USING errcode = '42501';
  END IF;

  IF p_can_edit IS NULL OR p_can_bulk_edit IS NULL OR p_can_view_details IS NULL
    OR p_columns IS NULL OR pg_catalog.jsonb_typeof(p_columns) <> 'object'
  THEN
    RAISE EXCEPTION 'Invalid Vehicle permission draft';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_each_text(p_columns) AS permission(column_name, permission_level)
    WHERE permission.column_name !~ '^[a-z][a-z0-9_]{0,63}$'
    OR permission.permission_level IS NULL
    OR permission.permission_level NOT IN ('none','view','edit')
  ) THEN
    RAISE EXCEPTION 'Invalid Vehicle column permission';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_object_agg(cp.column_name, cp.permission_level), '{}'::jsonb)
    INTO v_before_columns
    FROM public.column_permissions cp
   WHERE cp.user_id = p_user_id AND cp.table_name = 'vehicles';

  UPDATE public.profiles
     SET can_edit_vehicles = p_can_edit,
         can_bulk_edit_vehicles = p_can_bulk_edit,
         can_view_vehicle_details = p_can_view_details,
         updated_at = now()
   WHERE id = p_user_id;

  DELETE FROM public.column_permissions
   WHERE user_id = p_user_id AND table_name = 'vehicles';

  INSERT INTO public.column_permissions (user_id, table_name, column_name, permission_level)
  SELECT p_user_id, 'vehicles', permission.column_name, permission.permission_level
    FROM pg_catalog.jsonb_each_text(p_columns) AS permission(column_name, permission_level)
   WHERE permission.permission_level <> 'none';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (
    v_actor.id, 'update', 'vehicle_permissions', p_user_id, 'column_permissions',
    pg_catalog.jsonb_build_object(
      'before', pg_catalog.jsonb_build_object(
        'can_edit', v_target.can_edit_vehicles,
        'can_bulk_edit', v_target.can_bulk_edit_vehicles,
        'can_view_details', v_target.can_view_vehicle_details,
        'columns', v_before_columns
      ),
      'after', pg_catalog.jsonb_build_object(
        'can_edit', p_can_edit,
        'can_bulk_edit', p_can_bulk_edit,
        'can_view_details', p_can_view_details,
        'columns', p_columns
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_vehicle_user_permissions(uuid, boolean, boolean, boolean, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_vehicle_user_permissions(uuid, boolean, boolean, boolean, jsonb)
  TO authenticated;
