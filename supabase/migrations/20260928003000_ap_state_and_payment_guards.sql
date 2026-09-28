-- Keep AP state changes behind their audited commands. Service-role imports
-- remain available for controlled migration and reconciliation work.
CREATE OR REPLACE FUNCTION public.guard_purchase_invoice_state_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.lifecycle_status <> 'received'
       OR NEW.payment_status <> 'unpaid' OR NEW.paid_amount <> 0
       OR NEW.received_date IS NOT NULL THEN
      RAISE EXCEPTION 'Purchase invoice state must start pending; use domain commands for transitions';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.received_date IS DISTINCT FROM OLD.received_date
     OR NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
    RAISE EXCEPTION 'Purchase invoice state can only be changed by its domain command';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id IS DISTINCT FROM OLD.company_id
       OR (OLD.status = 'received' AND (
         NEW.invoice_no IS DISTINCT FROM OLD.invoice_no
         OR NEW.chassis_no IS DISTINCT FROM OLD.chassis_no
         OR NEW.model IS DISTINCT FROM OLD.model
       ))
       OR (OLD.lifecycle_status <> 'received' AND (
         NEW.supplier IS DISTINCT FROM OLD.supplier
         OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
         OR NEW.amount IS DISTINCT FROM OLD.amount
         OR NEW.po_line_id IS DISTINCT FROM OLD.po_line_id
       )) THEN
      RAISE EXCEPTION 'Received or verified invoice facts require a controlled correction';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_purchase_invoice_state_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_purchase_invoice_state_write ON public.purchase_invoices;
CREATE TRIGGER trg_guard_purchase_invoice_state_write
BEFORE INSERT OR UPDATE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_invoice_state_write();

CREATE OR REPLACE FUNCTION public.transition_pi_lifecycle(
  p_id uuid,
  p_target_status text,
  p_actor_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_company_id text;
  v_invoice public.purchase_invoices%ROWTYPE;
  v_match_status text;
BEGIN
  SELECT p.role, p.company_id INTO v_role, v_company_id
    FROM public.profiles p
   WHERE p.id = v_actor AND p.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active profile required for AP transition'; END IF;
  IF p_actor_id IS NOT NULL AND p_actor_id <> v_actor THEN
    RAISE EXCEPTION 'Lifecycle actor must be the signed-in user';
  END IF;

  SELECT pi.* INTO v_invoice
    FROM public.purchase_invoices pi
   WHERE pi.id = p_id AND pi.company_id = v_company_id
     AND (pi.is_deleted IS NULL OR pi.is_deleted = false)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase invoice not found in your company'; END IF;

  IF NOT (
    (v_invoice.lifecycle_status = 'received' AND p_target_status = 'verified') OR
    (v_invoice.lifecycle_status = 'verified' AND p_target_status = 'approved') OR
    (v_invoice.lifecycle_status = 'approved' AND p_target_status = 'scheduled') OR
    (v_invoice.lifecycle_status IN ('approved', 'scheduled') AND p_target_status = 'paid') OR
    (p_target_status = 'cancelled' AND v_invoice.lifecycle_status NOT IN ('paid', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid lifecycle transition: % to %', v_invoice.lifecycle_status, p_target_status;
  END IF;

  IF p_target_status = 'verified' AND v_role NOT IN
      ('super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'accounts')
     OR p_target_status = 'approved' AND v_role NOT IN
      ('super_admin', 'company_admin', 'director', 'general_manager')
     OR p_target_status IN ('scheduled', 'paid') AND v_role NOT IN
      ('super_admin', 'company_admin', 'director', 'general_manager', 'accounts')
     OR p_target_status = 'cancelled' AND v_role NOT IN
      ('super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'accounts') THEN
    RAISE EXCEPTION 'Not authorized for this AP transition';
  END IF;

  IF p_target_status <> 'cancelled' AND v_invoice.status <> 'received' THEN
    RAISE EXCEPTION 'Physical invoice receipt is required before AP verification';
  END IF;
  IF p_target_status = 'cancelled' AND v_invoice.paid_amount > 0 THEN
    RAISE EXCEPTION 'Reverse supplier payments before cancelling invoice';
  END IF;
  IF p_target_status = 'paid' AND v_invoice.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Invoice payment must be settled before marking AP paid';
  END IF;
  IF p_target_status = 'approved' AND v_invoice.po_line_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_order_lines pol
      JOIN public.purchase_orders po ON po.id = pol.purchase_order_id
      WHERE pol.id = v_invoice.po_line_id
        AND pol.company_id = v_invoice.company_id
        AND po.company_id = v_invoice.company_id
    ) THEN
      RAISE EXCEPTION 'Linked PO must belong to invoice company';
    END IF;
    SELECT m.match_status INTO v_match_status
      FROM public.get_three_way_match_status(v_invoice.company_id, v_invoice.id) m;
    IF v_match_status IS DISTINCT FROM 'matched' THEN
      RAISE EXCEPTION 'Linked PO, GRN and invoice must match before AP approval';
    END IF;
  END IF;

  UPDATE public.purchase_invoices
     SET lifecycle_status = p_target_status,
         verified_at = CASE WHEN p_target_status = 'verified' THEN now() ELSE verified_at END,
         verified_by = CASE WHEN p_target_status = 'verified' THEN v_actor ELSE verified_by END,
         approved_at = CASE WHEN p_target_status = 'approved' THEN now() ELSE approved_at END,
         approved_by = CASE WHEN p_target_status = 'approved' THEN v_actor ELSE approved_by END
   WHERE id = p_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'transition', 'purchase_invoice', p_id, 'purchase_invoices',
    pg_catalog.jsonb_build_object('before_lifecycle', v_invoice.lifecycle_status,
      'after_lifecycle', p_target_status));
  RETURN p_target_status;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_pi_lifecycle(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_pi_lifecycle(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_supplier_payment_event(
  p_purchase_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text DEFAULT NULL,
  p_reference_no text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_invoice public.purchase_invoices%ROWTYPE;
  v_event_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_actor AND p.status = 'active'
       AND p.role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'accounts')
  ) THEN RAISE EXCEPTION 'Not authorized to record supplier payments'; END IF;

  SELECT pi.* INTO v_invoice
    FROM public.purchase_invoices pi
   WHERE pi.id = p_purchase_invoice_id
     AND pi.company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = v_actor)
     AND (pi.is_deleted IS NULL OR pi.is_deleted = false)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase invoice not found in your company'; END IF;
  IF v_invoice.status <> 'received' OR v_invoice.lifecycle_status NOT IN ('approved', 'scheduled') THEN
    RAISE EXCEPTION 'Payment requires an approved or scheduled received invoice';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > v_invoice.amount - v_invoice.paid_amount THEN
    RAISE EXCEPTION 'Payment amount must be positive and within outstanding balance';
  END IF;
  IF p_payment_date IS NULL OR p_payment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Payment date must be recorded and cannot be in the future';
  END IF;

  INSERT INTO public.supplier_payment_events (
    company_id, purchase_invoice_id, event_type, amount, payment_date,
    payment_method, reference_no, notes, created_by
  ) VALUES (
    v_invoice.company_id, p_purchase_invoice_id, 'payment', p_amount, p_payment_date,
    p_payment_method, p_reference_no, p_notes, v_actor
  ) RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_supplier_payment_event(uuid, numeric, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment_event(uuid, numeric, date, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_supplier_payment_event(
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
  v_event public.supplier_payment_events%ROWTYPE;
  v_reversal_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_actor AND p.status = 'active'
       AND p.role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'accounts')
  ) THEN RAISE EXCEPTION 'Not authorized to reverse supplier payments'; END IF;

  SELECT spe.* INTO v_event FROM public.supplier_payment_events spe WHERE spe.id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier payment event not found'; END IF;
  -- All payment/reversal commands lock the invoice first, serializing both
  -- overpayment checks and duplicate reversal checks.
  PERFORM 1 FROM public.purchase_invoices pi
   WHERE pi.id = v_event.purchase_invoice_id
     AND pi.company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = v_actor)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier payment event not found in your company'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.purchase_invoices pi
     WHERE pi.id = v_event.purchase_invoice_id AND pi.lifecycle_status = 'paid'
  ) THEN RAISE EXCEPTION 'Paid invoices require a correction workflow before reversal'; END IF;
  SELECT spe.* INTO v_event FROM public.supplier_payment_events spe WHERE spe.id = p_event_id FOR UPDATE;
  IF v_event.event_type <> 'payment' THEN
    RAISE EXCEPTION 'Only payment events can be reversed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.supplier_payment_events r WHERE r.reversal_of_event_id = p_event_id) THEN
    RAISE EXCEPTION 'Supplier payment event is already reversed';
  END IF;

  INSERT INTO public.supplier_payment_events (
    company_id, purchase_invoice_id, event_type, amount, payment_date,
    notes, reversal_of_event_id, created_by
  ) VALUES (
    v_event.company_id, v_event.purchase_invoice_id, 'reversal', v_event.amount,
    CURRENT_DATE, p_reason, p_event_id, v_actor
  ) RETURNING id INTO v_reversal_id;
  RETURN v_reversal_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_supplier_payment_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_supplier_payment_event(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ap_aging_summary(p_company_id text)
RETURNS TABLE (
  bucket text,
  invoice_count int,
  total_outstanding numeric,
  overdue_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid() AND p.status = 'active' AND p.company_id = p_company_id
  ) THEN RAISE EXCEPTION 'Not authorized to read AP aging for this company'; END IF;

  RETURN QUERY
  SELECT sub.bucket, sub.invoice_count, sub.total_outstanding, sub.overdue_amount
  FROM (
    SELECT CASE
      WHEN pi.due_date IS NULL THEN 'no_due_date'
      WHEN pi.due_date >= CURRENT_DATE THEN 'current'
      WHEN pi.due_date >= CURRENT_DATE - INTERVAL '30 days' THEN '1_30_days'
      WHEN pi.due_date >= CURRENT_DATE - INTERVAL '60 days' THEN '31_60_days'
      WHEN pi.due_date >= CURRENT_DATE - INTERVAL '90 days' THEN '61_90_days'
      ELSE 'over_90_days' END AS bucket,
      count(*)::int AS invoice_count,
      sum(pi.amount - COALESCE(pi.paid_amount, 0)) AS total_outstanding,
      sum(CASE WHEN pi.due_date < CURRENT_DATE
        THEN pi.amount - COALESCE(pi.paid_amount, 0) ELSE 0 END) AS overdue_amount
    FROM public.purchase_invoices pi
    WHERE pi.company_id = p_company_id
      AND pi.payment_status <> 'paid' AND pi.is_deleted = false
    GROUP BY 1
  ) sub
  ORDER BY CASE sub.bucket
    WHEN 'no_due_date' THEN 0 WHEN 'current' THEN 1 WHEN '1_30_days' THEN 2
    WHEN '31_60_days' THEN 3 WHEN '61_90_days' THEN 4 ELSE 5 END;
END;
$$;
REVOKE ALL ON FUNCTION public.get_ap_aging_summary(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ap_aging_summary(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ap_aging_by_branch(p_company_id text)
RETURNS TABLE (
  branch_code text,
  bucket text,
  invoice_count int,
  total_outstanding numeric,
  overdue_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid() AND p.status = 'active' AND p.company_id = p_company_id
  ) THEN RAISE EXCEPTION 'Not authorized to read AP aging for this company'; END IF;

  RETURN QUERY
  SELECT sub.branch_code, sub.bucket, sub.invoice_count,
         sub.total_outstanding, sub.overdue_amount
  FROM (
    SELECT COALESCE(NULLIF(v.branch_code, ''), 'unassigned') AS branch_code,
      CASE
        WHEN pi.due_date IS NULL THEN 'no_due_date'
        WHEN pi.due_date >= CURRENT_DATE THEN 'current'
        WHEN pi.due_date >= CURRENT_DATE - INTERVAL '30 days' THEN '1_30_days'
        WHEN pi.due_date >= CURRENT_DATE - INTERVAL '60 days' THEN '31_60_days'
        WHEN pi.due_date >= CURRENT_DATE - INTERVAL '90 days' THEN '61_90_days'
        ELSE 'over_90_days' END AS bucket,
      count(*)::int AS invoice_count,
      sum(pi.amount - COALESCE(pi.paid_amount, 0)) AS total_outstanding,
      sum(CASE WHEN pi.due_date < CURRENT_DATE
        THEN pi.amount - COALESCE(pi.paid_amount, 0) ELSE 0 END) AS overdue_amount
    FROM public.purchase_invoices pi
    LEFT JOIN public.vehicles v
      ON v.chassis_no = pi.chassis_no AND v.company_id = pi.company_id
    WHERE pi.company_id = p_company_id
      AND pi.payment_status <> 'paid' AND pi.is_deleted = false
    GROUP BY 1, 2
  ) sub
  ORDER BY sub.branch_code, CASE sub.bucket
    WHEN 'no_due_date' THEN 0 WHEN 'current' THEN 1 WHEN '1_30_days' THEN 2
    WHEN '31_60_days' THEN 3 WHEN '61_90_days' THEN 4 ELSE 5 END;
END;
$$;
REVOKE ALL ON FUNCTION public.get_ap_aging_by_branch(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ap_aging_by_branch(text) TO authenticated;
