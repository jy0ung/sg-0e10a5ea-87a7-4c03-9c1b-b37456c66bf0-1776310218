-- Phase 3b.5: Period-close drilldown RPCs
-- Closing a period is risky if source documents (AR/AP payments) settled in
-- that period haven't been posted to the GL — the trial balance will lie.
-- These two RPCs let finance review the close-readiness of a period:
--
--   • get_period_close_summary  : aggregate KPIs (counts, totals, gaps)
--   • get_period_close_unposted : drilldown list of unposted source events
--
-- Both gate on caller company / global scope via SECURITY DEFINER.
--
-- "Unposted" = a payment_event or supplier_payment_event whose payment_date
-- falls inside the period but has no journal_entries row with
-- source_type ∈ ('ar_payment','ap_payment') AND source_id = pe.id.
-- Reversal events are excluded (they self-cancel via the AR/AP triggers,
-- not via a GL posting).

CREATE OR REPLACE FUNCTION get_period_close_summary(
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
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_start date;
  v_end   date;
  v_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
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
        AND spe.payment_date BETWEEN v_start AND v_end
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je3
           WHERE je3.source_type = 'ap_payment' AND je3.source_id = spe.id
        )),
    COALESCE((SELECT SUM(spe.amount)
       FROM supplier_payment_events spe
      WHERE spe.company_id   = p_company_id
        AND spe.event_type   = 'payment'
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

GRANT EXECUTE ON FUNCTION get_period_close_summary(text, uuid) TO authenticated;

-- Drilldown: the actual unposted source documents that the summary counts.
-- One row per event so finance can navigate to fix them.

CREATE OR REPLACE FUNCTION get_period_close_unposted(
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
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_start date;
  v_end   date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
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
     AND spe.payment_date BETWEEN v_start AND v_end
     AND NOT EXISTS (
       SELECT 1 FROM journal_entries je
        WHERE je.source_type = 'ap_payment' AND je.source_id = spe.id
     )
  ORDER BY 4 DESC, 1;  -- newest first, then by kind
END;
$$;

GRANT EXECUTE ON FUNCTION get_period_close_unposted(text, uuid) TO authenticated;
