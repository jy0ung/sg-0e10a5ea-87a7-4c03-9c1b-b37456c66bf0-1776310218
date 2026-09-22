-- Enforce canonical Department head ownership at the database boundary.
-- departments.head_employee_id must reference an Employee from the same company.

CREATE OR REPLACE FUNCTION public.enforce_department_head_employee_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  employee_company_id text;
BEGIN
  IF NEW.head_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.company_id
    INTO employee_company_id
    FROM public.employees e
   WHERE e.id = NEW.head_employee_id;

  IF employee_company_id IS NULL THEN
    RAISE EXCEPTION 'Department head Employee % does not exist', NEW.head_employee_id
      USING ERRCODE = '23503';
  END IF;

  IF employee_company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Department head Employee must belong to the same company as the Department'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_departments_head_employee_company ON public.departments;
CREATE TRIGGER trg_departments_head_employee_company
  BEFORE INSERT OR UPDATE OF head_employee_id, company_id
  ON public.departments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_department_head_employee_company();

REVOKE ALL ON FUNCTION public.enforce_department_head_employee_company() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.enforce_department_head_employee_company() IS
  'Rejects Department heads whose canonical Employee belongs to another company.';
