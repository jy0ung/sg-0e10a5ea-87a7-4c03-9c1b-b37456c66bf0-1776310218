-- A Purchasing invoice must select a canonical PO line before three-way match.
-- Direct authenticated writes cannot bypass the validated, audited command.
CREATE OR REPLACE FUNCTION public.guard_purchase_invoice_po_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user = 'authenticated' AND (
    (TG_OP = 'INSERT' AND NEW.po_line_id IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.po_line_id IS DISTINCT FROM OLD.po_line_id)
  ) THEN
    RAISE EXCEPTION 'Use the Purchasing PO-line link command';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_purchase_invoice_po_link() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_purchase_invoice_po_link
BEFORE INSERT OR UPDATE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_invoice_po_link();

CREATE OR REPLACE FUNCTION public.link_purchase_invoice_po_line(
  p_invoice_id uuid,
  p_po_line_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company_id text;
  v_invoice public.purchase_invoices%ROWTYPE;
  v_line public.purchase_order_lines%ROWTYPE;
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT p.company_id INTO v_company_id
    FROM public.profiles p
   WHERE p.id = v_actor AND p.status = 'active'
     AND p.role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'manager');
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized to link purchase invoices'; END IF;

  SELECT pi.* INTO v_invoice
    FROM public.purchase_invoices pi
   WHERE pi.id = p_invoice_id AND pi.company_id = v_company_id
     AND (pi.is_deleted IS NULL OR pi.is_deleted = false)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase invoice not found in your company'; END IF;
  IF v_invoice.po_line_id = p_po_line_id THEN RETURN p_invoice_id; END IF;
  IF v_invoice.status <> 'pending' OR v_invoice.lifecycle_status <> 'received'
     OR v_invoice.paid_amount <> 0 OR v_invoice.payment_status <> 'unpaid' THEN
    RAISE EXCEPTION 'Only a pending, unpaid invoice can change its PO link';
  END IF;

  SELECT pol.* INTO v_line
    FROM public.purchase_order_lines pol
   WHERE pol.id = p_po_line_id AND pol.company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO line not found in invoice company'; END IF;
  SELECT po.* INTO v_po
    FROM public.purchase_orders po
   WHERE po.id = v_line.purchase_order_id AND po.company_id = v_company_id
     AND po.lifecycle_status IN ('approved', 'fulfilled');
  IF NOT FOUND THEN RAISE EXCEPTION 'PO must belong to invoice company and be approved or fulfilled'; END IF;
  IF NULLIF(pg_catalog.btrim(v_line.chassis_no), '') IS NOT NULL
     AND pg_catalog.upper(pg_catalog.btrim(v_line.chassis_no))
         <> pg_catalog.upper(pg_catalog.btrim(v_invoice.chassis_no)) THEN
    RAISE EXCEPTION 'Invoice chassis differs from selected PO line';
  END IF;

  UPDATE public.purchase_invoices SET po_line_id = p_po_line_id WHERE id = p_invoice_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'link', 'purchase_invoice', p_invoice_id, 'purchase_invoices',
    pg_catalog.jsonb_build_object('before_po_line_id', v_invoice.po_line_id,
      'after_po_line_id', p_po_line_id, 'purchase_order_id', v_po.id));
  RETURN p_invoice_id;
END;
$$;
REVOKE ALL ON FUNCTION public.link_purchase_invoice_po_line(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_purchase_invoice_po_line(uuid, uuid) TO authenticated;

-- Creating a linked invoice and recording its link must succeed or fail together.
CREATE OR REPLACE FUNCTION public.create_linked_purchase_invoice(
  p_invoice_no text,
  p_supplier text,
  p_chassis_no text,
  p_model text,
  p_invoice_date date,
  p_amount numeric,
  p_remark text,
  p_po_line_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company_id text;
  v_invoice_id uuid;
BEGIN
  SELECT p.company_id INTO v_company_id
    FROM public.profiles p
   WHERE p.id = v_actor AND p.status = 'active'
     AND p.role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'manager');
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized to create linked purchase invoices'; END IF;
  IF p_po_line_id IS NULL THEN RAISE EXCEPTION 'PO line is required'; END IF;
  INSERT INTO public.purchase_invoices (
    company_id, invoice_no, supplier, chassis_no, model, invoice_date,
    amount, status, remark
  ) VALUES (
    v_company_id, p_invoice_no, p_supplier, pg_catalog.upper(pg_catalog.btrim(p_chassis_no)),
    p_model, p_invoice_date, p_amount, 'pending', p_remark
  ) RETURNING id INTO v_invoice_id;
  PERFORM public.link_purchase_invoice_po_line(v_invoice_id, p_po_line_id);
  RETURN v_invoice_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_linked_purchase_invoice(text, text, text, text, date, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_linked_purchase_invoice(text, text, text, text, date, numeric, text, uuid) TO authenticated;
