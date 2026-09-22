-- Keep the canonical workforce role and Sales Advisor module assignment atomic.
--
-- HRMS Employee create/update previously mutated public.employees separately
-- from public.employee_module_assignments. A failure between those writes could
-- leave primary_role='sales' without an active sales_advisor assignment (or the
-- reverse). This command makes the pair one transaction and validates the
-- Employee's company-scoped workforce references before mutation.
--
-- Existing public.create_sales_advisor_employee(...) remains a separate,
-- compatible atomic creation path for the Sales Advisor administration flow.

CREATE OR REPLACE FUNCTION public.mutate_employee_with_assignments(
  p_company_id text,
  p_employee_id uuid,
  p_create boolean,
  p_changes jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_changes jsonb := COALESCE(p_changes, '{}'::jsonb);
  v_current public.employees%ROWTYPE;
  v_invalid_key text;

  v_name text;
  v_role text;
  v_branch_id text;
  v_manager_employee_id uuid;
  v_staff_code text;
  v_work_email text;
  v_ic_no text;
  v_contact_no text;
  v_join_date date;
  v_resign_date date;
  v_status text;
  v_department_id uuid;
  v_job_title_id uuid;
BEGIN
  IF NULLIF(btrim(p_company_id), '') IS NULL THEN
    RAISE EXCEPTION 'Company is required'
      USING ERRCODE = '23514';
  END IF;

  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee id is required'
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(v_changes) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Employee changes must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  SELECT key
    INTO v_invalid_key
    FROM jsonb_object_keys(v_changes) AS key
   WHERE key NOT IN (
     'name',
     'primary_role',
     'branch_id',
     'manager_employee_id',
     'staff_code',
     'work_email',
     'ic_no',
     'contact_no',
     'join_date',
     'resign_date',
     'status',
     'department_id',
     'job_title_id'
   )
   LIMIT 1;

  IF v_invalid_key IS NOT NULL THEN
    RAISE EXCEPTION 'Unsupported Employee field: %', v_invalid_key
      USING ERRCODE = '22023';
  END IF;

  IF p_create THEN
    IF EXISTS (
      SELECT 1
        FROM public.employees e
       WHERE e.id = p_employee_id
    ) THEN
      RAISE EXCEPTION 'Employee already exists'
        USING ERRCODE = '23505';
    END IF;

    v_name := NULLIF(btrim(v_changes ->> 'name'), '');
    v_role := COALESCE(NULLIF(btrim(v_changes ->> 'primary_role'), ''), 'creator_updater');
    v_branch_id := NULLIF(btrim(v_changes ->> 'branch_id'), '');
    v_manager_employee_id := NULLIF(v_changes ->> 'manager_employee_id', '')::uuid;
    v_staff_code := NULLIF(upper(btrim(v_changes ->> 'staff_code')), '');
    v_work_email := NULLIF(btrim(v_changes ->> 'work_email'), '');
    v_ic_no := NULLIF(btrim(v_changes ->> 'ic_no'), '');
    v_contact_no := NULLIF(btrim(v_changes ->> 'contact_no'), '');
    v_join_date := NULLIF(v_changes ->> 'join_date', '')::date;
    v_resign_date := NULLIF(v_changes ->> 'resign_date', '')::date;
    v_status := COALESCE(NULLIF(btrim(v_changes ->> 'status'), ''), 'active');
    v_department_id := NULLIF(v_changes ->> 'department_id', '')::uuid;
    v_job_title_id := NULLIF(v_changes ->> 'job_title_id', '')::uuid;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Employee name is required'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT e.*
      INTO v_current
      FROM public.employees e
     WHERE e.id = p_employee_id
       AND e.company_id = p_company_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Employee was not found in the requested company'
        USING ERRCODE = 'P0002';
    END IF;

    v_name := CASE
      WHEN v_changes ? 'name' THEN NULLIF(btrim(v_changes ->> 'name'), '')
      ELSE v_current.name
    END;
    v_role := CASE
      WHEN v_changes ? 'primary_role' THEN NULLIF(btrim(v_changes ->> 'primary_role'), '')
      ELSE v_current.primary_role
    END;
    v_branch_id := CASE
      WHEN v_changes ? 'branch_id' THEN NULLIF(btrim(v_changes ->> 'branch_id'), '')
      ELSE v_current.branch_id
    END;
    v_manager_employee_id := CASE
      WHEN v_changes ? 'manager_employee_id'
        THEN NULLIF(v_changes ->> 'manager_employee_id', '')::uuid
      ELSE v_current.manager_employee_id
    END;
    v_staff_code := CASE
      WHEN v_changes ? 'staff_code'
        THEN NULLIF(upper(btrim(v_changes ->> 'staff_code')), '')
      ELSE v_current.staff_code
    END;
    v_work_email := CASE
      WHEN v_changes ? 'work_email' THEN NULLIF(btrim(v_changes ->> 'work_email'), '')
      ELSE v_current.work_email
    END;
    v_ic_no := CASE
      WHEN v_changes ? 'ic_no' THEN NULLIF(btrim(v_changes ->> 'ic_no'), '')
      ELSE v_current.ic_no
    END;
    v_contact_no := CASE
      WHEN v_changes ? 'contact_no' THEN NULLIF(btrim(v_changes ->> 'contact_no'), '')
      ELSE v_current.contact_no
    END;
    v_join_date := CASE
      WHEN v_changes ? 'join_date' THEN NULLIF(v_changes ->> 'join_date', '')::date
      ELSE v_current.join_date
    END;
    v_resign_date := CASE
      WHEN v_changes ? 'resign_date' THEN NULLIF(v_changes ->> 'resign_date', '')::date
      ELSE v_current.resign_date
    END;
    v_status := CASE
      WHEN v_changes ? 'status' THEN NULLIF(btrim(v_changes ->> 'status'), '')
      ELSE v_current.status
    END;
    v_department_id := CASE
      WHEN v_changes ? 'department_id'
        THEN NULLIF(v_changes ->> 'department_id', '')::uuid
      ELSE v_current.department_id
    END;
    v_job_title_id := CASE
      WHEN v_changes ? 'job_title_id'
        THEN NULLIF(v_changes ->> 'job_title_id', '')::uuid
      ELSE v_current.job_title_id
    END;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Employee name cannot be empty'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Employee role is required'
      USING ERRCODE = '23514';
  END IF;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Employee status is required'
      USING ERRCODE = '23514';
  END IF;

  IF v_branch_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.branches b
        WHERE b.id::text = v_branch_id
          AND b.company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'Branch does not belong to the Employee company'
      USING ERRCODE = '23514';
  END IF;

  IF v_manager_employee_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.employees manager_e
        WHERE manager_e.id = v_manager_employee_id
          AND manager_e.company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'Manager does not belong to the Employee company'
      USING ERRCODE = '23514';
  END IF;

  IF v_department_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.departments d
        WHERE d.id = v_department_id
          AND d.company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'Department does not belong to the Employee company'
      USING ERRCODE = '23514';
  END IF;

  IF v_job_title_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.job_titles jt
        WHERE jt.id = v_job_title_id
          AND jt.company_id = p_company_id
     ) THEN
    RAISE EXCEPTION 'Job title does not belong to the Employee company'
      USING ERRCODE = '23514';
  END IF;

  IF p_create THEN
    INSERT INTO public.employees (
      id,
      company_id,
      branch_id,
      manager_employee_id,
      primary_role,
      staff_code,
      name,
      work_email,
      ic_no,
      contact_no,
      join_date,
      resign_date,
      status,
      department_id,
      job_title_id
    )
    VALUES (
      p_employee_id,
      p_company_id,
      v_branch_id,
      v_manager_employee_id,
      v_role,
      v_staff_code,
      v_name,
      v_work_email,
      v_ic_no,
      v_contact_no,
      v_join_date,
      v_resign_date,
      v_status,
      v_department_id,
      v_job_title_id
    );
  ELSE
    UPDATE public.employees
       SET branch_id = v_branch_id,
           manager_employee_id = v_manager_employee_id,
           primary_role = v_role,
           staff_code = v_staff_code,
           name = v_name,
           work_email = v_work_email,
           ic_no = v_ic_no,
           contact_no = v_contact_no,
           join_date = v_join_date,
           resign_date = v_resign_date,
           status = v_status,
           department_id = v_department_id,
           job_title_id = v_job_title_id
     WHERE id = p_employee_id
       AND company_id = p_company_id;
  END IF;

  IF v_role = 'sales' THEN
    INSERT INTO public.employee_module_assignments (
      company_id,
      employee_id,
      module_key,
      assignment_role,
      is_primary,
      active,
      effective_to,
      source
    )
    VALUES (
      p_company_id,
      p_employee_id,
      'sales',
      'sales_advisor',
      true,
      true,
      NULL,
      'manual'
    )
    ON CONFLICT (employee_id, module_key, assignment_role)
    DO UPDATE SET
      company_id = EXCLUDED.company_id,
      is_primary = true,
      active = true,
      effective_to = NULL,
      updated_at = now();
  ELSE
    UPDATE public.employee_module_assignments
       SET is_primary = false,
           active = false,
           effective_to = COALESCE(effective_to, current_date),
           updated_at = now()
     WHERE company_id = p_company_id
       AND employee_id = p_employee_id
       AND module_key = 'sales'
       AND assignment_role = 'sales_advisor';
  END IF;

  RETURN p_employee_id;
END
$$;

REVOKE ALL ON FUNCTION public.mutate_employee_with_assignments(
  text, uuid, boolean, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mutate_employee_with_assignments(
  text, uuid, boolean, jsonb
) TO authenticated, service_role;

COMMENT ON FUNCTION public.mutate_employee_with_assignments(
  text, uuid, boolean, jsonb
) IS 'Creates or updates one company-scoped Employee and keeps the canonical sales_advisor assignment consistent with primary_role in the same transaction using caller RLS.';
