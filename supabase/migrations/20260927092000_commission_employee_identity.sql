-- Commission owns its rule/earning records. Keep name-only historical rows
-- visible for review; a matching display name is never identity evidence.
ALTER TABLE public.commission_rules
  ADD COLUMN employee_id uuid REFERENCES public.employees(id) ON DELETE RESTRICT;
ALTER TABLE public.commission_records
  ADD COLUMN employee_id uuid REFERENCES public.employees(id) ON DELETE RESTRICT;

CREATE INDEX commission_rules_company_employee_idx
  ON public.commission_rules(company_id, employee_id);
CREATE INDEX commission_records_company_employee_period_idx
  ON public.commission_records(company_id, employee_id, period);

CREATE OR REPLACE FUNCTION public.validate_commission_employee_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE canonical_name text;
BEGIN
  IF TG_TABLE_NAME = 'commission_rules' THEN
    IF NEW.branch_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.branches b
                        WHERE b.company_id = NEW.company_id AND b.code = NEW.branch_code) THEN
      RAISE EXCEPTION 'Commission Branch must belong to the record company'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.employee_id IS NOT NULL
     AND NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    RAISE EXCEPTION 'Commission Employee identity cannot be changed or cleared'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'commission_records' THEN
    IF NEW.rule_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.commission_rules r
       WHERE r.id = NEW.rule_id AND r.company_id = NEW.company_id
         AND (r.employee_id IS NULL OR r.employee_id = NEW.employee_id)
         AND (r.employee_id IS NOT NULL OR r.salesman_name IS NULL)
    ) THEN
      RAISE EXCEPTION 'Commission Rule must be canonical and belong to the record company'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.vehicle_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.vehicles v
      JOIN public.profiles p ON p.id = v.salesman_id AND p.company_id = v.company_id
       WHERE v.id = NEW.vehicle_id AND v.company_id = NEW.company_id
         AND p.employee_id = NEW.employee_id
    ) THEN
      RAISE EXCEPTION 'Commission Vehicle must belong to the Employee and company'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT e.name INTO canonical_name
    FROM public.employees e
   WHERE e.id = NEW.employee_id AND e.company_id = NEW.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commission Employee must belong to the record company'
      USING ERRCODE = '23514';
  END IF;

  -- The legacy name remains a display snapshot, never a lookup key.
  NEW.salesman_name := canonical_name;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_commission_employee_identity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_commission_rule_employee
  BEFORE INSERT OR UPDATE OF employee_id, company_id, salesman_name, branch_code
  ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.validate_commission_employee_identity();
CREATE TRIGGER validate_commission_record_employee
  BEFORE INSERT OR UPDATE OF employee_id, company_id, salesman_name, rule_id, vehicle_id
  ON public.commission_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_commission_employee_identity();

COMMENT ON COLUMN public.commission_rules.employee_id IS
  'Canonical Employee scope. NULL with a nonblank salesman_name is unresolved legacy; NULL with no name applies to all advisors.';
COMMENT ON COLUMN public.commission_records.employee_id IS
  'Canonical earning owner. NULL means historical or unresolved; never infer from salesman_name.';
