-- Canonical Sales Advisor command.
-- Creates the HRMS-owned Employee and Sales module assignment atomically.
-- The legacy public.sales_advisors table is intentionally not written.

CREATE OR REPLACE FUNCTION public.create_sales_advisor_employee(
  p_company_id text,
  p_branch_id text,
  p_staff_code text,
  p_name text,
  p_work_email text DEFAULT NULL,
  p_ic_no text DEFAULT NULL,
  p_contact_no text DEFAULT NULL,
  p_join_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_employee_id uuid := gen_random_uuid();
BEGIN
  IF NULLIF(btrim(p_company_id), '') IS NULL THEN
    RAISE EXCEPTION 'Company is required' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(p_branch_id), '') IS NULL THEN
    RAISE EXCEPTION 'Branch is required' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(p_staff_code), '') IS NULL THEN
    RAISE EXCEPTION 'Sales Advisor code is required' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Sales Advisor name is required' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.branches b
     WHERE b.id::text = p_branch_id
       AND b.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to the requested company'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.employees (
    id,
    company_id,
    branch_id,
    primary_role,
    staff_code,
    name,
    work_email,
    ic_no,
    contact_no,
    join_date,
    status
  )
  VALUES (
    new_employee_id,
    p_company_id,
    p_branch_id,
    'sales',
    upper(btrim(p_staff_code)),
    btrim(p_name),
    NULLIF(btrim(p_work_email), ''),
    NULLIF(btrim(p_ic_no), ''),
    NULLIF(btrim(p_contact_no), ''),
    p_join_date,
    'active'
  );

  INSERT INTO public.employee_module_assignments (
    company_id,
    employee_id,
    module_key,
    assignment_role,
    is_primary,
    active,
    source
  )
  VALUES (
    p_company_id,
    new_employee_id,
    'sales',
    'sales_advisor',
    true,
    true,
    'manual'
  );

  RETURN new_employee_id;
END
$$;

REVOKE ALL ON FUNCTION public.create_sales_advisor_employee(
  text, text, text, text, text, text, text, date
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_sales_advisor_employee(
  text, text, text, text, text, text, text, date
) TO authenticated;

COMMENT ON FUNCTION public.create_sales_advisor_employee(
  text, text, text, text, text, text, text, date
) IS 'Creates a canonical Employee and sales_advisor module assignment atomically using caller RLS.';
