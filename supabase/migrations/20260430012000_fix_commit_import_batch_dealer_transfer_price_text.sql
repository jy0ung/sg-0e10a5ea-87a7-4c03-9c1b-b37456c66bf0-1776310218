drop function if exists public.commit_import_batch(uuid, jsonb, jsonb, integer, integer);

create or replace function public.commit_import_batch(
  p_batch_id uuid,
  p_vehicles jsonb,
  p_quality_issues jsonb,
  p_valid_rows integer,
  p_error_rows integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.import_batches%rowtype;
  v_caller_company text;
  v_inserted integer := 0;
  v_issues_inserted integer := 0;
begin
  select * into v_batch from public.import_batches where id = p_batch_id;
  if not found then
    raise exception 'import batch % not found', p_batch_id using errcode = 'P0002';
  end if;

  select company_id into v_caller_company from public.profiles where id = auth.uid();
  if v_caller_company is null or v_caller_company <> v_batch.company_id then
    raise exception 'permission denied for batch %', p_batch_id using errcode = '42501';
  end if;

  if p_vehicles is not null and jsonb_typeof(p_vehicles) = 'array' and jsonb_array_length(p_vehicles) > 0 then
    with incoming as (
      select * from jsonb_to_recordset(p_vehicles) as x(
        chassis_no text,
        bg_date date,
        shipment_etd_pkg date,
        shipment_eta_kk_twu_sdk date,
        date_received_by_outlet date,
        reg_date date,
        delivery_date date,
        disb_date date,
        branch_code text,
        model text,
        payment_method text,
        salesman_name text,
        customer_name text,
        remark text,
        vaa_date date,
        full_payment_date date,
        is_d2d boolean,
        import_batch_id uuid,
        source_row_id text,
        variant text,
        dealer_transfer_price text,
        full_payment_type text,
        shipment_name text,
        lou text,
        contra_sola text,
        reg_no text,
        invoice_no text,
        obr text,
        bg_to_delivery integer,
        bg_to_shipment_etd integer,
        etd_to_outlet integer,
        outlet_to_reg integer,
        reg_to_delivery integer,
        bg_to_disb integer,
        delivery_to_disb integer,
        salesman_id uuid,
        company_id text
      )
    ),
    ins as (
      insert into public.vehicles (
        chassis_no, bg_date, shipment_etd_pkg, shipment_eta_kk_twu_sdk,
        date_received_by_outlet, reg_date, delivery_date, disb_date,
        branch_code, model, payment_method, salesman_name, customer_name,
        remark, vaa_date, full_payment_date, is_d2d, import_batch_id,
        source_row_id, variant, dealer_transfer_price, full_payment_type,
        shipment_name, lou, contra_sola, reg_no, invoice_no, obr,
        bg_to_delivery, bg_to_shipment_etd, etd_to_outlet, outlet_to_reg,
        reg_to_delivery, bg_to_disb, delivery_to_disb, salesman_id, company_id
      )
      select
        chassis_no, bg_date, shipment_etd_pkg, shipment_eta_kk_twu_sdk,
        date_received_by_outlet, reg_date, delivery_date, disb_date,
        branch_code, model, payment_method, salesman_name, customer_name,
        remark, vaa_date, full_payment_date, is_d2d, p_batch_id,
        source_row_id, variant, dealer_transfer_price, full_payment_type,
        shipment_name, lou, contra_sola, reg_no, invoice_no, obr,
        bg_to_delivery, bg_to_shipment_etd, etd_to_outlet, outlet_to_reg,
        reg_to_delivery, bg_to_disb, delivery_to_disb, salesman_id,
        v_batch.company_id
      from incoming
      where company_id = v_batch.company_id
      on conflict (chassis_no, company_id) do update set
        bg_date = excluded.bg_date,
        shipment_etd_pkg = excluded.shipment_etd_pkg,
        shipment_eta_kk_twu_sdk = excluded.shipment_eta_kk_twu_sdk,
        date_received_by_outlet = excluded.date_received_by_outlet,
        reg_date = excluded.reg_date,
        delivery_date = excluded.delivery_date,
        disb_date = excluded.disb_date,
        branch_code = excluded.branch_code,
        model = excluded.model,
        payment_method = excluded.payment_method,
        salesman_name = excluded.salesman_name,
        customer_name = excluded.customer_name,
        remark = excluded.remark,
        vaa_date = excluded.vaa_date,
        full_payment_date = excluded.full_payment_date,
        is_d2d = excluded.is_d2d,
        import_batch_id = excluded.import_batch_id,
        source_row_id = excluded.source_row_id,
        variant = excluded.variant,
        dealer_transfer_price = excluded.dealer_transfer_price,
        full_payment_type = excluded.full_payment_type,
        shipment_name = excluded.shipment_name,
        lou = excluded.lou,
        contra_sola = excluded.contra_sola,
        reg_no = excluded.reg_no,
        invoice_no = excluded.invoice_no,
        obr = excluded.obr,
        bg_to_delivery = excluded.bg_to_delivery,
        bg_to_shipment_etd = excluded.bg_to_shipment_etd,
        etd_to_outlet = excluded.etd_to_outlet,
        outlet_to_reg = excluded.outlet_to_reg,
        reg_to_delivery = excluded.reg_to_delivery,
        bg_to_disb = excluded.bg_to_disb,
        delivery_to_disb = excluded.delivery_to_disb,
        salesman_id = excluded.salesman_id
      returning 1
    )
    select count(*) into v_inserted from ins;
  end if;

  if p_quality_issues is not null and jsonb_typeof(p_quality_issues) = 'array' and jsonb_array_length(p_quality_issues) > 0 then
    with incoming as (
      select * from jsonb_to_recordset(p_quality_issues) as x(
        chassis_no text,
        field text,
        issue_type text,
        message text,
        severity text
      )
    ),
    ins as (
      insert into public.quality_issues (
        chassis_no, field, issue_type, message, severity, import_batch_id, company_id
      )
      select chassis_no, field, issue_type, message, severity, p_batch_id, v_batch.company_id
      from incoming
      returning 1
    )
    select count(*) into v_issues_inserted from ins;
  end if;

  update public.import_batches
     set status = 'published',
         published_at = now(),
         valid_rows = coalesce(p_valid_rows, valid_rows),
         error_rows = coalesce(p_error_rows, error_rows)
   where id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'vehicles_upserted', v_inserted,
    'quality_issues_inserted', v_issues_inserted
  );
end;
$$;

revoke all on function public.commit_import_batch(uuid, jsonb, jsonb, integer, integer) from public;
grant execute on function public.commit_import_batch(uuid, jsonb, jsonb, integer, integer) to authenticated;

comment on function public.commit_import_batch(uuid, jsonb, jsonb, integer, integer) is
  'Transactional commit for an import batch. Upserts vehicles, inserts quality issues, finalizes batch status, and keeps dealer_transfer_price aligned with the live text column schema.';