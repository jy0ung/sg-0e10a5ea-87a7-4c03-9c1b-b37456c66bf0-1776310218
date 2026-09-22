-- Add canonical Employee-backed sales ownership to Deals without removing
-- the historical Profile/login ownership field.
--
-- Canonical person identity: employees.id
-- Compatibility account identity: deals.sales_advisor_id -> profiles.id

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS sales_advisor_employee_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deals_sales_advisor_employee_id_fkey'
      AND conrelid = 'public.deals'::regclass
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_sales_advisor_employee_id_fkey
      FOREIGN KEY (sales_advisor_employee_id)
      REFERENCES public.employees(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_deals_sales_advisor_employee
  ON public.deals (sales_advisor_employee_id, company_id);

CREATE OR REPLACE FUNCTION public.enforce_deal_sales_advisor_employee_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  employee_company_id text;
BEGIN
  IF NEW.sales_advisor_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.company_id
    INTO employee_company_id
    FROM public.employees e
   WHERE e.id = NEW.sales_advisor_employee_id;

  IF employee_company_id IS NULL THEN
    RAISE EXCEPTION 'Sales advisor employee % does not exist', NEW.sales_advisor_employee_id
      USING ERRCODE = '23503';
  END IF;

  IF employee_company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Sales advisor employee must belong to the same company as the deal'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_deals_sales_advisor_employee_company ON public.deals;
CREATE TRIGGER trg_deals_sales_advisor_employee_company
  BEFORE INSERT OR UPDATE OF sales_advisor_employee_id, company_id
  ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_deal_sales_advisor_employee_company();

-- Deterministic compatibility backfill only. Do not use name/email/NRIC guesses.
UPDATE public.deals d
SET sales_advisor_employee_id = p.employee_id
FROM public.profiles p
WHERE d.sales_advisor_employee_id IS NULL
  AND d.sales_advisor_id = p.id
  AND p.employee_id IS NOT NULL
  AND p.company_id = d.company_id;

COMMENT ON COLUMN public.deals.sales_advisor_employee_id IS
  'Canonical workforce owner for the Deal. sales_advisor_id remains a temporary Profile/login compatibility reference.';

COMMENT ON FUNCTION public.enforce_deal_sales_advisor_employee_company() IS
  'Rejects Deal ownership that references an Employee from another company.';
