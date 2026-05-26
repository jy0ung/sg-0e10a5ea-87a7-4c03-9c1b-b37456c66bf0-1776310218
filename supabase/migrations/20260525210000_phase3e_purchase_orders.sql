-- Phase 3e.1: Purchase Orders foundation
-- First slice of the AP-lifecycle expansion. Until now, purchase_invoices
-- have been free-standing — there's no record of what was *ordered*, only
-- what was invoiced. This phase adds:
--
--   • purchase_orders          — header (supplier, dates, totals, lifecycle)
--   • purchase_order_lines     — one row per chassis / unit ordered
--   • transition_po_status RPC — validated state machine
--   • create_purchase_order RPC — header + lines in one atomic call
--   • purchase_invoices gains a nullable po_line_id FK so 3-way match
--     (Phase 3e.3) can link PI → PO line without further schema churn
--
-- Lifecycle: draft → submitted → approved → fulfilled → closed
--             ↘ cancelled (allowed from draft / submitted / approved)
-- Once closed or cancelled, the PO is immutable.

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              text          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  po_no                   text          NOT NULL,
  supplier                text          NOT NULL,
  order_date              date          NOT NULL,
  expected_delivery_date  date,
  lifecycle_status        text          NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'submitted', 'approved', 'fulfilled', 'closed', 'cancelled')),
  total_amount            numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes                   text,
  created_by              uuid          REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by             uuid          REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at             timestamptz,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (company_id, po_no)
);

CREATE INDEX IF NOT EXISTS purchase_orders_company_status_idx
  ON public.purchase_orders (company_id, lifecycle_status, order_date DESC);

CREATE INDEX IF NOT EXISTS purchase_orders_company_supplier_idx
  ON public.purchase_orders (company_id, supplier);

COMMENT ON TABLE public.purchase_orders IS
  'Purchase order headers. Each PO has one or more purchase_order_lines and may be matched to one or more purchase_invoices via po_line_id.';

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_select" ON public.purchase_orders
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- Direct DML is allowed for same-company users; the RPCs are the preferred
-- entry point but a thin admin tool could insert directly without RLS edits.
CREATE POLICY "purchase_orders_insert" ON public.purchase_orders
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "purchase_orders_update" ON public.purchase_orders
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── Lines ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           text          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  purchase_order_id    uuid          NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  line_no              int           NOT NULL CHECK (line_no >= 1),
  chassis_no           text,
  model                text          NOT NULL,
  variant              text,
  quantity             numeric(8,2)  NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price           numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_amount          numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, line_no)
);

CREATE INDEX IF NOT EXISTS purchase_order_lines_po_idx
  ON public.purchase_order_lines (purchase_order_id);

CREATE INDEX IF NOT EXISTS purchase_order_lines_chassis_idx
  ON public.purchase_order_lines (company_id, chassis_no)
  WHERE chassis_no IS NOT NULL;

ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_order_lines_select" ON public.purchase_order_lines
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "purchase_order_lines_insert" ON public.purchase_order_lines
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "purchase_order_lines_update" ON public.purchase_order_lines
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "purchase_order_lines_delete" ON public.purchase_order_lines
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── PI link (forward-compat for 3-way match in 3e.3) ─────────────────────────

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS po_line_id uuid REFERENCES public.purchase_order_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchase_invoices_po_line_idx
  ON public.purchase_invoices (po_line_id) WHERE po_line_id IS NOT NULL;

-- ── Atomic create_purchase_order RPC ─────────────────────────────────────────
-- Inserts a PO header + lines in one transaction; recomputes total_amount
-- from the lines so the header stays consistent. Returns the new PO id.

CREATE OR REPLACE FUNCTION create_purchase_order(
  p_company_id text,
  p_po_no                  text,
  p_supplier               text,
  p_order_date             date,
  p_expected_delivery_date date,
  p_notes                  text,
  p_lines                  jsonb   -- [{ line_no, chassis_no?, model, variant?, quantity, unit_price }, ...]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_po_id     uuid;
  v_total     numeric(12,2) := 0;
  v_line      jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = v_caller_id
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_po_no IS NULL OR length(trim(p_po_no)) = 0 THEN
    RAISE EXCEPTION 'po_no is required';
  END IF;

  IF p_supplier IS NULL OR length(trim(p_supplier)) = 0 THEN
    RAISE EXCEPTION 'supplier is required';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line is required';
  END IF;

  -- Insert header with 0 total; we'll update after inserting lines
  INSERT INTO purchase_orders (
    company_id, po_no, supplier, order_date, expected_delivery_date, notes, created_by, total_amount
  ) VALUES (
    p_company_id, p_po_no, p_supplier, p_order_date, p_expected_delivery_date, p_notes, v_caller_id, 0
  )
  RETURNING id INTO v_po_id;

  -- Insert lines
  FOR v_line IN SELECT jsonb_array_elements(p_lines) LOOP
    INSERT INTO purchase_order_lines (
      company_id, purchase_order_id, line_no, chassis_no, model, variant, quantity, unit_price
    ) VALUES (
      p_company_id,
      v_po_id,
      (v_line->>'line_no')::int,
      NULLIF(v_line->>'chassis_no', ''),
      v_line->>'model',
      NULLIF(v_line->>'variant', ''),
      COALESCE((v_line->>'quantity')::numeric, 1),
      COALESCE((v_line->>'unit_price')::numeric, 0)
    );
    v_total := v_total + (COALESCE((v_line->>'quantity')::numeric, 1) * COALESCE((v_line->>'unit_price')::numeric, 0));
  END LOOP;

  -- Update header total to reflect computed line sums
  UPDATE purchase_orders SET total_amount = v_total, updated_at = now() WHERE id = v_po_id;

  RETURN v_po_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_purchase_order(text, text, text, date, date, text, jsonb) TO authenticated;

-- ── transition_po_status: validated state machine ────────────────────────────

CREATE OR REPLACE FUNCTION transition_po_status(
  p_company_id    text,
  p_id            uuid,
  p_target_status text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
  v_current     text;
BEGIN
  SELECT role INTO v_caller_role
    FROM profiles
   WHERE id = v_caller_id
     AND (company_id = p_company_id OR access_scope = 'global');

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_target_status NOT IN ('submitted', 'approved', 'fulfilled', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid target_status: %', p_target_status;
  END IF;

  -- Approvals (approved / fulfilled / closed) require manager+
  IF p_target_status IN ('approved', 'fulfilled', 'closed')
     AND v_caller_role NOT IN ('super_admin', 'company_admin', 'director', 'general_manager', 'manager') THEN
    RAISE EXCEPTION 'Insufficient role for transition to %: %', p_target_status, v_caller_role;
  END IF;

  SELECT lifecycle_status INTO v_current
    FROM purchase_orders
   WHERE id = p_id AND company_id = p_company_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found for company %', p_id, p_company_id;
  END IF;

  -- Allowed transitions
  IF NOT (
    (v_current = 'draft'     AND p_target_status IN ('submitted', 'cancelled')) OR
    (v_current = 'submitted' AND p_target_status IN ('approved', 'cancelled'))  OR
    (v_current = 'approved'  AND p_target_status IN ('fulfilled', 'cancelled')) OR
    (v_current = 'fulfilled' AND p_target_status = 'closed')
  ) THEN
    RAISE EXCEPTION 'Disallowed transition: % → %', v_current, p_target_status;
  END IF;

  UPDATE purchase_orders
     SET lifecycle_status = p_target_status,
         approved_at      = CASE WHEN p_target_status = 'approved' THEN now() ELSE approved_at END,
         approved_by      = CASE WHEN p_target_status = 'approved' THEN v_caller_id ELSE approved_by END,
         updated_at       = now()
   WHERE id = p_id AND company_id = p_company_id;

  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION transition_po_status(text, uuid, text) TO authenticated;

-- Phase 3e feature flag (global, default-off).
INSERT INTO public.feature_flags (company_id, code, enabled, description)
VALUES (NULL, 'phase3e.po-grn-v2', false, 'Purchase Orders + GRN + 3-way match against purchase_invoices.')
ON CONFLICT DO NOTHING;
