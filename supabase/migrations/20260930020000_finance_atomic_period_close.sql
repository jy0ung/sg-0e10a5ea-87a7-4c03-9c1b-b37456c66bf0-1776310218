-- Finance owns period transitions. A browser may create an open period, but
-- cannot assert readiness or write status/closure metadata directly.
REVOKE INSERT, UPDATE, DELETE ON public.accounting_periods FROM PUBLIC, anon, authenticated;
GRANT INSERT (company_id, name, period_year, period_month, start_date, end_date)
  ON public.accounting_periods TO authenticated;

CREATE OR REPLACE FUNCTION public.close_accounting_period(p_period_id uuid)
RETURNS public.accounting_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_period public.accounting_periods%ROWTYPE;
  v_readiness record;
BEGIN
  -- Posting RPCs lock this same row before writing journals. Source payment
  -- inserts also lock it, so readiness and the transition share a boundary.
  SELECT ap.* INTO v_period
    FROM public.accounting_periods ap
    JOIN public.profiles p ON p.id = v_actor
   WHERE ap.id = p_period_id
     AND p.status = 'active'
     AND p.company_id = ap.company_id
     AND p.role IN ('super_admin', 'company_admin', 'accounts')
   FOR UPDATE OF ap;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounting period not found or close not authorized'; END IF;
  IF v_period.status = 'closed' THEN RAISE EXCEPTION 'Accounting period is already closed'; END IF;
  IF v_period.status <> 'open' THEN RAISE EXCEPTION 'Only an open accounting period can be closed'; END IF;

  SELECT * INTO v_readiness
    FROM public.get_period_close_summary(v_period.company_id, v_period.id);
  IF v_readiness.unposted_ar_payment_count > 0
     OR v_readiness.unposted_ap_payment_count > 0 THEN
    RAISE EXCEPTION 'Accounting period has unposted payments (AR: %, AP: %)',
      v_readiness.unposted_ar_payment_count, v_readiness.unposted_ap_payment_count;
  END IF;
  IF v_readiness.total_debit IS DISTINCT FROM v_readiness.total_credit THEN
    RAISE EXCEPTION 'Accounting period journals are unbalanced';
  END IF;

  UPDATE public.accounting_periods
     SET status = 'closed', closed_at = now(), closed_by = v_actor,
         updated_at = now()
   WHERE id = v_period.id
   RETURNING * INTO v_period;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'close', 'accounting_period', v_period.id, 'accounting_periods',
    pg_catalog.jsonb_build_object(
      'period_id', v_period.id, 'company_id', v_period.company_id,
      'previous_status', 'open', 'new_status', 'closed',
      'journal_count', v_readiness.journal_entry_count,
      'total_debit', v_readiness.total_debit,
      'total_credit', v_readiness.total_credit,
      'unposted_ar_count', v_readiness.unposted_ar_payment_count,
      'unposted_ap_count', v_readiness.unposted_ap_payment_count,
      'closed_by', v_actor, 'closed_at', v_period.closed_at));
  RETURN v_period;
END;
$$;
REVOKE ALL ON FUNCTION public.close_accounting_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_accounting_period(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.lock_accounting_period(p_period_id uuid)
RETURNS public.accounting_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_period public.accounting_periods%ROWTYPE;
BEGIN
  SELECT ap.* INTO v_period
    FROM public.accounting_periods ap
    JOIN public.profiles p ON p.id = v_actor
   WHERE ap.id = p_period_id
     AND p.status = 'active'
     AND p.company_id = ap.company_id
     AND p.role IN ('super_admin', 'company_admin', 'accounts')
   FOR UPDATE OF ap;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounting period not found or lock not authorized'; END IF;
  IF v_period.status <> 'closed' THEN RAISE EXCEPTION 'Only a closed accounting period can be locked'; END IF;

  UPDATE public.accounting_periods SET status = 'locked', updated_at = now()
   WHERE id = v_period.id RETURNING * INTO v_period;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'lock', 'accounting_period', v_period.id, 'accounting_periods',
    pg_catalog.jsonb_build_object('previous_status', 'closed', 'new_status', 'locked'));
  RETURN v_period;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_accounting_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_accounting_period(uuid) TO authenticated;

-- An Accounts settlement created after close would otherwise change AR/AP
-- while Finance can no longer post it. Lock the covering period before each
-- payment insert; a concurrent close must then see the new event or finish
-- first and cause this insert to fail. Reversals remain available for the
-- reviewed correction commands and do not create new source settlements.
CREATE OR REPLACE FUNCTION public.guard_payment_period_open()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.event_type <> 'payment' THEN RETURN NEW; END IF;
  SELECT ap.status INTO v_status
    FROM public.accounting_periods ap
   WHERE ap.company_id = NEW.company_id
     AND NEW.payment_date BETWEEN ap.start_date AND ap.end_date
   ORDER BY CASE WHEN ap.status = 'open' THEN 1 ELSE 0 END, ap.start_date DESC
   LIMIT 1 FOR UPDATE;
  IF FOUND AND v_status <> 'open' THEN
    RAISE EXCEPTION 'Payment date belongs to a closed or locked accounting period';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_payment_period_open() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_ar_payment_period_open
BEFORE INSERT ON public.payment_events
FOR EACH ROW EXECUTE FUNCTION public.guard_payment_period_open();
CREATE TRIGGER trg_guard_ap_payment_period_open
BEFORE INSERT ON public.supplier_payment_events
FOR EACH ROW EXECUTE FUNCTION public.guard_payment_period_open();

NOTIFY pgrst, 'reload schema';
