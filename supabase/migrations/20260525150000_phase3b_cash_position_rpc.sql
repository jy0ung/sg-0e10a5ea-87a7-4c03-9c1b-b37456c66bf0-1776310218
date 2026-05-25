-- Phase 3b.4: Cash position report RPC
-- Returns a daily series of cash and bank balance over a date range,
-- using the system "Cash and Bank" account (code '1000', seeded per company
-- by gl_foundation). Each row carries the day's debits, credits, net change,
-- and the running balance after that day's activity.
--
-- Opening balance is computed from all journal entries with entry_date <
-- p_from_date. The series is dense — every day in [p_from_date, p_to_date]
-- is returned so charts and tables show flat segments on inactive days
-- instead of gaps.
--
-- SECURITY DEFINER: same-company / global-scope gate on the caller.

CREATE OR REPLACE FUNCTION get_cash_position(
  p_company_id text,
  p_from_date  date,
  p_to_date    date
)
RETURNS TABLE (
  position_date    date,
  daily_debit      numeric,
  daily_credit     numeric,
  daily_net        numeric,
  running_balance  numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_cash_account uuid;
  v_opening      numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_from_date > p_to_date THEN
    RAISE EXCEPTION 'p_from_date (%) must not be after p_to_date (%)', p_from_date, p_to_date;
  END IF;

  SELECT id INTO v_cash_account
    FROM accounts
   WHERE company_id = p_company_id
     AND code = '1000'
     AND is_system
   LIMIT 1;

  IF v_cash_account IS NULL THEN
    -- No cash account seeded yet for this company; return empty series.
    RETURN;
  END IF;

  -- Opening balance = all activity strictly before p_from_date
  SELECT COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0)
    INTO v_opening
    FROM journal_entry_lines jel
    JOIN journal_entries     je ON je.id = jel.journal_entry_id
   WHERE jel.account_id = v_cash_account
     AND je.company_id  = p_company_id
     AND je.entry_date  < p_from_date;

  RETURN QUERY
  WITH days AS (
    SELECT d::date AS position_date
    FROM generate_series(p_from_date, p_to_date, INTERVAL '1 day') d
  ),
  daily AS (
    SELECT
      je.entry_date                    AS position_date,
      COALESCE(SUM(jel.debit),  0)     AS daily_debit,
      COALESCE(SUM(jel.credit), 0)     AS daily_credit
    FROM journal_entry_lines jel
    JOIN journal_entries     je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = v_cash_account
      AND je.company_id  = p_company_id
      AND je.entry_date BETWEEN p_from_date AND p_to_date
    GROUP BY je.entry_date
  ),
  series AS (
    SELECT
      days.position_date,
      COALESCE(daily.daily_debit,  0) AS daily_debit,
      COALESCE(daily.daily_credit, 0) AS daily_credit
    FROM days
    LEFT JOIN daily ON daily.position_date = days.position_date
  )
  SELECT
    s.position_date,
    s.daily_debit,
    s.daily_credit,
    s.daily_debit - s.daily_credit                                                  AS daily_net,
    v_opening + SUM(s.daily_debit - s.daily_credit)
      OVER (ORDER BY s.position_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
      AS running_balance
  FROM series s
  ORDER BY s.position_date;
END;
$$;

GRANT EXECUTE ON FUNCTION get_cash_position(text, date, date) TO authenticated;
