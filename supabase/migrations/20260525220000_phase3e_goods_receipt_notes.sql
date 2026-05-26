-- Phase 3e.2: Goods Receipt Notes
-- Records physical receipt of CBU units against an approved PO. Each GRN
-- can be partial (receive 1 of 2 ordered units now, the other later) and
-- references specific purchase_order_lines via grn_lines.
--
-- Lifecycle: GRNs are post-only at create time (no draft state). To undo,
-- finance creates a separate reversal entry (out of scope here).
--
-- create_grn() enforces:
--   • PO must be in 'approved' (or already 'fulfilled' for back-fills).
--   • Each line's po_line_id must belong to the same PO and same company.
--   • Cumulative received_quantity across all GRNs for a PO line must not
--     exceed that line's ordered quantity.
-- After insert, if every PO line is fully received, the PO is auto-
-- transitioned to 'fulfilled'.

CREATE TABLE IF NOT EXISTS public.goods_receipt_notes (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          text          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  grn_no              text          NOT NULL,
  purchase_order_id   uuid          NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  received_date       date          NOT NULL,
  supplier_dn_no      text,             -- supplier's delivery note reference
  notes               text,
  received_by         uuid          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (company_id, grn_no)
);

CREATE INDEX IF NOT EXISTS goods_receipt_notes_company_po_idx
  ON public.goods_receipt_notes (company_id, purchase_order_id, received_date DESC);

COMMENT ON TABLE public.goods_receipt_notes IS
  'Physical receipt of CBU units against a purchase order. Immutable after creation.';

ALTER TABLE public.goods_receipt_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goods_receipt_notes_select" ON public.goods_receipt_notes
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "goods_receipt_notes_insert" ON public.goods_receipt_notes
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── Lines ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.grn_lines (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               text          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  goods_receipt_note_id    uuid          NOT NULL REFERENCES public.goods_receipt_notes(id) ON DELETE CASCADE,
  purchase_order_line_id   uuid          NOT NULL REFERENCES public.purchase_order_lines(id) ON DELETE RESTRICT,
  received_quantity        numeric(8,2)  NOT NULL CHECK (received_quantity > 0),
  line_notes               text,
  created_at               timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grn_lines_grn_idx
  ON public.grn_lines (goods_receipt_note_id);

CREATE INDEX IF NOT EXISTS grn_lines_po_line_idx
  ON public.grn_lines (purchase_order_line_id);

ALTER TABLE public.grn_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grn_lines_select" ON public.grn_lines
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "grn_lines_insert" ON public.grn_lines
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── create_grn RPC ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_grn(
  p_company_id        text,
  p_grn_no            text,
  p_po_id             uuid,
  p_received_date     date,
  p_supplier_dn_no    text,
  p_notes             text,
  p_lines             jsonb   -- [{ purchase_order_line_id, received_quantity, line_notes? }]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_po_status text;
  v_grn_id    uuid;
  v_line      jsonb;
  v_po_line_id uuid;
  v_received  numeric;
  v_ordered   numeric;
  v_already   numeric;
  v_all_fulfilled boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = v_caller_id
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_grn_no IS NULL OR length(trim(p_grn_no)) = 0 THEN
    RAISE EXCEPTION 'grn_no is required';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line is required';
  END IF;

  -- PO must exist for this company and be in a receivable state
  SELECT lifecycle_status INTO v_po_status
    FROM purchase_orders
   WHERE id = p_po_id AND company_id = p_company_id;

  IF v_po_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found for company %', p_po_id, p_company_id;
  END IF;

  IF v_po_status NOT IN ('approved', 'fulfilled') THEN
    RAISE EXCEPTION 'PO % is in status % and cannot receive goods (must be approved or fulfilled)',
      p_po_id, v_po_status;
  END IF;

  -- Insert GRN header
  INSERT INTO goods_receipt_notes (
    company_id, grn_no, purchase_order_id, received_date, supplier_dn_no, notes, received_by
  ) VALUES (
    p_company_id, p_grn_no, p_po_id, p_received_date, p_supplier_dn_no, p_notes, v_caller_id
  )
  RETURNING id INTO v_grn_id;

  -- Validate + insert each line
  FOR v_line IN SELECT jsonb_array_elements(p_lines) LOOP
    v_po_line_id := (v_line->>'purchase_order_line_id')::uuid;
    v_received  := (v_line->>'received_quantity')::numeric;

    IF v_received IS NULL OR v_received <= 0 THEN
      RAISE EXCEPTION 'received_quantity must be > 0 for po_line %', v_po_line_id;
    END IF;

    -- Verify po_line belongs to this PO + same company; capture ordered qty
    SELECT quantity INTO v_ordered
      FROM purchase_order_lines
     WHERE id = v_po_line_id
       AND purchase_order_id = p_po_id
       AND company_id = p_company_id;

    IF v_ordered IS NULL THEN
      RAISE EXCEPTION 'PO line % not found on PO %', v_po_line_id, p_po_id;
    END IF;

    -- Sum prior receipts for this line (across already-existing GRNs)
    SELECT COALESCE(SUM(received_quantity), 0) INTO v_already
      FROM grn_lines
     WHERE purchase_order_line_id = v_po_line_id
       AND company_id = p_company_id;

    IF v_already + v_received > v_ordered THEN
      RAISE EXCEPTION 'Receiving % for po_line % would exceed ordered qty (% already received of % ordered)',
        v_received, v_po_line_id, v_already, v_ordered;
    END IF;

    INSERT INTO grn_lines (
      company_id, goods_receipt_note_id, purchase_order_line_id, received_quantity, line_notes
    ) VALUES (
      p_company_id, v_grn_id, v_po_line_id, v_received, NULLIF(v_line->>'line_notes', '')
    );
  END LOOP;

  -- Auto-fulfilment: if every PO line is now fully received, flip PO to 'fulfilled'
  SELECT NOT EXISTS (
    SELECT 1 FROM purchase_order_lines pol
     WHERE pol.purchase_order_id = p_po_id
       AND pol.company_id = p_company_id
       AND pol.quantity > COALESCE((
         SELECT SUM(gl.received_quantity)
         FROM grn_lines gl
         WHERE gl.purchase_order_line_id = pol.id
           AND gl.company_id = p_company_id
       ), 0)
  ) INTO v_all_fulfilled;

  IF v_all_fulfilled AND v_po_status = 'approved' THEN
    UPDATE purchase_orders
       SET lifecycle_status = 'fulfilled', updated_at = now()
     WHERE id = p_po_id AND company_id = p_company_id;
  END IF;

  RETURN v_grn_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_grn(text, text, uuid, date, text, text, jsonb) TO authenticated;

-- ── Helper RPC: per-po_line receipt summary for the receive form ────────────
-- Used by the GRN creation form to show "ordered N, already received M,
-- remaining N-M" so the operator can pick how much to receive per line.

CREATE OR REPLACE FUNCTION get_po_line_receipts(
  p_company_id text,
  p_po_id      uuid
)
RETURNS TABLE (
  purchase_order_line_id uuid,
  line_no                int,
  chassis_no             text,
  model                  text,
  variant                text,
  ordered_quantity       numeric,
  received_quantity      numeric,
  remaining_quantity     numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
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
    pol.id,
    pol.line_no,
    pol.chassis_no,
    pol.model,
    pol.variant,
    pol.quantity AS ordered_quantity,
    COALESCE((
      SELECT SUM(gl.received_quantity)
      FROM grn_lines gl
      WHERE gl.purchase_order_line_id = pol.id
        AND gl.company_id = p_company_id
    ), 0) AS received_quantity,
    pol.quantity - COALESCE((
      SELECT SUM(gl.received_quantity)
      FROM grn_lines gl
      WHERE gl.purchase_order_line_id = pol.id
        AND gl.company_id = p_company_id
    ), 0) AS remaining_quantity
  FROM purchase_order_lines pol
  WHERE pol.purchase_order_id = p_po_id
    AND pol.company_id = p_company_id
  ORDER BY pol.line_no;
END;
$$;

GRANT EXECUTE ON FUNCTION get_po_line_receipts(text, uuid) TO authenticated;
