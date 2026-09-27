-- Commission alone creates and advances canonical earnings. Historical
-- name-only rows remain readable; they cannot be paid through these commands.
ALTER TABLE public.commission_records
  ADD COLUMN calculation_key text,
  ADD COLUMN source_snapshot jsonb,
  ADD COLUMN calculated_at timestamptz,
  ADD COLUMN calculated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX commission_records_calculation_key_unique
  ON public.commission_records(calculation_key)
  WHERE calculation_key IS NOT NULL;

DROP POLICY "commission_records_insert" ON public.commission_records;
DROP POLICY "commission_records_update" ON public.commission_records;

CREATE OR REPLACE FUNCTION public.guard_calculated_commission_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.calculation_key IS NOT NULL AND (
    NEW.calculation_key IS DISTINCT FROM OLD.calculation_key OR
    NEW.company_id IS DISTINCT FROM OLD.company_id OR
    NEW.employee_id IS DISTINCT FROM OLD.employee_id OR
    NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id OR
    NEW.rule_id IS DISTINCT FROM OLD.rule_id OR
    NEW.period IS DISTINCT FROM OLD.period OR
    NEW.amount IS DISTINCT FROM OLD.amount OR
    NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot OR
    NEW.calculated_at IS DISTINCT FROM OLD.calculated_at OR
    NEW.calculated_by IS DISTINCT FROM OLD.calculated_by
  ) THEN
    RAISE EXCEPTION 'Calculated commission source and amount are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_calculated_commission_record() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_calculated_commission_record
  BEFORE UPDATE ON public.commission_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_calculated_commission_record();

CREATE OR REPLACE FUNCTION public.calculate_commissions(p_company_id text, p_period text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_company text;
  actor_role text;
  period_start date;
  period_end date;
  created_count integer;
BEGIN
  SELECT p.company_id, p.role INTO actor_company, actor_role
    FROM public.profiles p WHERE p.id = actor_id;
  IF actor_id IS NULL OR p_company_id IS NULL OR actor_company IS DISTINCT FROM p_company_id
     OR actor_role IS NULL
     OR actor_role NOT IN ('super_admin','company_admin','director','general_manager') THEN
    RAISE EXCEPTION 'Commission calculation is not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_period IS NULL OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Commission period must be YYYY-MM' USING ERRCODE = '22023';
  END IF;
  period_start := make_date(left(p_period,4)::integer, right(p_period,2)::integer, 1);
  period_end := (period_start + interval '1 month')::date;

  WITH created AS (
    INSERT INTO public.commission_records (
      company_id, employee_id, vehicle_id, chassis_no, salesman_name,
      rule_id, status, amount, period, calculation_key, source_snapshot,
      calculated_at, calculated_by
    )
    SELECT v.company_id, e.id, v.id, v.chassis_no, e.name,
      r.id, 'pending', r.amount, p_period,
      v.id::text || ':' || r.id::text,
      jsonb_build_object(
        'rule_id', r.id, 'rule_name', r.rule_name, 'rule_updated_at', r.updated_at,
        'rule_employee_id', r.employee_id, 'rule_branch_code', r.branch_code,
        'threshold_days', r.threshold_days, 'amount', r.amount,
        'vehicle_id', v.id, 'chassis_no', v.chassis_no,
        'delivery_date', v.delivery_date, 'bg_to_delivery', v.bg_to_delivery,
        'branch_code', v.branch_code, 'employee_id', e.id
      ), now(), actor_id
    FROM public.vehicles v
    JOIN public.profiles owner_profile
      ON owner_profile.id = v.salesman_id AND owner_profile.company_id = v.company_id
    JOIN public.employees e
      ON e.id = owner_profile.employee_id AND e.company_id = v.company_id
    JOIN public.commission_rules r ON r.company_id = v.company_id
      AND (r.employee_id = e.id OR (r.employee_id IS NULL AND r.salesman_name IS NULL))
      AND (r.branch_code IS NULL OR r.branch_code = v.branch_code)
      AND (r.threshold_days IS NULL OR
        (v.bg_to_delivery IS NOT NULL AND v.bg_to_delivery >= 0 AND v.bg_to_delivery <= r.threshold_days))
    WHERE v.company_id = p_company_id
      AND v.is_deleted = false AND v.deleted_at IS NULL
      AND v.delivery_date >= period_start AND v.delivery_date < period_end
    ON CONFLICT DO NOTHING
    RETURNING id, company_id, employee_id, vehicle_id, rule_id, amount, period
  )
  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, table_name, changes)
  SELECT actor_id, 'create', 'commission_record', id, 'commission_records',
    jsonb_build_object('company_id', company_id, 'employee_id', employee_id,
      'vehicle_id', vehicle_id, 'rule_id', rule_id, 'amount', amount, 'period', period)
  FROM created;
  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END $$;
REVOKE ALL ON FUNCTION public.calculate_commissions(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_commissions(text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.advance_commission_record(
  p_company_id text, p_record_id uuid, p_expected_status text, p_next_status text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_company text;
  actor_role text;
  changed public.commission_records%ROWTYPE;
BEGIN
  SELECT p.company_id, p.role INTO actor_company, actor_role
    FROM public.profiles p WHERE p.id = actor_id;
  IF actor_id IS NULL OR p_company_id IS NULL OR actor_company IS DISTINCT FROM p_company_id
     OR actor_role IS NULL
     OR actor_role NOT IN ('super_admin','company_admin','director','general_manager') THEN
    RAISE EXCEPTION 'Commission transition is not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT ((p_expected_status = 'pending' AND p_next_status = 'approved') OR
          (p_expected_status = 'approved' AND p_next_status = 'paid')) THEN
    RAISE EXCEPTION 'Invalid commission transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.commission_records
     SET status = p_next_status, updated_at = now()
   WHERE id = p_record_id AND company_id = p_company_id
     AND status = p_expected_status AND employee_id IS NOT NULL
     AND calculation_key IS NOT NULL
   RETURNING * INTO changed;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commission record is missing, unresolved or changed by another reviewer'
      USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (actor_id, 'update', 'commission_record', changed.id, 'commission_records',
    jsonb_build_object('company_id', p_company_id, 'from', p_expected_status, 'to', p_next_status));
END $$;
REVOKE ALL ON FUNCTION public.advance_commission_record(text,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_commission_record(text,uuid,text,text) TO authenticated, service_role;
