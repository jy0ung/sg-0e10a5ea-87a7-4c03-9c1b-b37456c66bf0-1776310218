-- Names remain display snapshots. Existing name-only targets have no deterministic
-- identity key and are intentionally NOT backfilled from a matching display name.
ALTER TABLE public.salesman_targets
  ADD COLUMN employee_id uuid REFERENCES public.employees(id) ON DELETE RESTRICT;

-- PostgreSQL truncated the original generated constraint name to 63 characters.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.salesman_targets'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (salesman_name, branch_code, period_year, period_month, company_id)'
  LOOP
    EXECUTE format('ALTER TABLE public.salesman_targets DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
CREATE UNIQUE INDEX salesman_targets_legacy_identity_key
  ON public.salesman_targets(company_id, salesman_name, branch_code, period_year, period_month)
  WHERE employee_id IS NULL;
ALTER TABLE public.salesman_targets ADD CONSTRAINT salesman_targets_employee_period_key
  UNIQUE(company_id, employee_id, branch_code, period_year, period_month);

CREATE OR REPLACE FUNCTION public.validate_salesman_target_employee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE employee_name text;
BEGIN
  IF NEW.employee_id IS NULL THEN
    -- Retain historical rows, but do not allow canonical identity to be erased.
    IF TG_OP = 'UPDATE' AND OLD.employee_id IS NOT NULL THEN
      RAISE EXCEPTION 'Canonical target Employee cannot be cleared' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT e.name INTO employee_name FROM public.employees e
    WHERE e.id = NEW.employee_id AND e.company_id = NEW.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target Employee must belong to the target company' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.company_id = NEW.company_id AND b.code = NEW.branch_code) THEN
    RAISE EXCEPTION 'Target Branch must belong to the target company' USING ERRCODE = '23514';
  END IF;
  IF NEW.target_units < 0 OR NEW.target_revenue < 0 THEN
    RAISE EXCEPTION 'Targets must be nonnegative' USING ERRCODE = '23514';
  END IF;
  NEW.salesman_name := employee_name;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_salesman_target_employee() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_salesman_target_employee
  BEFORE INSERT OR UPDATE ON public.salesman_targets
  FOR EACH ROW EXECUTE FUNCTION public.validate_salesman_target_employee();

-- Deletion uses the same company/role boundary as existing target writes.
CREATE POLICY salesman_targets_delete ON public.salesman_targets FOR DELETE TO authenticated
  USING (company_id = public.current_company_id()
    AND public.current_role() IN ('super_admin','company_admin','director','general_manager','manager'));

COMMENT ON COLUMN public.salesman_targets.employee_id IS
  'Canonical Employee identity; NULL means unresolved legacy target. Never infer from salesman_name.';

-- Preserve the existing booking-month/order-status business metric in this slice.
-- sales_orders.salesman_id references legacy sales_advisors, NOT profiles.
-- Resolve only unique same-company staff-code candidates, or existing canonical
-- ownership of the migrated Deal with the same source row ID. Never join names.
CREATE OR REPLACE FUNCTION public.salesman_actuals(p_company_id text, p_year integer, p_month integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
WITH orders AS (
  SELECT o.*, e.id AS employee_id, e.name AS employee_name
  FROM public.sales_orders o
  LEFT JOIN public.deals d ON d.id = o.id AND d.company_id = o.company_id
  LEFT JOIN public.sales_advisors sa ON sa.id = o.salesman_id AND sa.company_id = o.company_id
  LEFT JOIN LATERAL (
    SELECT (array_agg(candidate.id))[1] AS id
    FROM public.employees candidate
    WHERE candidate.company_id = o.company_id
      AND candidate.staff_code IS NOT NULL AND sa.code IS NOT NULL
      AND upper(btrim(sa.code)) = candidate.staff_code
    HAVING count(*) = 1
  ) matched ON d.sales_advisor_employee_id IS NULL
  LEFT JOIN public.employees e ON e.id = coalesce(d.sales_advisor_employee_id, matched.id)
    AND e.company_id = o.company_id
  WHERE o.company_id = p_company_id
    AND o.booking_date >= make_date(p_year, p_month, 1)
    AND o.booking_date < make_date(p_year, p_month, 1) + interval '1 month'
    AND o.is_deleted = false
), actuals AS (
  SELECT coalesce('employee:' || employee_id::text, 'order:' || id::text) AS identity_key,
    employee_id, branch_code,
    max(coalesce(employee_name, salesman_name, 'Unassigned')) AS salesman_name,
    count(*) AS total_deals,
    count(*) FILTER (WHERE lower(order_status) IN ('delivered','completed')) AS closed_deals,
    coalesce(sum(selling_price), 0) AS total_revenue
  FROM orders
  GROUP BY coalesce('employee:' || employee_id::text, 'order:' || id::text), employee_id, branch_code
), targets AS (
  SELECT * FROM public.salesman_targets
  WHERE company_id = p_company_id AND period_year = p_year AND period_month = p_month
), combined AS (
  SELECT coalesce(a.identity_key, 'employee:' || t.employee_id::text, 'target:' || t.id::text) AS identity_key,
    coalesce(a.employee_id, t.employee_id) AS employee_id,
    coalesce(a.branch_code, t.branch_code) AS branch_code,
    coalesce(a.salesman_name, t.salesman_name) AS salesman_name,
    coalesce(a.total_deals, 0) AS total_deals, coalesce(a.closed_deals, 0) AS closed_deals,
    coalesce(a.total_revenue, 0) AS total_revenue,
    t.target_units, t.target_revenue
  FROM actuals a FULL JOIN targets t
    ON t.employee_id = a.employee_id AND t.branch_code = a.branch_code
)
SELECT coalesce(jsonb_agg(to_jsonb(combined) ORDER BY total_deals DESC, identity_key, branch_code), '[]'::jsonb)
FROM combined;
$$;
REVOKE ALL ON FUNCTION public.salesman_actuals(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salesman_actuals(text, integer, integer) TO authenticated, service_role;
