-- Accounts owns customer settlement; invoice payment state is derived from events.
CREATE OR REPLACE FUNCTION public.guard_invoice_payment_state_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.paid_amount <> 0 OR NEW.payment_status <> 'unpaid' THEN
      RAISE EXCEPTION 'Invoice payment state must start unpaid; record a payment event';
    END IF;
  ELSIF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR (OLD.paid_amount > 0 AND (
       NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
     )) THEN
    RAISE EXCEPTION 'Invoice payment state and settled amounts require domain commands';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_invoice_payment_state_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_invoice_payment_state_write ON public.invoices;
CREATE TRIGGER trg_guard_invoice_payment_state_write
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_payment_state_write();

CREATE OR REPLACE FUNCTION public.record_payment_event(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text DEFAULT NULL,
  p_receipt_reference text DEFAULT NULL,
  p_official_receipt_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company_id text;
  v_invoice public.invoices%ROWTYPE;
  v_event_id uuid;
BEGIN
  SELECT p.company_id INTO v_company_id
    FROM public.profiles p
   WHERE p.id = v_actor AND p.status = 'active'
     AND p.role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'accounts');
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized to record customer payments'; END IF;

  -- Serialize payments and reversals through the same invoice row. The
  -- recompute trigger updates this row before the lock is released.
  SELECT i.* INTO v_invoice
    FROM public.invoices i
   WHERE i.id = p_invoice_id AND i.company_id = v_company_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found in your company'; END IF;
  IF p_amount IS NULL OR p_amount <= 0
     OR p_amount > v_invoice.total_amount - v_invoice.paid_amount THEN
    RAISE EXCEPTION 'Payment amount must be positive and within outstanding balance';
  END IF;
  IF p_payment_date IS NULL OR p_payment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Payment date must be recorded and cannot be in the future';
  END IF;
  IF p_official_receipt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.official_receipts receipt
     WHERE receipt.id = p_official_receipt_id AND receipt.company_id = v_company_id
  ) THEN RAISE EXCEPTION 'Official receipt not found in your company'; END IF;

  INSERT INTO public.payment_events (
    company_id, invoice_id, event_type, amount, payment_date, payment_method,
    receipt_reference, official_receipt_id, notes, created_by
  ) VALUES (
    v_company_id, p_invoice_id, 'payment', p_amount, p_payment_date,
    p_payment_method, p_receipt_reference, p_official_receipt_id, p_notes, v_actor
  ) RETURNING id INTO v_event_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'record', 'payment_event', v_event_id, 'payment_events',
    pg_catalog.jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount));
  RETURN v_event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_payment_event(uuid, numeric, date, text, text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payment_event(uuid, numeric, date, text, text, uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_payment_event(
  p_event_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company_id text;
  v_event public.payment_events%ROWTYPE;
  v_reversal_id uuid;
BEGIN
  SELECT p.company_id INTO v_company_id
    FROM public.profiles p
   WHERE p.id = v_actor AND p.status = 'active'
     AND p.role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'accounts');
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized to reverse customer payments'; END IF;
  SELECT pe.* INTO v_event FROM public.payment_events pe WHERE pe.id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer payment event not found'; END IF;
  PERFORM 1 FROM public.invoices i
   WHERE i.id = v_event.invoice_id AND i.company_id = v_company_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer payment event not found in your company'; END IF;
  SELECT pe.* INTO v_event FROM public.payment_events pe WHERE pe.id = p_event_id FOR UPDATE;
  IF v_event.event_type <> 'payment' THEN
    RAISE EXCEPTION 'Only customer payment events can be reversed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_events reversal
     WHERE reversal.reversal_of_event_id = p_event_id
  ) THEN RAISE EXCEPTION 'Customer payment event is already reversed'; END IF;

  INSERT INTO public.payment_events (
    company_id, invoice_id, event_type, amount, payment_date,
    notes, reversal_of_event_id, created_by
  ) VALUES (
    v_company_id, v_event.invoice_id, 'reversal', v_event.amount,
    CURRENT_DATE, p_reason, p_event_id, v_actor
  ) RETURNING id INTO v_reversal_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'reverse', 'payment_event', v_reversal_id, 'payment_events',
    pg_catalog.jsonb_build_object('reversal_of_event_id', p_event_id, 'reason', p_reason));
  RETURN v_reversal_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_payment_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_payment_event(uuid, text) TO authenticated;
