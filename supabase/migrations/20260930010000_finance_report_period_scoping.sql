-- A LEFT JOIN from accounts to all journal lines followed by a filtered join
-- to journal_entries still summed the unfiltered lines. Restrict the line set
-- first, then aggregate, so a later period cannot change an earlier report.

CREATE OR REPLACE FUNCTION public.get_trial_balance(p_company_id text, p_period_id uuid)
RETURNS TABLE (
  account_id uuid, account_code text, account_name text, account_type text,
  total_debit numeric, total_credit numeric, net_balance numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND (p.company_id = p_company_id OR p.access_scope = 'global')
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT a.id, a.code, a.name, a.type,
    COALESCE(SUM(lines.debit), 0),
    COALESCE(SUM(lines.credit), 0),
    COALESCE(SUM(lines.debit), 0) - COALESCE(SUM(lines.credit), 0)
  FROM public.accounts a
  LEFT JOIN (
    SELECT jel.account_id, jel.debit, jel.credit
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.company_id = p_company_id AND je.period_id = p_period_id
  ) lines ON lines.account_id = a.id
  WHERE a.company_id = p_company_id AND a.is_active
  GROUP BY a.id, a.code, a.name, a.type
  ORDER BY a.code;
END;
$$;
REVOKE ALL ON FUNCTION public.get_trial_balance(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profit_loss(p_company_id text, p_period_id uuid)
RETURNS TABLE (
  account_id uuid, account_code text, account_name text, account_type text, amount numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND (p.company_id = p_company_id OR p.access_scope = 'global')
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT a.id, a.code, a.name, a.type,
    CASE a.type
      WHEN 'revenue' THEN COALESCE(SUM(lines.credit), 0) - COALESCE(SUM(lines.debit), 0)
      WHEN 'expense' THEN COALESCE(SUM(lines.debit), 0) - COALESCE(SUM(lines.credit), 0)
      ELSE 0
    END
  FROM public.accounts a
  LEFT JOIN (
    SELECT jel.account_id, jel.debit, jel.credit
      FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.company_id = p_company_id AND je.period_id = p_period_id
  ) lines ON lines.account_id = a.id
  WHERE a.company_id = p_company_id AND a.is_active
    AND a.type IN ('revenue', 'expense')
  GROUP BY a.id, a.code, a.name, a.type
  ORDER BY a.type DESC, a.code;
END;
$$;
REVOKE ALL ON FUNCTION public.get_profit_loss(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profit_loss(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_balance_sheet(p_company_id text, p_period_id uuid)
RETURNS TABLE (
  account_id uuid, account_code text, account_name text, account_type text, balance numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_end_date date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND (p.company_id = p_company_id OR p.access_scope = 'global')
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT ap.end_date INTO v_end_date FROM public.accounting_periods ap
   WHERE ap.id = p_period_id AND ap.company_id = p_company_id;
  IF v_end_date IS NULL THEN
    RAISE EXCEPTION 'Accounting period % not found for company %', p_period_id, p_company_id;
  END IF;

  RETURN QUERY
  WITH cumulative AS (
    SELECT a.id, a.code, a.name, a.type,
      COALESCE(SUM(lines.debit), 0) AS total_debit,
      COALESCE(SUM(lines.credit), 0) AS total_credit
    FROM public.accounts a
    LEFT JOIN (
      SELECT jel.account_id, jel.debit, jel.credit
        FROM public.journal_entry_lines jel
        JOIN public.journal_entries je ON je.id = jel.journal_entry_id
       WHERE je.company_id = p_company_id AND je.entry_date <= v_end_date
    ) lines ON lines.account_id = a.id
    WHERE a.company_id = p_company_id AND a.is_active
      AND a.type IN ('asset', 'liability', 'equity')
    GROUP BY a.id, a.code, a.name, a.type
  ), current_earnings AS (
    SELECT
      COALESCE(SUM(CASE WHEN a.type = 'revenue' THEN jel.credit ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN a.type = 'revenue' THEN jel.debit ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN a.type = 'expense' THEN jel.debit ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN a.type = 'expense' THEN jel.credit ELSE 0 END), 0) AS net_income
    FROM public.accounts a
    JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      AND je.entry_date <= v_end_date AND je.company_id = p_company_id
    WHERE a.company_id = p_company_id AND a.type IN ('revenue', 'expense')
  )
  SELECT c.id, c.code, c.name, c.type,
    CASE c.type
      WHEN 'asset' THEN c.total_debit - c.total_credit
      WHEN 'liability' THEN c.total_credit - c.total_debit
      WHEN 'equity' THEN c.total_credit - c.total_debit
      ELSE 0
    END
  FROM cumulative c
  UNION ALL
  SELECT NULL::uuid, '9999', 'Current Period Earnings (unclosed)', 'equity', ce.net_income
    FROM current_earnings ce
  ORDER BY 4, 2;
END;
$$;
REVOKE ALL ON FUNCTION public.get_balance_sheet(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_balance_sheet(text, uuid) TO authenticated;
