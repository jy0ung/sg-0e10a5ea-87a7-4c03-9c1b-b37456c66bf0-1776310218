-- Canonical HRMS role-assignment integrity and atomic replacement.
--
-- Employee is the workforce identity. Profile remains an optional authenticated
-- identity bridge for the same Employee (or a global Profile-only assignment).
-- Normal assignment replacement remains SECURITY INVOKER so existing RLS and
-- table privileges continue to authorize the caller.

CREATE OR REPLACE FUNCTION public.enforce_hrms_role_assignment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  role_company_id text;
  employee_company_id text;
  profile_company_id text;
  profile_access_scope text;
  profile_employee_id uuid;
BEGIN
  SELECT r.company_id
    INTO role_company_id
    FROM public.hrms_roles r
   WHERE r.id = NEW.hrms_role_id;

  IF role_company_id IS NULL THEN
    RAISE EXCEPTION 'HRMS Role % does not exist', NEW.hrms_role_id
      USING ERRCODE = '23503';
  END IF;

  IF role_company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'HRMS Role must belong to the assignment company'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.employee_id IS NOT NULL THEN
    SELECT e.company_id
      INTO employee_company_id
      FROM public.employees e
     WHERE e.id = NEW.employee_id;

    IF employee_company_id IS NULL THEN
      RAISE EXCEPTION 'Employee % does not exist', NEW.employee_id
        USING ERRCODE = '23503';
    END IF;

    IF employee_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Employee must belong to the assignment company'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.profile_id IS NOT NULL THEN
    SELECT p.company_id, p.access_scope, p.employee_id
      INTO profile_company_id, profile_access_scope, profile_employee_id
      FROM public.profiles p
     WHERE p.id = NEW.profile_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profile % does not exist', NEW.profile_id
        USING ERRCODE = '23503';
    END IF;

    IF profile_company_id IS DISTINCT FROM NEW.company_id
       AND COALESCE(profile_access_scope, '') <> 'global' THEN
      RAISE EXCEPTION 'Profile must belong to the assignment company or have global scope'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.employee_id IS NOT NULL
       AND profile_employee_id IS DISTINCT FROM NEW.employee_id THEN
      RAISE EXCEPTION 'Profile must be linked to the same Employee as the assignment'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_hrms_role_assignment_integrity
  ON public.employee_hrms_role_assignments;

CREATE TRIGGER trg_hrms_role_assignment_integrity
  BEFORE INSERT OR UPDATE OF company_id, hrms_role_id, employee_id, profile_id
  ON public.employee_hrms_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_hrms_role_assignment_integrity();

REVOKE ALL
  ON FUNCTION public.enforce_hrms_role_assignment_integrity()
  FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.replace_hrms_role_employee_assignments(
  p_company_id text,
  p_hrms_role_id uuid,
  p_employee_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  invalid_employee_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.hrms_roles r
     WHERE r.id = p_hrms_role_id
       AND r.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'HRMS Role does not belong to the requested company'
      USING ERRCODE = '23503';
  END IF;

  SELECT requested.employee_id
    INTO invalid_employee_id
    FROM (
      SELECT DISTINCT employee_id
        FROM unnest(COALESCE(p_employee_ids, ARRAY[]::uuid[])) AS u(employee_id)
       WHERE employee_id IS NOT NULL
    ) requested
    LEFT JOIN public.employees e
      ON e.id = requested.employee_id
   WHERE e.id IS NULL
      OR e.company_id IS DISTINCT FROM p_company_id
   LIMIT 1;

  IF invalid_employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'Employee % does not belong to the requested company', invalid_employee_id
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.employee_hrms_role_assignments
   WHERE company_id = p_company_id
     AND hrms_role_id = p_hrms_role_id;

  WITH requested AS (
    SELECT employee_id, MIN(ordinality) AS first_ordinality
      FROM unnest(COALESCE(p_employee_ids, ARRAY[]::uuid[]))
           WITH ORDINALITY AS u(employee_id, ordinality)
     WHERE employee_id IS NOT NULL
     GROUP BY employee_id
  ),
  resolved AS (
    SELECT
      r.employee_id,
      r.first_ordinality,
      linked_profile.id AS profile_id
    FROM requested r
    JOIN public.employees e
      ON e.id = r.employee_id
     AND e.company_id = p_company_id
    LEFT JOIN LATERAL (
      SELECT p.id
        FROM public.profiles p
       WHERE p.employee_id = r.employee_id
         AND (
           p.company_id = p_company_id
           OR p.access_scope = 'global'
         )
       ORDER BY
         CASE WHEN p.company_id = p_company_id THEN 0 ELSE 1 END,
         p.id
       LIMIT 1
    ) linked_profile ON true
  )
  INSERT INTO public.employee_hrms_role_assignments (
    company_id,
    hrms_role_id,
    employee_id,
    profile_id,
    is_primary,
    assigned_by
  )
  SELECT
    p_company_id,
    p_hrms_role_id,
    r.employee_id,
    r.profile_id,
    ROW_NUMBER() OVER (ORDER BY r.first_ordinality, r.employee_id) = 1,
    auth.uid()
  FROM resolved r
  ORDER BY r.first_ordinality, r.employee_id;
END
$$;

REVOKE ALL
  ON FUNCTION public.replace_hrms_role_employee_assignments(text, uuid, uuid[])
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.replace_hrms_role_employee_assignments(text, uuid, uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.enforce_hrms_role_assignment_integrity() IS
  'Rejects HRMS role assignments whose role, Employee, or Profile identity violates company/Employee ownership.';

COMMENT ON FUNCTION public.replace_hrms_role_employee_assignments(text, uuid, uuid[]) IS
  'Atomically replaces one HRMS role assignment set from canonical Employee IDs under caller RLS.';
