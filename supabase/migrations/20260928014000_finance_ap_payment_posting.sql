-- Finance owns journal creation from an immutable AP payment event. Posting
-- and reversal share an advisory lock on the source event, so exactly one
-- outcome wins and the other command sees the committed state.
CREATE OR REPLACE FUNCTION public.post_ap_payment_to_gl(p_supplier_payment_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_payment public.supplier_payment_events%ROWTYPE;
  v_period_id uuid;
  v_ap_account uuid;
  v_cash_account uuid;
  v_journal_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ap-gl:' || p_supplier_payment_event_id::text, 0)
  );

  SELECT spe.* INTO v_payment
    FROM public.supplier_payment_events spe
   WHERE spe.id = p_supplier_payment_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier payment event not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_actor AND p.status = 'active'
       AND p.company_id = v_payment.company_id
       AND p.role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'accounts')
  ) THEN RAISE EXCEPTION 'Not authorized to post AP payments'; END IF;

  IF v_payment.event_type <> 'payment' THEN
    RAISE EXCEPTION 'Only supplier payment events can be posted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.supplier_payment_events reversal
     WHERE reversal.reversal_of_event_id = v_payment.id
  ) THEN RAISE EXCEPTION 'Reversed supplier payment cannot be posted'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_invoices pi
     WHERE pi.id = v_payment.purchase_invoice_id
       AND pi.company_id = v_payment.company_id
  ) THEN RAISE EXCEPTION 'Supplier payment invoice company mismatch'; END IF;

  SELECT je.id INTO v_journal_id
    FROM public.journal_entries je
   WHERE je.source_type = 'ap_payment' AND je.source_id = v_payment.id;
  IF FOUND THEN RETURN v_journal_id; END IF;

  SELECT ap.id INTO v_period_id
    FROM public.accounting_periods ap
   WHERE ap.company_id = v_payment.company_id
     AND ap.status = 'open'
     AND v_payment.payment_date BETWEEN ap.start_date AND ap.end_date
   ORDER BY ap.start_date DESC
   LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open accounting period covers supplier payment date'; END IF;

  SELECT a.id INTO v_ap_account FROM public.accounts a
   WHERE a.company_id = v_payment.company_id AND a.code = '2100'
     AND a.is_system AND a.is_active;
  SELECT a.id INTO v_cash_account FROM public.accounts a
   WHERE a.company_id = v_payment.company_id AND a.code = '1000'
     AND a.is_system AND a.is_active;
  IF v_ap_account IS NULL OR v_cash_account IS NULL THEN
    RAISE EXCEPTION 'Active AP and Cash system accounts are required';
  END IF;

  INSERT INTO public.journal_entries (
    company_id, period_id, entry_date, description, source_type, source_id, posted_by
  ) VALUES (
    v_payment.company_id, v_period_id, v_payment.payment_date,
    'AP Payment: ' || COALESCE(v_payment.reference_no, v_payment.id::text),
    'ap_payment', v_payment.id, v_actor
  ) RETURNING id INTO v_journal_id;
  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_journal_id, v_ap_account, v_payment.amount, 0),
         (v_journal_id, v_cash_account, 0, v_payment.amount);
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'post', 'journal_entry', v_journal_id, 'journal_entries',
    pg_catalog.jsonb_build_object('source_type', 'ap_payment',
      'source_id', v_payment.id, 'amount', v_payment.amount));
  RETURN v_journal_id;
END;
$$;
REVOKE ALL ON FUNCTION public.post_ap_payment_to_gl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_ap_payment_to_gl(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_posted_ap_payment_reversal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.event_type <> 'reversal' THEN RETURN NEW; END IF;
  IF NEW.reversal_of_event_id IS NULL THEN
    RAISE EXCEPTION 'Reversal must identify its supplier payment';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ap-gl:' || NEW.reversal_of_event_id::text, 0)
  );
  IF EXISTS (
    SELECT 1 FROM public.journal_entries je
     WHERE je.source_type = 'ap_payment' AND je.source_id = NEW.reversal_of_event_id
  ) THEN
    RAISE EXCEPTION 'Posted AP payment requires a Finance correction before reversal';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.supplier_payment_events prior
     WHERE prior.reversal_of_event_id = NEW.reversal_of_event_id
  ) THEN RAISE EXCEPTION 'Supplier payment is already reversed'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_posted_ap_payment_reversal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_posted_ap_payment_reversal ON public.supplier_payment_events;
CREATE TRIGGER trg_guard_posted_ap_payment_reversal
BEFORE INSERT ON public.supplier_payment_events
FOR EACH ROW EXECUTE FUNCTION public.guard_posted_ap_payment_reversal();

-- Reversed, unposted AP events have no net settlement to journalize.
CREATE OR REPLACE FUNCTION public.get_period_close_summary(
  p_company_id text,
  p_period_id  uuid
)
RETURNS TABLE (
  period_status                text,
  period_start_date            date,
  period_end_date              date,
  journal_entry_count          int,
  total_debit                  numeric,
  total_credit                 numeric,
  unposted_ar_payment_count    int,
  unposted_ar_payment_amount   numeric,
  unposted_ap_payment_count    int,
  unposted_ap_payment_amount   numeric,
  open_ar_invoice_count        int,
  open_ar_invoice_outstanding  numeric,
  open_ap_invoice_count        int,
  open_ap_invoice_outstanding  numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_start date;
  v_end   date;
  v_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND status = 'active'
       AND (company_id = p_company_id OR (role = 'super_admin' AND access_scope = 'global'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT start_date, end_date, status
    INTO v_start, v_end, v_status
    FROM accounting_periods
   WHERE id = p_period_id AND company_id = p_company_id;

  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Accounting period % not found for company %', p_period_id, p_company_id;
  END IF;

  RETURN QUERY
  SELECT
    v_status,
    v_start,
    v_end,
    -- journal totals for the period
    (SELECT COUNT(*)::int FROM journal_entries je
       WHERE je.company_id = p_company_id AND je.period_id = p_period_id),
    COALESCE((SELECT SUM(jel.debit)
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      WHERE je.company_id = p_company_id AND je.period_id = p_period_id), 0),
    COALESCE((SELECT SUM(jel.credit)
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      WHERE je.company_id = p_company_id AND je.period_id = p_period_id), 0),
    -- unposted AR payment events (settled in period, no GL entry)
    (SELECT COUNT(*)::int
       FROM payment_events pe
      WHERE pe.company_id   = p_company_id
        AND pe.event_type   = 'payment'
        AND pe.payment_date BETWEEN v_start AND v_end
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je2
           WHERE je2.source_type = 'ar_payment' AND je2.source_id = pe.id
        )),
    COALESCE((SELECT SUM(pe.amount)
       FROM payment_events pe
      WHERE pe.company_id   = p_company_id
        AND pe.event_type   = 'payment'
        AND pe.payment_date BETWEEN v_start AND v_end
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je2
           WHERE je2.source_type = 'ar_payment' AND je2.source_id = pe.id
        )), 0),
    -- unposted AP supplier payment events
    (SELECT COUNT(*)::int
       FROM supplier_payment_events spe
      WHERE spe.company_id   = p_company_id
        AND spe.event_type   = 'payment'
        AND NOT EXISTS (
          SELECT 1 FROM supplier_payment_events reversal
           WHERE reversal.reversal_of_event_id = spe.id
        )
        AND spe.payment_date BETWEEN v_start AND v_end
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je3
           WHERE je3.source_type = 'ap_payment' AND je3.source_id = spe.id
        )),
    COALESCE((SELECT SUM(spe.amount)
       FROM supplier_payment_events spe
      WHERE spe.company_id   = p_company_id
        AND spe.event_type   = 'payment'
        AND NOT EXISTS (
          SELECT 1 FROM supplier_payment_events reversal
           WHERE reversal.reversal_of_event_id = spe.id
        )
        AND spe.payment_date BETWEEN v_start AND v_end
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je3
           WHERE je3.source_type = 'ap_payment' AND je3.source_id = spe.id
        )), 0),
    -- open AR invoices with due dates inside the period
    (SELECT COUNT(*)::int FROM invoices i
       WHERE i.company_id     = p_company_id
         AND i.payment_status <> 'paid'
         AND i.due_date BETWEEN v_start AND v_end),
    COALESCE((SELECT SUM(i.total_amount - COALESCE(i.paid_amount, 0)) FROM invoices i
       WHERE i.company_id     = p_company_id
         AND i.payment_status <> 'paid'
         AND i.due_date BETWEEN v_start AND v_end), 0),
    -- open AP invoices with due dates inside the period
    (SELECT COUNT(*)::int FROM purchase_invoices pi
       WHERE pi.company_id     = p_company_id
         AND pi.payment_status <> 'paid'
         AND pi.is_deleted     = false
         AND pi.due_date BETWEEN v_start AND v_end),
    COALESCE((SELECT SUM(pi.amount - COALESCE(pi.paid_amount, 0)) FROM purchase_invoices pi
       WHERE pi.company_id     = p_company_id
         AND pi.payment_status <> 'paid'
         AND pi.is_deleted     = false
         AND pi.due_date BETWEEN v_start AND v_end), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_period_close_summary(text, uuid) TO authenticated;

-- Drilldown: the actual unposted source documents that the summary counts.
-- One row per event so finance can navigate to fix them.

CREATE OR REPLACE FUNCTION public.get_period_close_unposted(
  p_company_id text,
  p_period_id  uuid
)
RETURNS TABLE (
  kind          text,             -- 'ar_payment' | 'ap_payment'
  event_id      uuid,
  document_id   uuid,             -- invoice_id (AR) or purchase_invoice_id (AP)
  payment_date  date,
  amount        numeric,
  reference     text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_start date;
  v_end   date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND status = 'active'
       AND (company_id = p_company_id OR (role = 'super_admin' AND access_scope = 'global'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT start_date, end_date
    INTO v_start, v_end
    FROM accounting_periods
   WHERE id = p_period_id AND company_id = p_company_id;

  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Accounting period % not found for company %', p_period_id, p_company_id;
  END IF;

  RETURN QUERY
  SELECT 'ar_payment'::text         AS kind,
         pe.id                      AS event_id,
         pe.invoice_id              AS document_id,
         pe.payment_date,
         pe.amount,
         pe.receipt_reference       AS reference
    FROM payment_events pe
   WHERE pe.company_id   = p_company_id
     AND pe.event_type   = 'payment'
     AND pe.payment_date BETWEEN v_start AND v_end
     AND NOT EXISTS (
       SELECT 1 FROM journal_entries je
        WHERE je.source_type = 'ar_payment' AND je.source_id = pe.id
     )
  UNION ALL
  SELECT 'ap_payment'::text         AS kind,
         spe.id                     AS event_id,
         spe.purchase_invoice_id    AS document_id,
         spe.payment_date,
         spe.amount,
         spe.reference_no           AS reference
    FROM supplier_payment_events spe
   WHERE spe.company_id   = p_company_id
     AND spe.event_type   = 'payment'
        AND NOT EXISTS (
          SELECT 1 FROM supplier_payment_events reversal
           WHERE reversal.reversal_of_event_id = spe.id
        )
     AND spe.payment_date BETWEEN v_start AND v_end
     AND NOT EXISTS (
       SELECT 1 FROM journal_entries je
        WHERE je.source_type = 'ap_payment' AND je.source_id = spe.id
     )
  ORDER BY 4 DESC, 1;  -- newest first, then by kind
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_period_close_unposted(text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_period_close_summary(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_period_close_unposted(text, uuid) FROM PUBLIC, anon;
