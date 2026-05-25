-- Phase 3b.3: AR/AP aging by branch
-- Extends the existing get_ar_aging_summary / get_ap_aging_summary semantics
-- with a branch dimension. The schema does not store branch_code directly on
-- invoices / purchase_invoices, so we derive it:
--   • AR branch  = invoices → sales_orders.branch_code
--   • AP branch  = purchase_invoices → vehicles (matched on chassis_no).branch_code
-- Rows without a resolvable branch surface as branch_code = 'unassigned' so
-- they remain visible to finance instead of being silently dropped.
--
-- Aging buckets mirror the existing summary RPCs to keep the report aligned
-- with the company-wide view that finance already trusts.
--
-- SECURITY DEFINER: same-company / global-scope gate on the caller.

CREATE OR REPLACE FUNCTION get_ar_aging_by_branch(p_company_id text)
RETURNS TABLE (
  branch_code       text,
  bucket            text,
  invoice_count     int,
  total_outstanding numeric,
  overdue_amount    numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT sub.branch_code, sub.bucket, sub.invoice_count, sub.total_outstanding, sub.overdue_amount
  FROM (
    SELECT
      COALESCE(NULLIF(so.branch_code, ''), 'unassigned') AS branch_code,
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
    LEFT JOIN sales_orders so ON so.id = i.sales_order_id
    WHERE i.company_id = p_company_id
      AND i.payment_status <> 'paid'
    GROUP BY 1, 2
  ) sub
  ORDER BY
    sub.branch_code,
    CASE sub.bucket
      WHEN 'no_due_date'  THEN 0
      WHEN 'current'      THEN 1
      WHEN '1_30_days'    THEN 2
      WHEN '31_60_days'   THEN 3
      WHEN '61_90_days'   THEN 4
      WHEN 'over_90_days' THEN 5
    END;
END;
$$;

CREATE OR REPLACE FUNCTION get_ap_aging_by_branch(p_company_id text)
RETURNS TABLE (
  branch_code       text,
  bucket            text,
  invoice_count     int,
  total_outstanding numeric,
  overdue_amount    numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT sub.branch_code, sub.bucket, sub.invoice_count, sub.total_outstanding, sub.overdue_amount
  FROM (
    SELECT
      COALESCE(NULLIF(v.branch_code, ''), 'unassigned') AS branch_code,
      CASE
        WHEN pi.due_date IS NULL                               THEN 'no_due_date'
        WHEN pi.due_date >= CURRENT_DATE                       THEN 'current'
        WHEN pi.due_date >= CURRENT_DATE - INTERVAL '30 days' THEN '1_30_days'
        WHEN pi.due_date >= CURRENT_DATE - INTERVAL '60 days' THEN '31_60_days'
        WHEN pi.due_date >= CURRENT_DATE - INTERVAL '90 days' THEN '61_90_days'
        ELSE                                                         'over_90_days'
      END                                              AS bucket,
      COUNT(*)::int                                    AS invoice_count,
      SUM(pi.amount - COALESCE(pi.paid_amount, 0))     AS total_outstanding,
      SUM(CASE
            WHEN pi.due_date < CURRENT_DATE
            THEN pi.amount - COALESCE(pi.paid_amount, 0)
            ELSE 0
          END)                                         AS overdue_amount
    FROM purchase_invoices pi
    LEFT JOIN vehicles v
      ON v.chassis_no = pi.chassis_no
     AND v.company_id = pi.company_id
    WHERE pi.company_id = p_company_id
      AND pi.payment_status <> 'paid'
      AND pi.is_deleted = false
    GROUP BY 1, 2
  ) sub
  ORDER BY
    sub.branch_code,
    CASE sub.bucket
      WHEN 'no_due_date'  THEN 0
      WHEN 'current'      THEN 1
      WHEN '1_30_days'    THEN 2
      WHEN '31_60_days'   THEN 3
      WHEN '61_90_days'   THEN 4
      WHEN 'over_90_days' THEN 5
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION get_ar_aging_by_branch(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ap_aging_by_branch(text) TO authenticated;
