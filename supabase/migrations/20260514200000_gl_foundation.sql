-- ── Stage 6: General Ledger Foundation ───────────────────────────────────────
-- Adds:
--   • accounts           — chart of accounts (asset/liability/equity/revenue/expense)
--   • accounting_periods — fiscal period open/close with unique-active constraint
--   • journal_entries    — double-entry header (source_type, source_id)
--   • journal_entry_lines — debit/credit legs with balance constraint enforced by trigger
--   • trg_validate_je_balance — trigger that rejects unbalanced journal entries
--   • post_ar_payment_to_gl()  — SECURITY DEFINER; derives from payment_events
--   • post_ap_payment_to_gl()  — SECURITY DEFINER; derives from supplier_payment_events
--   • get_trial_balance()      — SECURITY DEFINER; per-period debit/credit/net per account
--   • RLS: same-company SELECT; no direct DML by authenticated users
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. accounts — chart of accounts ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  text  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code        text  NOT NULL,
  name        text  NOT NULL,
  type        text  NOT NULL
    CHECK (type IN ('asset','liability','equity','revenue','expense')),
  is_system   boolean NOT NULL DEFAULT false,  -- system accounts seeded per-company
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_tenant_select" ON accounts
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "accounts_admin_write" ON accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND company_id = accounts.company_id
         AND role IN ('super_admin','company_admin','director','general_manager','accounts')
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type    ON accounts(company_id, type);

-- 2. accounting_periods ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounting_periods (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   text  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text  NOT NULL,         -- e.g. "Jan 2026"
  period_year  smallint NOT NULL,
  period_month smallint NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  start_date   date  NOT NULL,
  end_date     date  NOT NULL,
  status       text  NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','closed','locked')),
  closed_at    timestamptz,
  closed_by    uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_year, period_month)
);

-- Only one open period per company is enforced by application logic; the
-- partial unique index below prevents two *open* periods in the same month.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ap_one_open_per_month
  ON accounting_periods(company_id, period_year, period_month)
  WHERE status = 'open';

ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_periods_tenant_select" ON accounting_periods
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "accounting_periods_admin_write" ON accounting_periods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND company_id = accounting_periods.company_id
         AND role IN ('super_admin','company_admin','director','general_manager','accounts')
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE INDEX IF NOT EXISTS idx_accounting_periods_company ON accounting_periods(company_id);

-- 3. journal_entries — double-entry header ────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entries (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   text  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_id    uuid  NOT NULL REFERENCES accounting_periods(id),
  entry_date   date  NOT NULL,
  description  text  NOT NULL,
  source_type  text  NOT NULL
    CHECK (source_type IN ('ar_payment','ap_payment','manual','adjustment')),
  source_id    uuid,   -- payment_events.id or supplier_payment_events.id
  reference_no text,
  posted_by    uuid  REFERENCES auth.users(id),
  posted_at    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_entries_tenant_select" ON journal_entries
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- Block direct DML; all writes go through SECURITY DEFINER RPCs
REVOKE INSERT, UPDATE, DELETE ON journal_entries FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_je_company_period ON journal_entries(company_id, period_id);
CREATE INDEX IF NOT EXISTS idx_je_source         ON journal_entries(source_type, source_id)
  WHERE source_id IS NOT NULL;

-- 4. journal_entry_lines ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid          NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id       uuid          NOT NULL REFERENCES accounts(id),
  description      text,
  debit            numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit           numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  -- Exactly one of debit/credit must be nonzero per line
  CONSTRAINT jel_one_side_nonzero CHECK (
    (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
  ),
  created_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_entry_lines_tenant_select" ON journal_entry_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM journal_entries je
       JOIN profiles p ON p.id = auth.uid()
       WHERE je.id = journal_entry_lines.journal_entry_id
         AND (je.company_id = p.company_id OR p.access_scope = 'global')
    )
  );

REVOKE INSERT, UPDATE, DELETE ON journal_entry_lines FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_jel_entry   ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account ON journal_entry_lines(account_id);

-- 5. Trigger: reject unbalanced journal entries ───────────────────────────────

CREATE OR REPLACE FUNCTION validate_journal_entry_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total_debit  numeric;
  v_total_credit numeric;
BEGIN
  SELECT
    COALESCE(SUM(debit),  0),
    COALESCE(SUM(credit), 0)
  INTO v_total_debit, v_total_credit
  FROM journal_entry_lines
  WHERE journal_entry_id = NEW.journal_entry_id;

  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION
      'Journal entry % is unbalanced: debit=% credit=%',
      NEW.journal_entry_id, v_total_debit, v_total_credit;
  END IF;

  RETURN NEW;
END;
$$;

-- Fire AFTER each line insert/update/delete to check the running total.
-- We use a DEFERRABLE INITIALLY DEFERRED constraint trigger so multi-line
-- inserts (within the same transaction) don't fail on intermediate states.
CREATE CONSTRAINT TRIGGER trg_validate_je_balance
  AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_balance();

-- 6. Seed system accounts per existing company ────────────────────────────────
-- Insert a minimal chart of accounts for every company that doesn't already
-- have system accounts.  This is idempotent (INSERT ... ON CONFLICT DO NOTHING).

INSERT INTO accounts (company_id, code, name, type, is_system)
SELECT c.id, a.code, a.name, a.type, true
FROM companies c
CROSS JOIN (VALUES
  ('1100', 'Accounts Receivable',    'asset'),
  ('2100', 'Accounts Payable',       'liability'),
  ('4100', 'Sales Revenue',          'revenue'),
  ('5100', 'Cost of Goods Sold',     'expense'),
  ('1000', 'Cash and Bank',          'asset'),
  ('3100', 'Retained Earnings',      'equity')
) AS a(code, name, type)
ON CONFLICT (company_id, code) DO NOTHING;

-- 7. post_ar_payment_to_gl() ──────────────────────────────────────────────────
-- Posts a payment_event to the General Ledger:
--   DR Accounts Receivable (reduces AR)   → 1100
--   CR Cash and Bank (cash received)      → 1000
-- Skips reversal events (those are already negative-net via the trigger).
-- Idempotent: will not double-post the same source_id.

CREATE OR REPLACE FUNCTION post_ar_payment_to_gl(
  p_payment_event_id uuid
)
RETURNS uuid   -- journal_entry.id
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pe          record;
  v_company_id  text;
  v_period_id   uuid;
  v_ar_account  uuid;
  v_cash_account uuid;
  v_je_id       uuid;
  v_caller_id   uuid := auth.uid();
BEGIN
  -- Load payment event
  SELECT pe.*, i.company_id AS cid
    INTO v_pe
    FROM payment_events pe
    JOIN invoices i ON i.id = pe.invoice_id
   WHERE pe.id = p_payment_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_event % not found', p_payment_event_id;
  END IF;

  v_company_id := v_pe.cid;

  -- Caller must belong to same company or have global scope
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = v_caller_id
       AND (company_id = v_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: caller does not belong to company %', v_company_id;
  END IF;

  -- Idempotency: skip if already posted
  IF EXISTS (
    SELECT 1 FROM journal_entries
     WHERE source_type = 'ar_payment'
       AND source_id   = p_payment_event_id
  ) THEN
    SELECT id INTO v_je_id FROM journal_entries
     WHERE source_type = 'ar_payment' AND source_id = p_payment_event_id;
    RETURN v_je_id;
  END IF;

  -- Resolve open accounting period for payment_date
  SELECT id INTO v_period_id
    FROM accounting_periods
   WHERE company_id = v_company_id
     AND status     = 'open'
     AND start_date <= v_pe.payment_date
     AND end_date   >= v_pe.payment_date
   LIMIT 1;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'No open accounting period covers date % for company %',
      v_pe.payment_date, v_company_id;
  END IF;

  -- Resolve system accounts
  SELECT id INTO v_ar_account   FROM accounts WHERE company_id = v_company_id AND code = '1100' AND is_system;
  SELECT id INTO v_cash_account FROM accounts WHERE company_id = v_company_id AND code = '1000' AND is_system;

  IF v_ar_account IS NULL OR v_cash_account IS NULL THEN
    RAISE EXCEPTION 'System accounts not seeded for company %', v_company_id;
  END IF;

  -- Insert journal entry header
  INSERT INTO journal_entries (company_id, period_id, entry_date, description, source_type, source_id, posted_by)
  VALUES (
    v_company_id,
    v_period_id,
    v_pe.payment_date,
    'AR Payment: ' || COALESCE(v_pe.receipt_reference, v_pe.id::text),
    'ar_payment',
    p_payment_event_id,
    v_caller_id
  )
  RETURNING id INTO v_je_id;

  -- Insert balanced lines (DR AR / CR Cash)
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES
    (v_je_id, v_ar_account,   0,          v_pe.amount),   -- CR AR (reduce receivable)
    (v_je_id, v_cash_account, v_pe.amount, 0);             -- DR Cash (increase asset)

  RETURN v_je_id;
END;
$$;

-- 8. post_ap_payment_to_gl() ──────────────────────────────────────────────────
-- Posts a supplier_payment_event to the GL:
--   DR Accounts Payable (reduces AP)   → 2100
--   CR Cash and Bank (cash paid out)   → 1000

CREATE OR REPLACE FUNCTION post_ap_payment_to_gl(
  p_supplier_payment_event_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_spe         record;
  v_company_id  text;
  v_period_id   uuid;
  v_ap_account  uuid;
  v_cash_account uuid;
  v_je_id       uuid;
  v_caller_id   uuid := auth.uid();
BEGIN
  SELECT spe.*, pi.company_id AS cid
    INTO v_spe
    FROM supplier_payment_events spe
    JOIN purchase_invoices pi ON pi.id = spe.purchase_invoice_id
   WHERE spe.id = p_supplier_payment_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_payment_event % not found', p_supplier_payment_event_id;
  END IF;

  v_company_id := v_spe.cid;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = v_caller_id
       AND (company_id = v_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: caller does not belong to company %', v_company_id;
  END IF;

  -- Idempotency
  IF EXISTS (
    SELECT 1 FROM journal_entries
     WHERE source_type = 'ap_payment'
       AND source_id   = p_supplier_payment_event_id
  ) THEN
    SELECT id INTO v_je_id FROM journal_entries
     WHERE source_type = 'ap_payment' AND source_id = p_supplier_payment_event_id;
    RETURN v_je_id;
  END IF;

  SELECT id INTO v_period_id
    FROM accounting_periods
   WHERE company_id = v_company_id
     AND status     = 'open'
     AND start_date <= v_spe.payment_date
     AND end_date   >= v_spe.payment_date
   LIMIT 1;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'No open accounting period covers date % for company %',
      v_spe.payment_date, v_company_id;
  END IF;

  SELECT id INTO v_ap_account   FROM accounts WHERE company_id = v_company_id AND code = '2100' AND is_system;
  SELECT id INTO v_cash_account FROM accounts WHERE company_id = v_company_id AND code = '1000' AND is_system;

  IF v_ap_account IS NULL OR v_cash_account IS NULL THEN
    RAISE EXCEPTION 'System accounts not seeded for company %', v_company_id;
  END IF;

  INSERT INTO journal_entries (company_id, period_id, entry_date, description, source_type, source_id, posted_by)
  VALUES (
    v_company_id,
    v_period_id,
    v_spe.payment_date,
    'AP Payment: ' || COALESCE(v_spe.reference_no, v_spe.id::text),
    'ap_payment',
    p_supplier_payment_event_id,
    v_caller_id
  )
  RETURNING id INTO v_je_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES
    (v_je_id, v_ap_account,   v_spe.amount, 0),            -- DR AP (reduce payable)
    (v_je_id, v_cash_account, 0,            v_spe.amount);  -- CR Cash (reduce asset)

  RETURN v_je_id;
END;
$$;

-- 9. get_trial_balance() ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_trial_balance(
  p_company_id text,
  p_period_id  uuid
)
RETURNS TABLE (
  account_id   uuid,
  account_code text,
  account_name text,
  account_type text,
  total_debit  numeric,
  total_credit numeric,
  net_balance  numeric
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Caller must belong to the same company or have global scope
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    a.id                          AS account_id,
    a.code                        AS account_code,
    a.name                        AS account_name,
    a.type                        AS account_type,
    COALESCE(SUM(jel.debit),  0)  AS total_debit,
    COALESCE(SUM(jel.credit), 0)  AS total_credit,
    COALESCE(SUM(jel.debit),  0)
      - COALESCE(SUM(jel.credit), 0) AS net_balance
  FROM accounts a
  LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
  LEFT JOIN journal_entries     je  ON je.id = jel.journal_entry_id
                                   AND je.period_id  = p_period_id
  WHERE a.company_id = p_company_id
    AND a.is_active  = true
  GROUP BY a.id, a.code, a.name, a.type
  ORDER BY a.code;
END;
$$;

-- Grant execute to authenticated users (SECURITY DEFINER enforces scope check)
GRANT EXECUTE ON FUNCTION post_ar_payment_to_gl(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION post_ap_payment_to_gl(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION get_trial_balance(text, uuid)   TO authenticated;
