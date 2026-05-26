-- Phase 3e.3: 3-way match
-- Compares purchase_invoices against the PO line they reference and the
-- cumulative GRN receipts for that line. Three reference points:
--   • PO    — what was ordered (purchase_order_lines.quantity × unit_price)
--   • GRN   — what was actually received (sum of grn_lines.received_quantity)
--   • PI    — what the supplier is billing for (purchase_invoices.amount)
--
-- Match status:
--   • unmatched         — PI has no po_line_id (legacy or not linked yet)
--   • pending_receipt   — linked, but received_qty < ordered_qty
--   • amount_variance   — fully received but |po_expected - pi_amount| > 1.00
--   • matched           — fully received AND amount within RM 1.00 tolerance
--
-- The tolerance is a tunable constant; bumping it later requires only a
-- migration edit. Returns are computed views, no schema changes; the
-- po_line_id FK on purchase_invoices was added back in 3e.1.

CREATE OR REPLACE FUNCTION get_three_way_match_status(
  p_company_id text,
  p_pi_id      uuid
)
RETURNS TABLE (
  purchase_invoice_id    uuid,
  invoice_no             text,
  supplier               text,
  chassis_no             text,
  pi_amount              numeric,
  po_id                  uuid,
  po_no                  text,
  po_line_id             uuid,
  po_line_no             int,
  ordered_quantity       numeric,
  unit_price             numeric,
  expected_amount        numeric,
  received_quantity      numeric,
  amount_variance        numeric,
  match_status           text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  c_tolerance numeric := 1.00;   -- RM 1.00 tolerance on amount diff
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
    pi.id,
    pi.invoice_no,
    pi.supplier,
    pi.chassis_no,
    pi.amount AS pi_amount,
    po.id   AS po_id,
    po.po_no,
    pol.id  AS po_line_id,
    pol.line_no,
    pol.quantity     AS ordered_quantity,
    pol.unit_price,
    pol.line_amount  AS expected_amount,
    COALESCE((
      SELECT SUM(gl.received_quantity)
      FROM grn_lines gl
      WHERE gl.purchase_order_line_id = pol.id
        AND gl.company_id = p_company_id
    ), 0)            AS received_quantity,
    (pol.line_amount - pi.amount) AS amount_variance,
    CASE
      WHEN pi.po_line_id IS NULL THEN 'unmatched'
      WHEN COALESCE((
        SELECT SUM(gl.received_quantity) FROM grn_lines gl
        WHERE gl.purchase_order_line_id = pol.id
          AND gl.company_id = p_company_id
      ), 0) < pol.quantity THEN 'pending_receipt'
      WHEN abs(pol.line_amount - pi.amount) > c_tolerance THEN 'amount_variance'
      ELSE 'matched'
    END AS match_status
  FROM purchase_invoices pi
  LEFT JOIN purchase_order_lines pol ON pol.id = pi.po_line_id
  LEFT JOIN purchase_orders      po  ON po.id  = pol.purchase_order_id
  WHERE pi.id = p_pi_id
    AND pi.company_id = p_company_id
    AND pi.is_deleted = false;
END;
$$;

GRANT EXECUTE ON FUNCTION get_three_way_match_status(text, uuid) TO authenticated;

-- Queue: every non-deleted PI with its computed match status. Variance/
-- pending states surface first.
CREATE OR REPLACE FUNCTION get_three_way_match_queue(
  p_company_id   text,
  p_match_status text DEFAULT NULL,
  p_limit        int  DEFAULT 200
)
RETURNS TABLE (
  purchase_invoice_id    uuid,
  invoice_no             text,
  supplier               text,
  chassis_no             text,
  pi_amount              numeric,
  invoice_date           date,
  po_no                  text,
  po_line_no             int,
  ordered_quantity       numeric,
  expected_amount        numeric,
  received_quantity      numeric,
  amount_variance        numeric,
  match_status           text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  c_tolerance numeric := 1.00;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT
      pi.id            AS purchase_invoice_id,
      pi.invoice_no,
      pi.supplier,
      pi.chassis_no,
      pi.amount        AS pi_amount,
      pi.invoice_date,
      po.po_no,
      pol.line_no      AS po_line_no,
      pol.quantity     AS ordered_quantity,
      pol.line_amount  AS expected_amount,
      COALESCE((
        SELECT SUM(gl.received_quantity) FROM grn_lines gl
        WHERE gl.purchase_order_line_id = pol.id
          AND gl.company_id = p_company_id
      ), 0) AS received_quantity,
      (pol.line_amount - pi.amount) AS amount_variance,
      CASE
        WHEN pi.po_line_id IS NULL THEN 'unmatched'
        WHEN COALESCE((
          SELECT SUM(gl.received_quantity) FROM grn_lines gl
          WHERE gl.purchase_order_line_id = pol.id
            AND gl.company_id = p_company_id
        ), 0) < pol.quantity THEN 'pending_receipt'
        WHEN abs(pol.line_amount - pi.amount) > c_tolerance THEN 'amount_variance'
        ELSE 'matched'
      END AS match_status
    FROM purchase_invoices pi
    LEFT JOIN purchase_order_lines pol ON pol.id = pi.po_line_id
    LEFT JOIN purchase_orders      po  ON po.id  = pol.purchase_order_id
    WHERE pi.company_id = p_company_id
      AND pi.is_deleted = false
  )
  SELECT *
  FROM rows
  WHERE (p_match_status IS NULL OR rows.match_status = p_match_status)
  ORDER BY
    CASE rows.match_status
      WHEN 'amount_variance' THEN 0
      WHEN 'pending_receipt' THEN 1
      WHEN 'unmatched'       THEN 2
      WHEN 'matched'         THEN 3
      ELSE 4
    END,
    rows.invoice_date DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_three_way_match_queue(text, text, int) TO authenticated;

-- Status totals (one row per status) for the dashboard header.
CREATE OR REPLACE FUNCTION get_three_way_match_status_counts(
  p_company_id text
)
RETURNS TABLE (
  match_status text,
  total        int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  c_tolerance numeric := 1.00;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT
      CASE
        WHEN pi.po_line_id IS NULL THEN 'unmatched'
        WHEN COALESCE((
          SELECT SUM(gl.received_quantity) FROM grn_lines gl
          WHERE gl.purchase_order_line_id = pol.id
            AND gl.company_id = p_company_id
        ), 0) < pol.quantity THEN 'pending_receipt'
        WHEN abs(pol.line_amount - pi.amount) > c_tolerance THEN 'amount_variance'
        ELSE 'matched'
      END AS match_status
    FROM purchase_invoices pi
    LEFT JOIN purchase_order_lines pol ON pol.id = pi.po_line_id
    WHERE pi.company_id = p_company_id
      AND pi.is_deleted = false
  )
  SELECT rows.match_status, COUNT(*)::int
  FROM rows
  GROUP BY rows.match_status
  ORDER BY rows.match_status;
END;
$$;

GRANT EXECUTE ON FUNCTION get_three_way_match_status_counts(text) TO authenticated;
