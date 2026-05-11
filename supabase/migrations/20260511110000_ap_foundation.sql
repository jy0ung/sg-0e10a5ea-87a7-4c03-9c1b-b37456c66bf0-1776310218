-- ── Stage 5: Accounts Payable Foundation ──────────────────────────────────────
-- Adds:
--   • lifecycle_status, payment_status, paid_amount, due_date, notes,
--     verified_at/verified_by, approved_at/approved_by columns on purchase_invoices
--   • supplier_payment_events table (immutable append-only ledger)
--   • trigger to recompute paid_amount / payment_status from supplier_payment_events
--   • record_supplier_payment_event()  — audited, lifecycle-gated, company-scoped RPC
--   • reverse_supplier_payment_event() — reversal guard, company-scoped RPC
--   • get_supplier_payment_events()    — payment history for one purchase invoice
--   • get_ap_aging_summary()           — server-side AP aging buckets
--   • transition_pi_lifecycle()        — validated lifecycle state machine
--   • RLS on supplier_payment_events (read: same-company; write: through RPCs only)
--
-- NOTE: existing `status` column (pending|received|cancelled) is preserved
--       unchanged so businessReportService and fetchChassisCostMap() are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Extend purchase_invoices with AP lifecycle / payment metadata ─────────────

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS lifecycle_status text
    NOT NULL DEFAULT 'received'
    CHECK (lifecycle_status IN ('received','verified','approved','scheduled','paid','cancelled')),
  ADD COLUMN IF NOT EXISTS payment_status text
    NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','partial','paid')),
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

-- Backfill: existing 'received' purchase invoices start in 'received' lifecycle
-- (default already covers this; explicit update for clarity)
UPDATE purchase_invoices
   SET lifecycle_status = 'received'
 WHERE lifecycle_status = 'received';  -- no-op; validates constraint

-- 2. supplier_payment_events — immutable AP event log ─────────────────────────

CREATE TABLE IF NOT EXISTS supplier_payment_events (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           text          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchase_invoice_id  uuid          NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  event_type           text          NOT NULL
    CHECK (event_type IN ('payment','reversal','write_off','adjustment')),
  amount               numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date         date          NOT NULL,
  payment_method       text,
  reference_no         text,
  notes                text,
  reversal_of_event_id uuid          REFERENCES supplier_payment_events(id),
  created_by           uuid          REFERENCES auth.users(id),
  created_at           timestamptz   NOT NULL DEFAULT now()
);

-- RLS: read same-company; no direct DML by authenticated users
ALTER TABLE supplier_payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spe_tenant_select" ON supplier_payment_events
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- Block direct write; canonical path is through SECURITY DEFINER RPCs
REVOKE INSERT, UPDATE, DELETE ON supplier_payment_events FROM authenticated;

-- 3. Trigger: recompute purchase_invoices paid_amount / payment_status ─────────

CREATE OR REPLACE FUNCTION recompute_pi_payment_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total  numeric;
  v_paid   numeric;
  v_status text;
BEGIN
  -- Sum active payment events:
  --   event_type = 'payment' AND not itself a reversal AND not yet reversed
  SELECT
    pi.amount,
    COALESCE(SUM(
      CASE
        WHEN spe2.event_type = 'payment'
         AND spe2.reversal_of_event_id IS NULL
         AND NOT EXISTS (
               SELECT 1 FROM supplier_payment_events r
               WHERE r.reversal_of_event_id = spe2.id
             )
        THEN spe2.amount
        ELSE 0
      END
    ), 0)
  INTO v_total, v_paid
  FROM purchase_invoices pi
  LEFT JOIN supplier_payment_events spe2 ON spe2.purchase_invoice_id = pi.id
  WHERE pi.id = NEW.purchase_invoice_id
  GROUP BY pi.amount;

  v_status := CASE
    WHEN v_paid <= 0       THEN 'unpaid'
    WHEN v_paid >= v_total THEN 'paid'
    ELSE                        'partial'
  END;

  UPDATE purchase_invoices
     SET paid_amount    = v_paid,
         payment_status = v_status
   WHERE id = NEW.purchase_invoice_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_pi_payment ON supplier_payment_events;
CREATE TRIGGER trg_recompute_pi_payment
  AFTER INSERT ON supplier_payment_events
  FOR EACH ROW EXECUTE FUNCTION recompute_pi_payment_status();

-- 4. record_supplier_payment_event() ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_supplier_payment_event(
  p_purchase_invoice_id uuid,
  p_amount              numeric,
  p_payment_date        date,
  p_payment_method      text    DEFAULT NULL,
  p_reference_no        text    DEFAULT NULL,
  p_notes               text    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_id      text;
  v_lifecycle       text;
  v_caller_company  text;
  v_event_id        uuid;
BEGIN
  SELECT company_id, lifecycle_status
    INTO v_company_id, v_lifecycle
    FROM purchase_invoices
   WHERE id = p_purchase_invoice_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Purchase invoice not found: %', p_purchase_invoice_id;
  END IF;

  SELECT company_id INTO v_caller_company
    FROM profiles WHERE id = auth.uid();

  IF v_company_id <> v_caller_company THEN
    RAISE EXCEPTION 'Access denied: cross-company payment not permitted';
  END IF;

  IF v_lifecycle <> 'approved' AND v_lifecycle <> 'scheduled' THEN
    RAISE EXCEPTION 'Payment can only be recorded for approved or scheduled invoices, current lifecycle_status: %', v_lifecycle;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive, got %', p_amount;
  END IF;

  INSERT INTO supplier_payment_events (
    company_id, purchase_invoice_id, event_type, amount, payment_date,
    payment_method, reference_no, notes, created_by
  ) VALUES (
    v_company_id, p_purchase_invoice_id, 'payment', p_amount, p_payment_date,
    p_payment_method, p_reference_no, p_notes, auth.uid()
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_supplier_payment_event(uuid, numeric, date, text, text, text)
  TO authenticated;

-- 5. reverse_supplier_payment_event() ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION reverse_supplier_payment_event(
  p_event_id uuid,
  p_reason   text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event          supplier_payment_events%ROWTYPE;
  v_caller_company text;
  v_reversal_id    uuid;
BEGIN
  SELECT * INTO v_event FROM supplier_payment_events WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier payment event not found: %', p_event_id;
  END IF;

  IF v_event.event_type <> 'payment' THEN
    RAISE EXCEPTION 'Only payment events can be reversed, got: %', v_event.event_type;
  END IF;

  IF v_event.reversal_of_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot reverse a reversal event';
  END IF;

  IF EXISTS (SELECT 1 FROM supplier_payment_events WHERE reversal_of_event_id = p_event_id) THEN
    RAISE EXCEPTION 'Supplier payment event % is already reversed', p_event_id;
  END IF;

  SELECT company_id INTO v_caller_company
    FROM profiles WHERE id = auth.uid();

  IF v_event.company_id <> v_caller_company THEN
    RAISE EXCEPTION 'Access denied: cross-company reversal not permitted';
  END IF;

  INSERT INTO supplier_payment_events (
    company_id, purchase_invoice_id, event_type, amount, payment_date,
    notes, reversal_of_event_id, created_by
  ) VALUES (
    v_event.company_id, v_event.purchase_invoice_id, 'reversal', v_event.amount, CURRENT_DATE,
    p_reason, p_event_id, auth.uid()
  )
  RETURNING id INTO v_reversal_id;

  RETURN v_reversal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION reverse_supplier_payment_event(uuid, text)
  TO authenticated;

-- 6. get_supplier_payment_events() — payment history for one PI ───────────────

CREATE OR REPLACE FUNCTION get_supplier_payment_events(p_purchase_invoice_id uuid)
RETURNS TABLE (
  id                   uuid,
  event_type           text,
  amount               numeric,
  payment_date         date,
  payment_method       text,
  reference_no         text,
  notes                text,
  reversal_of_event_id uuid,
  is_reversed          boolean,
  created_by           uuid,
  created_at           timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    spe.id,
    spe.event_type,
    spe.amount,
    spe.payment_date,
    spe.payment_method,
    spe.reference_no,
    spe.notes,
    spe.reversal_of_event_id,
    EXISTS (
      SELECT 1 FROM supplier_payment_events r
      WHERE r.reversal_of_event_id = spe.id
    ) AS is_reversed,
    spe.created_by,
    spe.created_at
  FROM supplier_payment_events spe
  WHERE spe.purchase_invoice_id = p_purchase_invoice_id
    AND (SELECT company_id FROM purchase_invoices WHERE id = p_purchase_invoice_id)
        = (SELECT company_id FROM profiles WHERE id = auth.uid())
  ORDER BY spe.created_at;
$$;

GRANT EXECUTE ON FUNCTION get_supplier_payment_events(uuid)
  TO authenticated;

-- 7. get_ap_aging_summary() — server-side AP aging buckets ────────────────────

CREATE OR REPLACE FUNCTION get_ap_aging_summary(p_company_id text)
RETURNS TABLE (
  bucket            text,
  invoice_count     int,
  total_outstanding numeric,
  overdue_amount    numeric
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT sub.bucket, sub.invoice_count, sub.total_outstanding, sub.overdue_amount
  FROM (
    SELECT
      CASE
        WHEN pi.due_date IS NULL                               THEN 'no_due_date'
        WHEN pi.due_date >= CURRENT_DATE                       THEN 'current'
        WHEN pi.due_date >= CURRENT_DATE - INTERVAL '30 days' THEN '1_30_days'
        WHEN pi.due_date >= CURRENT_DATE - INTERVAL '60 days' THEN '31_60_days'
        WHEN pi.due_date >= CURRENT_DATE - INTERVAL '90 days' THEN '61_90_days'
        ELSE                                                        'over_90_days'
      END                                               AS bucket,
      COUNT(*)::int                                     AS invoice_count,
      SUM(pi.amount - COALESCE(pi.paid_amount, 0))      AS total_outstanding,
      SUM(CASE
            WHEN pi.due_date < CURRENT_DATE
            THEN pi.amount - COALESCE(pi.paid_amount, 0)
            ELSE 0
          END)                                          AS overdue_amount
    FROM purchase_invoices pi
    WHERE pi.company_id = p_company_id
      AND pi.payment_status <> 'paid'
      AND pi.is_deleted = false
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

GRANT EXECUTE ON FUNCTION get_ap_aging_summary(text)
  TO authenticated;

-- 8. transition_pi_lifecycle() — validated lifecycle state machine ─────────────

CREATE OR REPLACE FUNCTION transition_pi_lifecycle(
  p_id            uuid,
  p_target_status text,
  p_actor_id      uuid DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_id     text;
  v_current        text;
  v_caller_company text;
  v_actor          uuid;
BEGIN
  SELECT company_id, lifecycle_status
    INTO v_company_id, v_current
    FROM purchase_invoices
   WHERE id = p_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Purchase invoice not found: %', p_id;
  END IF;

  SELECT company_id INTO v_caller_company
    FROM profiles WHERE id = auth.uid();

  IF v_company_id <> v_caller_company THEN
    RAISE EXCEPTION 'Access denied: cross-company lifecycle transition not permitted';
  END IF;

  -- Validate allowed transitions
  IF NOT (
    (v_current = 'received'  AND p_target_status = 'verified')   OR
    (v_current = 'verified'  AND p_target_status = 'approved')   OR
    (v_current = 'approved'  AND p_target_status = 'scheduled')  OR
    (v_current = 'scheduled' AND p_target_status = 'paid')       OR
    (v_current = 'approved'  AND p_target_status = 'paid')       OR
    (p_target_status = 'cancelled' AND v_current NOT IN ('paid','cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid lifecycle transition: % → %', v_current, p_target_status;
  END IF;

  v_actor := COALESCE(p_actor_id, auth.uid());

  UPDATE purchase_invoices
     SET lifecycle_status = p_target_status,
         verified_at  = CASE WHEN p_target_status = 'verified'  THEN now() ELSE verified_at  END,
         verified_by  = CASE WHEN p_target_status = 'verified'  THEN v_actor ELSE verified_by  END,
         approved_at  = CASE WHEN p_target_status = 'approved'  THEN now() ELSE approved_at  END,
         approved_by  = CASE WHEN p_target_status = 'approved'  THEN v_actor ELSE approved_by  END
   WHERE id = p_id;

  RETURN p_target_status;
END;
$$;

GRANT EXECUTE ON FUNCTION transition_pi_lifecycle(uuid, text, uuid)
  TO authenticated;

-- 9. Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_lifecycle
  ON purchase_invoices(company_id, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_payment_status
  ON purchase_invoices(company_id, payment_status);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_due_date
  ON purchase_invoices(company_id, due_date)
  WHERE payment_status <> 'paid';

CREATE INDEX IF NOT EXISTS idx_spe_purchase_invoice_id
  ON supplier_payment_events(purchase_invoice_id);

CREATE INDEX IF NOT EXISTS idx_spe_company_id
  ON supplier_payment_events(company_id);
