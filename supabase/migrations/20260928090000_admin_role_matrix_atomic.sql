-- One audited, compare-and-swap transaction for the complete company role
-- section matrix. Direct browser writes are retired; ordinary tenant reads
-- remain available to route/navigation guards.
CREATE TABLE public.role_section_matrix_versions (
  company_id text PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.role_section_matrix_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.role_section_matrix_versions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.role_sections FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS role_sections_manage ON public.role_sections;

CREATE OR REPLACE FUNCTION public.get_role_section_matrix(p_company_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_matrix jsonb := '{}'::jsonb;
  v_role text;
  v_sections text[];
  v_version bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = auth.uid() AND actor.status = 'active'
      AND actor.role IN ('super_admin', 'company_admin')
      AND (actor.company_id = p_company_id
        OR (actor.role = 'super_admin' AND actor.access_scope = 'global'))
  ) THEN
    RAISE EXCEPTION 'Not authorized to read role matrix' USING errcode = '42501';
  END IF;

  FOR v_role IN SELECT DISTINCT role FROM public.role_sections
    WHERE company_id = p_company_id
  LOOP
    SELECT COALESCE(array_agg(section ORDER BY section), ARRAY[]::text[])
      INTO v_sections FROM public.role_sections
      WHERE company_id = p_company_id AND role = v_role AND allowed;
    v_matrix := jsonb_set(v_matrix, ARRAY[v_role], to_jsonb(v_sections));
  END LOOP;
  SELECT version INTO v_version FROM public.role_section_matrix_versions
    WHERE company_id = p_company_id;
  RETURN jsonb_build_object('version', COALESCE(v_version, 0), 'matrix', v_matrix);
END;
$$;
REVOKE ALL ON FUNCTION public.get_role_section_matrix(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_role_section_matrix(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_role_section_matrix(
  p_company_id text, p_expected_version bigint, p_matrix jsonb
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_roles constant text[] := ARRAY[
    'super_admin','company_admin','director','general_manager','manager',
    'sales','accounts','analyst','creator_updater','portal_admin',
    'portal_manager','portal_staff'
  ];
  v_sections constant text[] := ARRAY[
    'Platform','Auto Aging','Sales','Inventory','Purchasing','Accounts',
    'Reports','HRMS','Admin'
  ];
  v_role text;
  v_item jsonb;
  v_version bigint;
  v_before jsonb := '{}'::jsonb;
  v_allowed text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = v_actor AND actor.status = 'active'
      AND actor.role IN ('super_admin', 'company_admin')
      AND (actor.company_id = p_company_id
        OR (actor.role = 'super_admin' AND actor.access_scope = 'global'))
  ) THEN
    RAISE EXCEPTION 'Not authorized to save role matrix' USING errcode = '42501';
  END IF;
  IF jsonb_typeof(p_matrix) IS DISTINCT FROM 'object'
    OR (SELECT COUNT(*) FROM jsonb_object_keys(p_matrix)) <> cardinality(v_roles)
  THEN
    RAISE EXCEPTION 'Invalid role matrix';
  END IF;
  FOREACH v_role IN ARRAY v_roles LOOP
    IF NOT (p_matrix ? v_role) OR jsonb_typeof(p_matrix -> v_role) <> 'array'
      OR jsonb_array_length(p_matrix -> v_role) > cardinality(v_sections)
    THEN
      RAISE EXCEPTION 'Invalid role matrix';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_matrix -> v_role) LOOP
      IF jsonb_typeof(v_item) <> 'string' OR NOT ((v_item #>> '{}') = ANY(v_sections)) THEN
        RAISE EXCEPTION 'Invalid role matrix section';
      END IF;
    END LOOP;
    IF (SELECT COUNT(*) FROM jsonb_array_elements_text(p_matrix -> v_role)) <>
       (SELECT COUNT(DISTINCT value) FROM jsonb_array_elements_text(p_matrix -> v_role))
    THEN
      RAISE EXCEPTION 'Duplicate role matrix section';
    END IF;
  END LOOP;

  INSERT INTO public.role_section_matrix_versions(company_id) VALUES (p_company_id)
  ON CONFLICT (company_id) DO NOTHING;
  SELECT version INTO v_version FROM public.role_section_matrix_versions
    WHERE company_id = p_company_id FOR UPDATE;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Role matrix changed since it was loaded';
  END IF;

  FOREACH v_role IN ARRAY v_roles LOOP
    SELECT COALESCE(array_agg(section ORDER BY section), ARRAY[]::text[])
      INTO v_allowed FROM public.role_sections
      WHERE company_id = p_company_id AND role = v_role AND allowed;
    v_before := jsonb_set(v_before, ARRAY[v_role], to_jsonb(v_allowed));
  END LOOP;

  INSERT INTO public.role_sections (company_id, role, section, allowed)
  SELECT p_company_id, role_name, section_name,
    (p_matrix -> role_name) ? section_name
  FROM unnest(v_roles) AS role_name
  CROSS JOIN unnest(v_sections) AS section_name
  ON CONFLICT (company_id, role, section) DO UPDATE
    SET allowed = EXCLUDED.allowed, updated_at = now();

  UPDATE public.role_section_matrix_versions
    SET version = version + 1, updated_at = now()
    WHERE company_id = p_company_id RETURNING version INTO v_version;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'update', 'role_section_matrix', gen_random_uuid(), 'role_sections',
    jsonb_build_object('company_id', p_company_id, 'version', v_version,
      'before', v_before, 'after', p_matrix));
  RETURN v_version;
END;
$$;
REVOKE ALL ON FUNCTION public.save_role_section_matrix(text, bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_role_section_matrix(text, bigint, jsonb) TO authenticated;
