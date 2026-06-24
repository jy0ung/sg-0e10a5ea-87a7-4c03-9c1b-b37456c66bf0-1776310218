-- Migration: Auto-create vehicle/stock entries when GRN is created
-- When goods are received (GRN), vehicles from PO lines are automatically added to the vehicles table.

CREATE OR REPLACE FUNCTION public.create_grn(
  p_company_id text,
  p_grn_no text,
  p_po_id uuid,
  p_received_date date,
  p_supplier_dn_no text,
  p_notes text,
  p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
  v_chassis   text;
  v_model     text;
  v_variant   text;
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

    -- Auto-create vehicle/stock entry if chassis_no exists on the PO line
    SELECT pol.chassis_no, pol.model, pol.variant
      INTO v_chassis, v_model, v_variant
      FROM purchase_order_lines pol
     WHERE pol.id = v_po_line_id;

    IF v_chassis IS NOT NULL AND length(trim(v_chassis)) > 0 THEN
      -- Only insert if vehicle doesn't already exist
      INSERT INTO vehicles (
        company_id, chassis_no, model, colour, stage, status, bg_date, created_at, updated_at
      ) VALUES (
        p_company_id,
        trim(v_chassis),
        COALESCE(v_model, 'Unknown'),
        v_variant,
        'pending_register_free_stock',
        'Active',
        p_received_date,
        now(),
        now()
      )
      ON CONFLICT (chassis_no, company_id) DO NOTHING;
    END IF;
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
$function$;
