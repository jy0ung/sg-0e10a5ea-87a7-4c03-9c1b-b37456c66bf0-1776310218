-- ============================================================================
-- Migration: 20260511060000_sales_pipeline_foundation_fix.sql
-- Purpose:   Corrective pass for 20260511050000 — wrong column names:
--            • sales_orders uses `stage_id`   (not `deal_stage_id`)
--            • sales_orders uses `selling_price` (not `total_price`)
--            • sales_orders has NO `status` column → drop delivered/cancelled counts
-- ============================================================================

-- ============================================================================
-- 1.  transition_sales_order_stage  (corrected)
-- ============================================================================
CREATE OR REPLACE FUNCTION transition_sales_order_stage(
  p_order_id   uuid,
  p_stage_id   uuid,          -- pass NULL to un-assign from pipeline
  p_company_id text,
  p_actor_id   uuid  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_stage_id uuid;
BEGIN
  -- Company-scope check + capture previous stage (correct column: stage_id)
  SELECT stage_id
    INTO v_prev_stage_id
    FROM sales_orders
   WHERE id          = p_order_id
     AND company_id  = p_company_id
     AND is_deleted  = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order % not found or access denied for company %',
                    p_order_id, p_company_id;
  END IF;

  -- No-op when already on target stage
  IF v_prev_stage_id IS NOT DISTINCT FROM p_stage_id THEN
    RETURN jsonb_build_object(
      'action',            'no_change',
      'order_id',          p_order_id,
      'previous_stage_id', v_prev_stage_id,
      'new_stage_id',      p_stage_id
    );
  END IF;

  -- Validate target stage belongs to the same company (skip when un-assigning)
  IF p_stage_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM deal_stages
       WHERE id = p_stage_id AND company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'Deal stage % not found or belongs to a different company',
                      p_stage_id;
    END IF;
  END IF;

  -- Atomic update (correct column: stage_id)
  UPDATE sales_orders
     SET stage_id   = p_stage_id,
         updated_at = now()
   WHERE id         = p_order_id
     AND company_id = p_company_id;

  -- Audit trail
  IF p_actor_id IS NOT NULL THEN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes, table_name)
    VALUES (
      p_actor_id,
      'stage_transition',
      'sales_order',
      p_order_id,
      jsonb_build_object(
        'previous_stage_id', v_prev_stage_id,
        'new_stage_id',      p_stage_id,
        'company_id',        p_company_id
      ),
      'sales_orders'
    );
  END IF;

  RETURN jsonb_build_object(
    'action',            'transitioned',
    'order_id',          p_order_id,
    'previous_stage_id', v_prev_stage_id,
    'new_stage_id',      p_stage_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION transition_sales_order_stage(uuid, uuid, text, uuid)
  TO authenticated;

COMMENT ON FUNCTION transition_sales_order_stage IS
  'Atomically moves a sales_order to a new deal_stage with company-scope '
  'validation and audit_logs entry. Returns {action, order_id, '
  'previous_stage_id, new_stage_id}.';


-- ============================================================================
-- 2.  get_sales_pipeline_summary  (corrected)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_sales_pipeline_summary(
  p_company_id  text,
  p_branch_code text  DEFAULT NULL,
  p_from_date   date  DEFAULT NULL,
  p_to_date     date  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'by_stage', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'deal_stage_id', s.deal_stage_id,   -- kept as deal_stage_id for client compat
          'stage_name',    s.stage_name,
          'stage_order',   s.stage_order,
          'stage_color',   s.stage_color,
          'order_count',   s.order_count,
          'total_value',   s.total_value
        )
        ORDER BY s.stage_order
      )
      FROM (
        SELECT
          ds.id                              AS deal_stage_id,
          ds.name                            AS stage_name,
          ds.stage_order,
          ds.color                           AS stage_color,
          COUNT(so.id)                       AS order_count,
          COALESCE(SUM(so.selling_price), 0) AS total_value   -- correct column
        FROM deal_stages ds
        LEFT JOIN sales_orders so
               ON so.stage_id    = ds.id          -- correct column
              AND so.company_id  = p_company_id
              AND so.is_deleted  = false
              AND (p_branch_code IS NULL OR so.branch_code = p_branch_code)
              AND (p_from_date   IS NULL OR so.booking_date >= p_from_date)
              AND (p_to_date     IS NULL OR so.booking_date <= p_to_date)
        WHERE ds.company_id = p_company_id
        GROUP BY ds.id, ds.name, ds.stage_order, ds.color
      ) s
    ), '[]'::jsonb),
    'unassigned', (
      SELECT jsonb_build_object(
        'order_count', COUNT(*),
        'total_value', COALESCE(SUM(selling_price), 0)   -- correct column; no status
      )
      FROM sales_orders
      WHERE company_id  = p_company_id
        AND stage_id    IS NULL                            -- correct column
        AND is_deleted  = false
        AND (p_branch_code IS NULL OR branch_code = p_branch_code)
        AND (p_from_date  IS NULL OR booking_date >= p_from_date)
        AND (p_to_date    IS NULL OR booking_date <= p_to_date)
    ),
    'totals', (
      SELECT jsonb_build_object(
        'order_count', COUNT(*),
        'total_value', COALESCE(SUM(selling_price), 0)   -- correct column
      )
      FROM sales_orders
      WHERE company_id = p_company_id
        AND is_deleted  = false
        AND (p_branch_code IS NULL OR branch_code = p_branch_code)
        AND (p_from_date  IS NULL OR booking_date >= p_from_date)
        AND (p_to_date    IS NULL OR booking_date <= p_to_date)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_sales_pipeline_summary(text, text, date, date)
  TO authenticated;

COMMENT ON FUNCTION get_sales_pipeline_summary IS
  'Returns pipeline counts and revenue grouped by deal_stage plus an '
  'unassigned bucket and overall totals. Supports optional branch and '
  'date-range filters. Uses sales_orders.stage_id and selling_price.';


-- ============================================================================
-- 3.  get_sales_dashboard_summary  (corrected)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_sales_dashboard_summary(
  p_company_id  text,
  p_branch_code text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mtd_from date := date_trunc('month', current_date)::date;
  v_result   jsonb;
BEGIN
  SELECT jsonb_build_object(
    'mtd', (
      SELECT jsonb_build_object(
        'order_count',  COUNT(*),
        'total_value',  COALESCE(SUM(selling_price), 0)   -- correct column; no status
      )
      FROM sales_orders
      WHERE company_id   = p_company_id
        AND is_deleted   = false
        AND booking_date >= v_mtd_from
        AND (p_branch_code IS NULL OR branch_code = p_branch_code)
    ),
    'vehicles_linked', (
      SELECT COUNT(*)
        FROM sales_orders
       WHERE company_id  = p_company_id
         AND is_deleted  = false
         AND vehicle_id IS NOT NULL
         AND (p_branch_code IS NULL OR branch_code = p_branch_code)
    ),
    'branch_breakdown', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('branch_code', branch_code, 'order_count', cnt)
        ORDER BY cnt DESC
      )
      FROM (
        SELECT branch_code, COUNT(*) AS cnt
          FROM sales_orders
         WHERE company_id = p_company_id
           AND is_deleted = false
           AND (p_branch_code IS NULL OR branch_code = p_branch_code)
         GROUP BY branch_code
      ) b
    ), '[]'::jsonb),
    'monthly_trend', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('month_key', month_key, 'order_count', cnt)
        ORDER BY month_key
      )
      FROM (
        SELECT
          to_char(booking_date, 'YYYY-MM') AS month_key,
          COUNT(*)                          AS cnt
        FROM sales_orders
       WHERE company_id  = p_company_id
         AND is_deleted  = false
         AND booking_date >= (date_trunc('month', current_date) - interval '5 months')::date
         AND (p_branch_code IS NULL OR branch_code = p_branch_code)
       GROUP BY to_char(booking_date, 'YYYY-MM')
      ) t
    ), '[]'::jsonb),
    'outstanding_ar', (
      SELECT COALESCE(SUM(total_amount - paid_amount), 0)
        FROM invoices
       WHERE company_id     = p_company_id
         AND payment_status IN ('unpaid', 'partial')
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_sales_dashboard_summary(text, text)
  TO authenticated;

COMMENT ON FUNCTION get_sales_dashboard_summary IS
  'Single-call server-side summary for the Sales Dashboard. '
  'Uses sales_orders.stage_id and selling_price (no status column). '
  'Returns mtd counts/revenue, vehicles_linked, branch_breakdown, '
  'monthly_trend (last 6 months), outstanding_ar.';
