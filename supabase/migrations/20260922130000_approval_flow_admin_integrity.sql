-- Canonical Approval Flow admin integrity and atomic save.
--
-- Workflow history is immutable: once either approval engine has instantiated a
-- flow, its structure cannot be deleted/replaced. Active state may still be
-- toggled through normal RLS-protected updates.

-- Preserve canonical approval history instead of cascading flow deletion.
ALTER TABLE public.approval_instances
  DROP CONSTRAINT IF EXISTS approval_instances_flow_id_fkey;

ALTER TABLE public.approval_instances
  ADD CONSTRAINT approval_instances_flow_id_fkey
  FOREIGN KEY (flow_id)
  REFERENCES public.approval_flows(id)
  ON DELETE RESTRICT;

-- Preserve the step pointer of live/completed canonical instances.
ALTER TABLE public.approval_instances
  DROP CONSTRAINT IF EXISTS approval_instances_current_step_id_fkey;

ALTER TABLE public.approval_instances
  ADD CONSTRAINT approval_instances_current_step_id_fkey
  FOREIGN KEY (current_step_id)
  REFERENCES public.approval_steps(id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.enforce_approval_flow_admin_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  department_company_id text;
  actor_company_id text;
  actor_access_scope text;
BEGIN
  IF NEW.department_id IS NOT NULL THEN
    SELECT d.company_id
      INTO department_company_id
      FROM public.departments d
     WHERE d.id = NEW.department_id;

    IF department_company_id IS NULL THEN
      RAISE EXCEPTION 'Approval Flow Department % does not exist', NEW.department_id
        USING ERRCODE = '23503';
    END IF;

    IF department_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Approval Flow Department must belong to the same company'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF COALESCE(NEW.is_default, false) AND NEW.department_id IS NOT NULL THEN
    RAISE EXCEPTION 'A Department-scoped Approval Flow cannot also be the company default'
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(NEW.match_priority, 0) < 0 OR COALESCE(NEW.match_priority, 0) > 100 THEN
    RAISE EXCEPTION 'Approval Flow match priority must be between 0 and 100'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    SELECT p.company_id, p.access_scope
      INTO actor_company_id, actor_access_scope
      FROM public.profiles p
     WHERE p.id = NEW.created_by;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Approval Flow creator Profile % does not exist', NEW.created_by
        USING ERRCODE = '23503';
    END IF;

    IF actor_company_id IS DISTINCT FROM NEW.company_id
       AND COALESCE(actor_access_scope, '') <> 'global' THEN
      RAISE EXCEPTION 'Approval Flow creator must belong to the same company or have global scope'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.updated_by IS NOT NULL THEN
    SELECT p.company_id, p.access_scope
      INTO actor_company_id, actor_access_scope
      FROM public.profiles p
     WHERE p.id = NEW.updated_by;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Approval Flow updater Profile % does not exist', NEW.updated_by
        USING ERRCODE = '23503';
    END IF;

    IF actor_company_id IS DISTINCT FROM NEW.company_id
       AND COALESCE(actor_access_scope, '') <> 'global' THEN
      RAISE EXCEPTION 'Approval Flow updater must belong to the same company or have global scope'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_approval_flow_admin_integrity
  ON public.approval_flows;

CREATE TRIGGER trg_approval_flow_admin_integrity
  BEFORE INSERT OR UPDATE OF
    company_id,
    entity_type,
    department_id,
    is_default,
    conditions,
    match_priority,
    created_by,
    updated_by
  ON public.approval_flows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_approval_flow_admin_integrity();

REVOKE ALL
  ON FUNCTION public.enforce_approval_flow_admin_integrity()
  FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.enforce_approval_step_admin_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  flow_company_id text;
  role_company_id text;
  profile_company_id text;
  profile_access_scope text;
BEGIN
  SELECT f.company_id
    INTO flow_company_id
    FROM public.approval_flows f
   WHERE f.id = NEW.flow_id;

  IF flow_company_id IS NULL THEN
    RAISE EXCEPTION 'Approval Flow % does not exist', NEW.flow_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.approver_type = 'role'
     AND NULLIF(btrim(COALESCE(NEW.approver_role, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Role Approval Step requires an HRMS Role'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.approver_type = 'specific_user'
     AND NEW.approver_user_id IS NULL THEN
    RAISE EXCEPTION 'Specific-user Approval Step requires an approver Profile'
      USING ERRCODE = '23514';
  END IF;

  -- New workflow admin writes store HRMS Role UUIDs as text. Keep non-UUID
  -- legacy role keys readable for compatibility, but validate UUID-form roles.
  IF NEW.approver_type = 'role'
     AND NEW.approver_role ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT r.company_id
      INTO role_company_id
      FROM public.hrms_roles r
     WHERE r.id = NEW.approver_role::uuid;

    IF role_company_id IS NULL THEN
      RAISE EXCEPTION 'Approval Step HRMS Role % does not exist', NEW.approver_role
        USING ERRCODE = '23503';
    END IF;

    IF role_company_id IS DISTINCT FROM flow_company_id THEN
      RAISE EXCEPTION 'Approval Step HRMS Role must belong to the Flow company'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.approver_user_id IS NOT NULL THEN
    SELECT p.company_id, p.access_scope
      INTO profile_company_id, profile_access_scope
      FROM public.profiles p
     WHERE p.id = NEW.approver_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Approval Step approver Profile % does not exist', NEW.approver_user_id
        USING ERRCODE = '23503';
    END IF;

    IF profile_company_id IS DISTINCT FROM flow_company_id
       AND COALESCE(profile_access_scope, '') <> 'global' THEN
      RAISE EXCEPTION 'Approval Step approver Profile must belong to the Flow company or have global scope'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.fallback_approver_user_id IS NOT NULL THEN
    SELECT p.company_id, p.access_scope
      INTO profile_company_id, profile_access_scope
      FROM public.profiles p
     WHERE p.id = NEW.fallback_approver_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Approval Step fallback Profile % does not exist', NEW.fallback_approver_user_id
        USING ERRCODE = '23503';
    END IF;

    IF profile_company_id IS DISTINCT FROM flow_company_id
       AND COALESCE(profile_access_scope, '') <> 'global' THEN
      RAISE EXCEPTION 'Approval Step fallback Profile must belong to the Flow company or have global scope'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_approval_step_admin_integrity
  ON public.approval_steps;

CREATE TRIGGER trg_approval_step_admin_integrity
  BEFORE INSERT OR UPDATE OF
    flow_id,
    approver_type,
    approver_role,
    approver_user_id,
    fallback_approver_user_id
  ON public.approval_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_approval_step_admin_integrity();

REVOKE ALL
  ON FUNCTION public.enforce_approval_step_admin_integrity()
  FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.guard_used_approval_flow_step_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_flow_id uuid;
BEGIN
  target_flow_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.flow_id
    ELSE NEW.flow_id
  END;

  IF EXISTS (
    SELECT 1 FROM public.approval_instances ai WHERE ai.flow_id = target_flow_id
  ) OR EXISTS (
    SELECT 1 FROM public.approval_requests ar WHERE ar.flow_id = target_flow_id
  ) THEN
    RAISE EXCEPTION
      'Approval Flow has workflow history and its steps are structurally immutable. Deactivate it and create a replacement Flow.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_guard_used_approval_flow_step_delete
  ON public.approval_steps;
DROP TRIGGER IF EXISTS trg_guard_used_approval_flow_step_mutation
  ON public.approval_steps;

CREATE TRIGGER trg_guard_used_approval_flow_step_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.approval_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_used_approval_flow_step_mutation();

REVOKE ALL
  ON FUNCTION public.guard_used_approval_flow_step_mutation()
  FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.guard_used_approval_flow_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.approval_instances ai WHERE ai.flow_id = OLD.id
  ) OR EXISTS (
    SELECT 1 FROM public.approval_requests ar WHERE ar.flow_id = OLD.id
  ) THEN
    RAISE EXCEPTION
      'Approval Flow has workflow history and cannot be deleted. Deactivate it instead.'
      USING ERRCODE = '23514';
  END IF;

  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS trg_guard_used_approval_flow_delete
  ON public.approval_flows;

CREATE TRIGGER trg_guard_used_approval_flow_delete
  BEFORE DELETE ON public.approval_flows
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_used_approval_flow_delete();

REVOKE ALL
  ON FUNCTION public.guard_used_approval_flow_delete()
  FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.save_approval_flow_with_steps(
  p_company_id text,
  p_flow_id uuid,
  p_name text,
  p_description text,
  p_entity_type text,
  p_is_active boolean,
  p_department_id uuid,
  p_is_default boolean,
  p_conditions jsonb,
  p_match_priority integer,
  p_preserve_conditions boolean,
  p_preserve_match_priority boolean,
  p_steps jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_flow_id uuid;
BEGIN
  IF NULLIF(btrim(p_company_id), '') IS NULL THEN
    RAISE EXCEPTION 'Company is required' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Approval Flow name is required' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(COALESCE(p_steps, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Approval Flow steps must be a JSON array'
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(COALESCE(p_steps, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Approval Flow requires at least one step'
      USING ERRCODE = '23514';
  END IF;

  IF NOT COALESCE(p_preserve_match_priority, false)
     AND COALESCE(p_match_priority, 0) NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Approval Flow match priority must be between 0 and 100'
      USING ERRCODE = '23514';
  END IF;

  IF p_flow_id IS NULL THEN
    INSERT INTO public.approval_flows (
      company_id,
      name,
      description,
      entity_type,
      is_active,
      created_by,
      updated_by,
      department_id,
      is_default,
      conditions,
      match_priority
    )
    VALUES (
      p_company_id,
      btrim(p_name),
      NULLIF(btrim(p_description), ''),
      p_entity_type,
      p_is_active,
      auth.uid(),
      auth.uid(),
      p_department_id,
      p_is_default,
      p_conditions,
      COALESCE(p_match_priority, 0)
    )
    RETURNING id INTO target_flow_id;
  ELSE
    UPDATE public.approval_flows f
       SET name = btrim(p_name),
           description = NULLIF(btrim(p_description), ''),
           entity_type = p_entity_type,
           is_active = p_is_active,
           department_id = p_department_id,
           is_default = p_is_default,
           conditions = CASE
             WHEN COALESCE(p_preserve_conditions, false) THEN f.conditions
             ELSE p_conditions
           END,
           match_priority = CASE
             WHEN COALESCE(p_preserve_match_priority, false) THEN f.match_priority
             ELSE COALESCE(p_match_priority, 0)
           END,
           updated_by = auth.uid(),
           updated_at = now()
     WHERE f.id = p_flow_id
       AND f.company_id = p_company_id
    RETURNING f.id INTO target_flow_id;

    IF target_flow_id IS NULL THEN
      RAISE EXCEPTION 'Approval Flow does not belong to the requested company'
        USING ERRCODE = '23503';
    END IF;

    -- The BEFORE DELETE trigger rejects structural edits after workflow use.
    DELETE FROM public.approval_steps
     WHERE flow_id = target_flow_id;
  END IF;

  INSERT INTO public.approval_steps (
    flow_id,
    step_order,
    name,
    approver_type,
    approver_role,
    approver_user_id,
    fallback_approver_user_id,
    escalation_rule,
    condition_rule,
    is_active,
    allow_self_approval
  )
  SELECT
    target_flow_id,
    step_data.ordinality::int,
    NULLIF(btrim(step_data.step->>'name'), ''),
    step_data.step->>'approverType',
    NULLIF(btrim(step_data.step->>'approverRole'), ''),
    NULLIF(step_data.step->>'approverUserId', '')::uuid,
    NULLIF(step_data.step->>'fallbackApproverUserId', '')::uuid,
    NULLIF(btrim(step_data.step->>'escalationRule'), ''),
    NULLIF(btrim(step_data.step->>'conditionRule'), ''),
    COALESCE((step_data.step->>'isActive')::boolean, true),
    COALESCE((step_data.step->>'allowSelfApproval')::boolean, false)
  FROM jsonb_array_elements(p_steps)
       WITH ORDINALITY AS step_data(step, ordinality);

  RETURN target_flow_id;
END
$$;

REVOKE ALL
  ON FUNCTION public.save_approval_flow_with_steps(
    text, uuid, text, text, text, boolean, uuid, boolean,
    jsonb, integer, boolean, boolean, jsonb
  )
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.save_approval_flow_with_steps(
    text, uuid, text, text, text, boolean, uuid, boolean,
    jsonb, integer, boolean, boolean, jsonb
  )
  TO authenticated;

COMMENT ON FUNCTION public.save_approval_flow_with_steps(
  text, uuid, text, text, text, boolean, uuid, boolean,
  jsonb, integer, boolean, boolean, jsonb
) IS
  'Atomically creates or updates one unused Approval Flow and its steps under caller RLS; used flows are structurally immutable.';
