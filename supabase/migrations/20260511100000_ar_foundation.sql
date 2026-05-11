-- ── Stage 4: Accounts Receivable Foundation ──────────────────────────────────
-- Adds:
--   • reconciliation_status, source_type, dms_collection_ref columns on invoices
--   • payment_events table (immutable append-only ledger)
--   • trigger to recompute paid_amount / payment_status from payment_events
--   • backfill: existing paid_amount > 0 → seeded payment_events
--   • record_payment_event()  — audited, company-scoped RPC
--   • reverse_payment_event() — reversal guard, company-scoped RPC
--   • get_payment_events()    — payment history for one invoice
--   • get_ar_aging_summary()  — server-side AR aging buckets
--   • RLS on payment_events (read: same-company; write: through RPCs only)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Extend invoices with AR/reconciliation metadata ──────────────────────────

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS reconciliation_status text
    NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending','reconciled','disputed','override')),
  ADD COLUMN IF NOT EXISTS source_type text
    NOT NULL DEFAULT 'ubs_local'
    CHECK (source_type IN ('ubs_local','dms_snapshot','legacy_backfill')),
  ADD COLUMN IF NOT EXISTS dms_collection_ref text;

-- 2. payment_events — immutable AR event log ──────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_events (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           text        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id           uuid        NOT NULL REFERENCES invoices(id)  ON DELETE CASCADE,
  event_type           text        NOT NULL
    CHECK (event_type IN ('payment','reversal','write_off','adjustment')),
  amount               numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date         date        NOT NULL,
  payment_method       text,
  receipt_reference    text,
  official_receipt_id  uuid        REFERENCES official_receipts(id),
  notes                text,
  reversal_of_event_id uuid        REFERENCES payment_events(id),
  created_by           uuid        REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- RLS: read same-company or global; no direct DML by authenticated users
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_events_tenant_select" ON payment_events
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- Block direct write; canonical path is through SECURITY DEFINER RPCs
REVOKE INSERT, UPDATE, DELETE ON payment_events FROM authenticated;

-- 3. Trigger: recompute invoice paid_amount / payment_status ──────────────────

CREATE OR REPLACE FUNCTION recompute_invoice_paid_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total  numeric;
  v_paid   numeric;
  v_status text;
BEGIN
  -- Sum active payment events:
  --   event_type = 'payment' AND not itself a reversal AND not yet reversed
  SELECT
    i.total_amount,
    COALESCE(SUM(
      CASE
        WHEN pe2.event_type = 'payment'
         AND pe2.reversal_of_event_id IS NULL
         AND NOT EXISTS (
               SELECT 1 FROM payment_events r
               WHERE r.reversal_of_event_id = pe2.id
             )
        THEN pe2.amount
        ELSE 0
      END
    ), 0)
  INTO v_total, v_paid
  FROM invoices i
  LEFT JOIN payment_events pe2 ON pe2.invoice_id = i.id
  WHERE i.id = NEW.invoice_id
  GROUP BY i.total_amount;

  v_status := CASE
    WHEN v_paid <= 0       THEN 'unpaid'
    WHEN v_paid >= v_total THEN 'paid'
    ELSE                        'partial'
  END;

  UPDATE invoices
     SET paid_amount    = v_paid,
         payment_status = v_status,
         updated_at     = now()
   WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_invoice_payment ON payment_events;
CREATE TRIGGER trg_recompute_invoice_payment
  AFTER INSERT ON payment_events
  FOR EACH ROW EXECUTE FUNCTION recompute_invoice_paid_status();

-- 4. Backfill: existing invoices with paid_amount > 0 → payment_events ────────

INSERT INTO payment_events (
  company_id, invoice_id, event_type, amount, payment_date,
  payment_method, notes, created_at
)
SELECT
  i.company_id,
  i.id,
  'payment',
  i.paid_amount,
  COALESCE(i.updated_at::date, i.created_at::date),
  'legacy_backfill',
  'Migrated from mutable paid_amount column (Stage 4 AR foundation)',
  COALESCE(i.updated_at, i.created_at)
FROM invoices i
WHERE i.paid_amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM payment_events pe WHERE pe.invoice_id = i.id
  );

-- 5. record_payment_event() ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_payment_event(
  p_invoice_id          uuid,
  p_amount              numeric,
  p_payment_date        date,
  p_payment_method      text    DEFAULT NULL,
  p_receipt_reference   text    DEFAULT NULL,
  p_official_receipt_id uuid    DEFAULT NULL,
  p_notes               text    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_id     text;
  v_caller_company text;
  v_event_id       uuid;
BEGIN
  SELECT company_id INTO v_company_id
    FROM invoices WHERE id = p_invoice_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  SELECT company_id INTO v_caller_company
    FROM profiles WHERE id = auth.uid();

  IF v_company_id <> v_caller_company THEN
    RAISE EXCEPTION 'Access denied: cross-company payment not permitted';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive, got %', p_amount;
  END IF;

  INSERT INTO payment_events (
    company_id, invoice_id, event_type, amount, payment_date,
    payment_method, receipt_reference, official_receipt_id, notes, created_by
  ) VALUES (
    v_company_id, p_invoice_id, 'payment', p_amount, p_payment_date,
    p_payment_method, p_receipt_reference, p_official_receipt_id, p_notes, auth.uid()
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_payment_event(uuid, numeric, date, text, text, uuid, text)
  TO authenticated;

-- 6. reverse_payment_event() ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reverse_payment_event(
  p_event_id uuid,
  p_reason   text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event          payment_events%ROWTYPE;
  v_caller_company text;
  v_reversal_id    uuid;
BEGIN
  SELECT * INTO v_event FROM payment_events WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment event not found: %', p_event_id;
  END IF;

  IF v_event.event_type <> 'payment' THEN
    RAISE EXCEPTION 'Only payment events can be reversed, got: %', v_event.event_type;
  END IF;

  IF v_event.reversal_of_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot reverse a reversal event';
  END IF;

  IF EXISTS (SELECT 1 FROM payment_events WHERE reversal_of_event_id = p_event_id) THEN
    RAISE EXCEPTION 'Payment event % is already reversed', p_event_id;
  END IF;

  SELECT company_id INTO v_caller_company
    FROM profiles WHERE id = auth.uid();

  IF v_event.company_id <> v_caller_company THEN
    RAISE EXCEPTION 'Access denied: cross-company reversal not permitted';
  END IF;

  INSERT INTO payment_events (
    company_id, invoice_id, event_type, amount, payment_date,
    notes, reversal_of_event_id, created_by
  ) VALUES (
    v_event.company_id, v_event.invoice_id, 'reversal', v_event.amount, CURRENT_DATE,
    p_reason, p_event_id, auth.uid()
  )
  RETURNING id INTO v_reversal_id;

  RETURN v_reversal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION reverse_payment_event(uuid, text)
  TO authenticated;

-- 7. get_payment_events() — payment history for one invoice ───────────────────

CREATE OR REPLACE FUNCTION get_payment_events(p_invoice_id uuid)
RETURNS TABLE (
  id                   uuid,
  event_type           text,
  amount               numeric,
  payment_date         date,
  payment_method       text,
  receipt_reference    text,
  notes                text,
  reversal_of_event_id uuid,
  is_reversed          boolean,
  created_by           uuid,
  created_at           timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    pe.id,
    pe.event_type,
    pe.amount,
    pe.payment_date,
    pe.payment_method,
    pe.receipt_reference,
    pe.notes,
    pe.reversal_of_event_id,
    EXISTS (SELECT 1 FROM payment_events r WHERE r.reversal_of_event_id = pe.id) AS is_reversed,
    pe.created_by,
    pe.created_at
  FROM payment_events pe
  WHERE pe.invoice_id = p_invoice_id
    -- Company-scope guard
    AND (SELECT company_id FROM invoices WHERE id = p_invoice_id)
        = (SELECT company_id FROM profiles WHERE id = auth.uid())
  ORDER BY pe.created_at;
$$;

GRANT EXECUTE ON FUNCTION get_payment_events(uuid)
  TO authenticated;

-- 8. get_ar_aging_summary() — server-side AR aging buckets ────────────────────

CREATE OR REPLACE FUNCTION get_ar_aging_summary(p_company_id text)
RETURNS TABLE (
  bucket            text,
  invoice_count     int,
  total_outstanding numeric,
  overdue_amount    numeric
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- Wrap in a subquery so ORDER BY can reference the alias 'bucket'
  SELECT sub.bucket, sub.invoice_count, sub.total_outstanding, sub.overdue_amount
  FROM (
    SELECT
      CASE
        WHEN i.due_date IS NULL                               THEN 'no_due_date'
        WHEN i.due_date >= CURRENT_DATE                       THEN 'current'
        WHEN i.due_date >= CURRENT_DATE - INTERVAL '30 days' THEN '1_30_days'
        WHEN i.due_date >= CURRENT_DATE - INTERVAL '60 days' THEN '31_60_days'
        WHEN i.due_date >= CURRENT_DATE - INTERVAL '90 days' THEN '61_90_days'
        ELSE                                                       'over_90_days'
      END                                              AS bucket,
      COUNT(*)::int                                    AS invoice_count,
      SUM(i.total_amount - COALESCE(i.paid_amount, 0)) AS total_outstanding,
      SUM(CASE
            WHEN i.due_date < CURRENT_DATE
            THEN i.total_amount - COALESCE(i.paid_amount, 0)
            ELSE 0
          END)                                         AS overdue_amount
    FROM invoices i
    WHERE i.company_id = p_company_id
      AND i.payment_status <> 'paid'
    GROUP BY 1
  ) sub
  ORDER BY
    CASE sub.bucket
      WHEN 'no_due_date'  THEN 0
      WHEN 'current'      THEN 1
      WHEN '1_30_days'    THEN 2
      WHEN '31_60_days'   THEN 3
      WHEN '61_90_days'   THEN 4
      WHEN 'over_90_days' THEN 5
    END;
$$;

GRANT EXECUTE ON FUNCTION get_ar_aging_summary(text)
  TO authenticated;

-- 9. Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_payment_events_invoice_id
  ON payment_events(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_company_id
  ON payment_events(company_id);

CREATE INDEX IF NOT EXISTS idx_invoices_ar_aging
  ON invoices(company_id, payment_status, due_date)
  WHERE payment_status <> 'paid';
