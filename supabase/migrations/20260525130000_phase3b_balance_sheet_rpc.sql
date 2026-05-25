-- Phase 3b.2: Balance Sheet report RPC
-- Point-in-time snapshot as of the selected period's end_date.
-- Aggregates cumulative balances for asset/liability/equity accounts across
-- ALL journal entries with entry_date <= period.end_date.
--
-- Sign convention (natural balances, always positive when normal):
--   asset:     debit - credit
--   liability: credit - debit
--   equity:    credit - debit
--
-- Until period close, revenue/expense activity is not yet rolled into retained
-- earnings. To keep the sheet honest (Assets = Liabilities + Equity), one
-- synthetic equity row "Current Period Earnings (unclosed)" is appended,
-- carrying the cumulative net income through period end (revenue net of
-- expense, both signed in their natural direction).
--
-- SECURITY DEFINER: caller must belong to the same company or have global scope.

CREATE OR REPLACE FUNCTION get_balance_sheet(
  p_company_id text,
  p_period_id  uuid
)
RETURNS TABLE (
  account_id   uuid,
  account_code text,
  account_name text,
  account_type text,
  balance      numeric
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_end_date date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT end_date INTO v_end_date
    FROM accounting_periods
   WHERE id = p_period_id AND company_id = p_company_id;

  IF v_end_date IS NULL THEN
    RAISE EXCEPTION 'Accounting period % not found for company %', p_period_id, p_company_id;
  END IF;

  RETURN QUERY
  WITH cumulative AS (
    SELECT
      a.id   AS account_id,
      a.code AS account_code,
      a.name AS account_name,
      a.type AS account_type,
      COALESCE(SUM(jel.debit),  0) AS total_debit,
      COALESCE(SUM(jel.credit), 0) AS total_credit
    FROM accounts a
    LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
    LEFT JOIN journal_entries     je  ON je.id = jel.journal_entry_id
                                     AND je.entry_date <= v_end_date
                                     AND je.company_id  = p_company_id
    WHERE a.company_id = p_company_id
      AND a.is_active  = true
      AND a.type IN ('asset', 'liability', 'equity')
    GROUP BY a.id, a.code, a.name, a.type
  ),
  current_earnings AS (
    SELECT
      COALESCE(SUM(CASE WHEN a.type = 'revenue' THEN jel.credit ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN a.type = 'revenue' THEN jel.debit ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN a.type = 'expense' THEN jel.debit ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN a.type = 'expense' THEN jel.credit ELSE 0 END), 0)
        AS net_income
    FROM accounts a
    JOIN journal_entry_lines jel ON jel.account_id = a.id
    JOIN journal_entries     je  ON je.id = jel.journal_entry_id
                                AND je.entry_date <= v_end_date
                                AND je.company_id  = p_company_id
    WHERE a.company_id = p_company_id
      AND a.type IN ('revenue', 'expense')
  )
  SELECT
    c.account_id,
    c.account_code,
    c.account_name,
    c.account_type,
    CASE c.account_type
      WHEN 'asset'     THEN c.total_debit  - c.total_credit
      WHEN 'liability' THEN c.total_credit - c.total_debit
      WHEN 'equity'    THEN c.total_credit - c.total_debit
      ELSE 0
    END AS balance
  FROM cumulative c
  UNION ALL
  SELECT
    NULL::uuid                                 AS account_id,
    '9999'                                     AS account_code,
    'Current Period Earnings (unclosed)'       AS account_name,
    'equity'                                   AS account_type,
    ce.net_income                              AS balance
  FROM current_earnings ce
  ORDER BY 4, 2;  -- order by account_type, then account_code
END;
$$;

GRANT EXECUTE ON FUNCTION get_balance_sheet(text, uuid) TO authenticated;
