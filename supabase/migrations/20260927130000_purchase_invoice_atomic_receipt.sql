-- Purchasing owns the receipt command; Inventory owns the Vehicle mutation.
-- Both execute in the same PostgreSQL transaction so a conflict rolls back
-- the invoice status, Vehicle changes, and audit row together.

CREATE OR REPLACE FUNCTION public.record_vehicle_purchase_receipt(
  p_company_id text,
  p_chassis_no text,
  p_model text,
  p_branch_id text,
  p_branch_code text,
  p_invoice_no text,
  p_received_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_chassis text := upper(btrim(p_chassis_no));
  v_vehicle public.vehicles%ROWTYPE;
  v_count integer;
BEGIN
  IF v_chassis = '' OR p_model IS NULL OR btrim(p_model) = '' THEN
    RAISE EXCEPTION 'Invoice chassis and model are required';
  END IF;

  -- Serialize receipt of the same company/chassis even through separate PIs.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id || ':' || v_chassis, 0)
  );

  SELECT count(*) INTO v_count
    FROM public.vehicles v
   WHERE v.company_id = p_company_id
     AND upper(btrim(v.chassis_no)) = v_chassis
     AND (v.is_deleted IS NULL OR v.is_deleted = false);
  IF v_count > 1 THEN
    RAISE EXCEPTION 'Multiple inventory vehicles match chassis %; reconcile inventory first', v_chassis;
  END IF;

  SELECT v.* INTO v_vehicle
    FROM public.vehicles v
   WHERE v.company_id = p_company_id
     AND upper(btrim(v.chassis_no)) = v_chassis
     AND (v.is_deleted IS NULL OR v.is_deleted = false)
   FOR UPDATE;

  IF FOUND THEN
    IF (v_vehicle.company_branch_id IS NOT NULL AND v_vehicle.company_branch_id <> p_branch_id)
       OR (v_vehicle.branch_code IS NOT NULL AND v_vehicle.branch_code <> 'Unknown'
           AND v_vehicle.branch_code <> p_branch_code) THEN
      RAISE EXCEPTION 'Inventory branch differs from receiving branch; reconcile inventory first';
    END IF;
    IF v_vehicle.model <> 'Unknown' AND v_vehicle.model <> p_model THEN
      RAISE EXCEPTION 'Inventory model differs from invoice; reconcile inventory first';
    END IF;
    IF v_vehicle.invoice_no IS NOT NULL AND v_vehicle.invoice_no <> p_invoice_no THEN
      RAISE EXCEPTION 'Inventory invoice differs from purchase invoice; reconcile inventory first';
    END IF;
    UPDATE public.vehicles
       SET company_branch_id = COALESCE(company_branch_id, p_branch_id),
           branch_code = CASE WHEN branch_code = 'Unknown' THEN p_branch_code ELSE branch_code END,
           model = CASE WHEN model = 'Unknown' THEN p_model ELSE model END,
           date_received_by_outlet = COALESCE(date_received_by_outlet, p_received_date),
           invoice_no = COALESCE(invoice_no, p_invoice_no)
     WHERE id = v_vehicle.id;
    RETURN v_vehicle.id;
  END IF;

  INSERT INTO public.vehicles (
    company_id, chassis_no, model, branch_code, company_branch_id,
    date_received_by_outlet, invoice_no
  ) VALUES (
    p_company_id, v_chassis, p_model, p_branch_code, p_branch_id,
    p_received_date, p_invoice_no
  ) RETURNING id INTO v_vehicle.id;
  RETURN v_vehicle.id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_vehicle_purchase_receipt(text, text, text, text, text, text, date)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.receive_purchase_invoice(
  p_company_id text,
  p_invoice_id uuid,
  p_branch_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_invoice public.purchase_invoices%ROWTYPE;
  v_branch_code text;
  v_vehicle_id uuid;
  v_received_date date := CURRENT_DATE;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_actor
       AND p.company_id = p_company_id
       AND p.status = 'active'
       AND p.role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to receive purchase invoices';
  END IF;

  SELECT pi.* INTO v_invoice
    FROM public.purchase_invoices pi
   WHERE pi.id = p_invoice_id
     AND pi.company_id = p_company_id
     AND (pi.is_deleted IS NULL OR pi.is_deleted = false)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase invoice not found'; END IF;
  IF v_invoice.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending purchase invoices can be received';
  END IF;

  SELECT b.code INTO v_branch_code
    FROM public.branches b
   WHERE b.id = p_branch_id AND b.company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receiving branch does not belong to invoice company'; END IF;

  v_vehicle_id := public.record_vehicle_purchase_receipt(
    p_company_id, v_invoice.chassis_no, v_invoice.model,
    p_branch_id, v_branch_code, v_invoice.invoice_no, v_received_date
  );

  UPDATE public.purchase_invoices
     SET status = 'received', received_date = v_received_date
   WHERE id = p_invoice_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'receive', 'purchase_invoice', p_invoice_id, 'purchase_invoices',
    pg_catalog.jsonb_build_object('before_status', v_invoice.status,
      'after_status', 'received', 'branch_id', p_branch_id, 'vehicle_id', v_vehicle_id));
  RETURN v_vehicle_id;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_invoice(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_invoice(text, uuid, text) TO authenticated;
