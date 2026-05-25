-- Phase 3b.1: Profit & Loss report RPC
-- Aggregates revenue and expense activity for a single accounting period.
-- Revenue lines show credit-net (revenue is normally credit-balanced),
-- expense lines show debit-net (expense is normally debit-balanced).
-- Net income = total revenue - total expense.
--
-- SECURITY DEFINER: caller must belong to the same company or have global scope.
-- Matches the pattern established by get_trial_balance().

CREATE OR REPLACE FUNCTION get_profit_loss(
  p_company_id text,
  p_period_id  uuid
)
RETURNS TABLE (
  account_id   uuid,
  account_code text,
  account_name text,
  account_type text,
  amount       numeric
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    a.id                                     AS account_id,
    a.code                                   AS account_code,
    a.name                                   AS account_name,
    a.type                                   AS account_type,
    CASE a.type
      WHEN 'revenue' THEN COALESCE(SUM(jel.credit), 0) - COALESCE(SUM(jel.debit), 0)
      WHEN 'expense' THEN COALESCE(SUM(jel.debit),  0) - COALESCE(SUM(jel.credit), 0)
      ELSE 0
    END                                      AS amount
  FROM accounts a
  LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
  LEFT JOIN journal_entries     je  ON je.id = jel.journal_entry_id
                                   AND je.period_id  = p_period_id
  WHERE a.company_id = p_company_id
    AND a.is_active  = true
    AND a.type IN ('revenue', 'expense')
  GROUP BY a.id, a.code, a.name, a.type
  ORDER BY a.type DESC, a.code;  -- revenue rows first (DESC sort: revenue > expense)
END;
$$;

GRANT EXECUTE ON FUNCTION get_profit_loss(text, uuid) TO authenticated;

-- Seed Phase 3b feature flag (global, default-off)
INSERT INTO public.feature_flags (company_id, code, enabled, description)
VALUES (NULL, 'phase3b.financial-reports-v2', false, 'Profit & Loss / Balance Sheet / Stage 7 financial reporting UI.')
ON CONFLICT DO NOTHING;
