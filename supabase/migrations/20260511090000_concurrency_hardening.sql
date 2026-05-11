-- P1.3: Concurrency hardening
--
-- 1. commit_import_batch: Add pg_advisory_xact_lock to serialize concurrent
--    commits on the same batch, preventing duplicate quality_issues inserts.
--    Also adds an idempotency guard so a second caller returns immediately if
--    the batch is already published.
--
-- 2. auto_aging_report: Load SLA policies once into plpgsql variables at the
--    start of the function rather than running N correlated sub-queries
--    (one per KPI per report branch).  Reduces 14+ sub-queries to 1 per call.

-- ── 1. commit_import_batch ────────────────────────────────────────────────────
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
  -- ── Acquire advisory lock to serialize concurrent commits on same batch ──
  -- Uses a transaction-level lock (released automatically on COMMIT/ROLLBACK).
  -- hashtext converts the UUID string into a stable bigint lock key.
  perform pg_advisory_xact_lock(hashtext(p_batch_id::text));

  -- Re-read batch AFTER acquiring lock (another session may have committed it).
  select * into v_batch from public.import_batches where id = p_batch_id;
  if not found then
    raise exception 'import batch % not found', p_batch_id using errcode = 'P0002';
  end if;

  -- Idempotency guard: if already published, return without re-running.
  if v_batch.status = 'published' then
    return jsonb_build_object(
      'batch_id', p_batch_id,
      'vehicles_upserted', 0,
      'quality_issues_inserted', 0,
      'already_committed', true
    );
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
        shipment_name, lou, contra_sola, reg_no, invoice_no, obr, salesman_id,
        company_id
      )
      select
        i.chassis_no, i.bg_date, i.shipment_etd_pkg, i.shipment_eta_kk_twu_sdk,
        i.date_received_by_outlet, i.reg_date, i.delivery_date, i.disb_date,
        i.branch_code, i.model, i.payment_method, i.salesman_name, i.customer_name,
        i.remark, i.vaa_date, i.full_payment_date, i.is_d2d, i.import_batch_id,
        i.source_row_id, i.variant, i.dealer_transfer_price, i.full_payment_type,
        i.shipment_name, i.lou, i.contra_sola, i.reg_no, i.invoice_no, i.obr,
        i.salesman_id,
        v_batch.company_id
      from incoming i
      on conflict (chassis_no, company_id) do update set
        bg_date                    = coalesce(excluded.bg_date, vehicles.bg_date),
        shipment_etd_pkg           = coalesce(excluded.shipment_etd_pkg, vehicles.shipment_etd_pkg),
        shipment_eta_kk_twu_sdk    = coalesce(excluded.shipment_eta_kk_twu_sdk, vehicles.shipment_eta_kk_twu_sdk),
        date_received_by_outlet    = coalesce(excluded.date_received_by_outlet, vehicles.date_received_by_outlet),
        reg_date                   = coalesce(excluded.reg_date, vehicles.reg_date),
        delivery_date              = coalesce(excluded.delivery_date, vehicles.delivery_date),
        disb_date                  = coalesce(excluded.disb_date, vehicles.disb_date),
        branch_code                = coalesce(excluded.branch_code, vehicles.branch_code),
        model                      = coalesce(excluded.model, vehicles.model),
        payment_method             = coalesce(excluded.payment_method, vehicles.payment_method),
        salesman_name              = coalesce(excluded.salesman_name, vehicles.salesman_name),
        customer_name              = coalesce(excluded.customer_name, vehicles.customer_name),
        remark                     = coalesce(excluded.remark, vehicles.remark),
        vaa_date                   = coalesce(excluded.vaa_date, vehicles.vaa_date),
        full_payment_date          = coalesce(excluded.full_payment_date, vehicles.full_payment_date),
        is_d2d                     = coalesce(excluded.is_d2d, vehicles.is_d2d),
        import_batch_id            = coalesce(excluded.import_batch_id, vehicles.import_batch_id),
        source_row_id              = coalesce(excluded.source_row_id, vehicles.source_row_id),
        variant                    = coalesce(excluded.variant, vehicles.variant),
        dealer_transfer_price      = coalesce(excluded.dealer_transfer_price, vehicles.dealer_transfer_price),
        full_payment_type          = coalesce(excluded.full_payment_type, vehicles.full_payment_type),
        shipment_name              = coalesce(excluded.shipment_name, vehicles.shipment_name),
        lou                        = coalesce(excluded.lou, vehicles.lou),
        contra_sola                = coalesce(excluded.contra_sola, vehicles.contra_sola),
        reg_no                     = coalesce(excluded.reg_no, vehicles.reg_no),
        invoice_no                 = coalesce(excluded.invoice_no, vehicles.invoice_no),
        obr                        = coalesce(excluded.obr, vehicles.obr),
        salesman_id                = coalesce(excluded.salesman_id, vehicles.salesman_id)
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
        severity text,
        company_id text
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
  'Transactional commit for an import batch. Acquires a per-batch advisory lock
   to serialize concurrent commits; returns immediately if batch is already published.
   Upserts vehicles, inserts quality issues, finalizes batch status.';

-- ── 2. auto_aging_report — SLA lookup de-duplication ────────────────────────
-- Replace correlated sub-queries (1 per KPI per branch) with a single
-- per-company SLA load stored in plpgsql integer variables.

drop function if exists public.auto_aging_report(text, text, text, date, date, integer, integer);

create or replace function public.auto_aging_report(
  p_report_type text,
  p_branch text default null,
  p_model text default null,
  p_bg_date_from date default null,
  p_bg_date_to date default null,
  p_limit integer default 500,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_company_id        text;
  v_limit             integer;
  v_offset            integer;
  v_result            jsonb;
  -- SLA defaults (overridden per company below)
  v_sla_bg_delivery   integer := 45;
  v_sla_bg_etd        integer := 14;
  v_sla_etd_outlet    integer := 28;
  v_sla_outlet_reg    integer := 7;
  v_sla_reg_delivery  integer := 14;
  v_sla_bg_disb       integer := 60;
  v_sla_delivery_disb integer := 14;
begin
  select company_id into v_company_id from public.profiles where id = auth.uid();
  if v_company_id is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total_count', 0);
  end if;

  v_limit  := greatest(1, least(coalesce(p_limit, 500), 10000));
  v_offset := greatest(0, coalesce(p_offset, 0));

  -- Load all SLA overrides for this company in ONE query (replaces N sub-queries).
  select
    max(case when kpi_id = 'bg_to_delivery'    then sla_days end),
    max(case when kpi_id = 'bg_to_shipment_etd' then sla_days end),
    max(case when kpi_id = 'etd_to_outlet'     then sla_days end),
    max(case when kpi_id = 'outlet_to_reg'     then sla_days end),
    max(case when kpi_id = 'reg_to_delivery'   then sla_days end),
    max(case when kpi_id = 'bg_to_disb'        then sla_days end),
    max(case when kpi_id = 'delivery_to_disb'  then sla_days end)
  into
    v_sla_bg_delivery, v_sla_bg_etd, v_sla_etd_outlet,
    v_sla_outlet_reg,  v_sla_reg_delivery, v_sla_bg_disb, v_sla_delivery_disb
  from public.sla_policies
  where company_id = v_company_id;

  -- Apply defaults for any KPI with no company override.
  v_sla_bg_delivery   := coalesce(v_sla_bg_delivery,   45);
  v_sla_bg_etd        := coalesce(v_sla_bg_etd,        14);
  v_sla_etd_outlet    := coalesce(v_sla_etd_outlet,    28);
  v_sla_outlet_reg    := coalesce(v_sla_outlet_reg,     7);
  v_sla_reg_delivery  := coalesce(v_sla_reg_delivery,  14);
  v_sla_bg_disb       := coalesce(v_sla_bg_disb,       60);
  v_sla_delivery_disb := coalesce(v_sla_delivery_disb, 14);

  if p_report_type = 'aging_summary' then
    with filtered as (
      select *
        from public.vehicles v
       where v.company_id = v_company_id
         and v.is_deleted = false
         and (p_branch is null or v.branch_code = p_branch)
         and (p_model  is null or v.model        = p_model)
         and (p_bg_date_from is null or v.bg_date >= p_bg_date_from)
         and (p_bg_date_to   is null or v.bg_date <= p_bg_date_to)
    ),
    kpi_rows as (
      select 1 as sort_order, 'bg_to_delivery'::text as kpi_id, 'BG Date to Delivery Date'::text as label, 'BG → Delivery'::text as short_label, v_sla_bg_delivery as sla_days,
             bg_to_delivery::numeric as value,
             bg_to_delivery is null as is_missing,
             bg_to_delivery is not null and bg_to_delivery < 0 as is_invalid
        from filtered
      union all
      select 2, 'bg_to_shipment_etd', 'BG Date to Shipment ETD PKG', 'BG → ETD', v_sla_bg_etd,
             bg_to_shipment_etd::numeric, bg_to_shipment_etd is null,
             bg_to_shipment_etd is not null and bg_to_shipment_etd < 0
        from filtered
      union all
      select 3, 'etd_to_outlet', 'Shipment ETD PKG to Date Received by Outlet', 'ETD → Outlet', v_sla_etd_outlet,
             etd_to_outlet::numeric, etd_to_outlet is null,
             etd_to_outlet is not null and etd_to_outlet < 0
        from filtered
      union all
      select 4, 'outlet_to_reg', 'Date Received by Outlet to Registration Date', 'Outlet → Reg', v_sla_outlet_reg,
             outlet_to_reg::numeric, outlet_to_reg is null,
             outlet_to_reg is not null and outlet_to_reg < 0
        from filtered
      union all
      select 5, 'reg_to_delivery', 'Registration Date to Delivery Date', 'Reg → Delivery', v_sla_reg_delivery,
             reg_to_delivery::numeric, reg_to_delivery is null,
             reg_to_delivery is not null and reg_to_delivery < 0
        from filtered
      union all
      select 6, 'bg_to_disb', 'BG Date to Disb. Date', 'BG → Disb', v_sla_bg_disb,
             bg_to_disb::numeric, bg_to_disb is null,
             bg_to_disb is not null and bg_to_disb < 0
        from filtered
      union all
      select 7, 'delivery_to_disb', 'Delivery Date to Disb. Date', 'Delivery → Disb', v_sla_delivery_disb,
             delivery_to_disb::numeric, delivery_to_disb is null,
             delivery_to_disb is not null and delivery_to_disb < 0
        from filtered
    ),
    summary_rows as (
      select sort_order,
             kpi_id,
             label as "KPI",
             short_label as "Short Label",
             count(*) filter (where value is not null and is_missing = false and is_invalid = false) as "Valid Vehicles",
             count(*) filter (where is_missing)  as "Missing",
             count(*) filter (where is_invalid)  as "Invalid",
             coalesce(round(percentile_cont(0.5) within group (order by value) filter (where value is not null and is_missing = false and is_invalid = false))::numeric, 0) as "Median (days)",
             coalesce(round(avg(value)            filter (where value is not null and is_missing = false and is_invalid = false))::numeric, 0) as "Average (days)",
             coalesce(round(percentile_cont(0.9) within group (order by value) filter (where value is not null and is_missing = false and is_invalid = false))::numeric, 0) as "P90 (days)",
             sla_days,
             count(*) filter (
               where value is not null and is_missing = false and is_invalid = false
                 and value > sla_days
             ) as overdue_raw
        from kpi_rows
       group by sort_order, kpi_id, label, short_label, sla_days
    ),
    formatted as (
      select jsonb_build_object(
        'KPI',              "KPI",
        'Short Label',      "Short Label",
        'Valid Vehicles',   "Valid Vehicles",
        'Missing',          "Missing",
        'Invalid',          "Invalid",
        'Median (days)',    "Median (days)",
        'Average (days)',   "Average (days)",
        'P90 (days)',       "P90 (days)",
        'SLA (days)',       sla_days,
        'Overdue',          overdue_raw,
        'Overdue %', case when "Valid Vehicles" > 0
                     then round((overdue_raw::numeric / "Valid Vehicles") * 100) || '%'
                     else '0%' end
      ) as row_obj
      from summary_rows
      order by sort_order
    )
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(row_obj), '[]'::jsonb),
      'total_count', (select count(*) from formatted)
    ) into v_result
    from formatted;

  elsif p_report_type = 'sla_compliance' then
    with filtered as (
      select *
        from public.vehicles v
       where v.company_id = v_company_id
         and v.is_deleted = false
         and (p_branch is null or v.branch_code = p_branch)
         and (p_model  is null or v.model        = p_model)
         and (p_bg_date_from is null or v.bg_date >= p_bg_date_from)
         and (p_bg_date_to   is null or v.bg_date <= p_bg_date_to)
    ),
    branch_kpi as (
      select
        branch_code as branch,
        count(*) as vehicle_count,
        coalesce(round(percentile_cont(0.5) within group (order by bg_to_delivery)   filter (where bg_to_delivery   is not null and bg_to_delivery   >= 0))::numeric, 0) as "BG → Delivery Median",
        count(*) filter (where bg_to_delivery   is not null and bg_to_delivery   >= 0 and bg_to_delivery   > v_sla_bg_delivery)   as "BG → Delivery Overdue",
        coalesce(round(percentile_cont(0.5) within group (order by bg_to_shipment_etd) filter (where bg_to_shipment_etd is not null and bg_to_shipment_etd >= 0))::numeric, 0) as "BG → ETD Median",
        count(*) filter (where bg_to_shipment_etd is not null and bg_to_shipment_etd >= 0 and bg_to_shipment_etd > v_sla_bg_etd) as "BG → ETD Overdue",
        coalesce(round(percentile_cont(0.5) within group (order by etd_to_outlet)    filter (where etd_to_outlet    is not null and etd_to_outlet    >= 0))::numeric, 0) as "ETD → Outlet Median",
        count(*) filter (where etd_to_outlet    is not null and etd_to_outlet    >= 0 and etd_to_outlet    > v_sla_etd_outlet)   as "ETD → Outlet Overdue",
        coalesce(round(percentile_cont(0.5) within group (order by outlet_to_reg)    filter (where outlet_to_reg    is not null and outlet_to_reg    >= 0))::numeric, 0) as "Outlet → Reg Median",
        count(*) filter (where outlet_to_reg    is not null and outlet_to_reg    >= 0 and outlet_to_reg    > v_sla_outlet_reg)   as "Outlet → Reg Overdue",
        coalesce(round(percentile_cont(0.5) within group (order by reg_to_delivery)  filter (where reg_to_delivery  is not null and reg_to_delivery  >= 0))::numeric, 0) as "Reg → Delivery Median",
        count(*) filter (where reg_to_delivery  is not null and reg_to_delivery  >= 0 and reg_to_delivery  > v_sla_reg_delivery) as "Reg → Delivery Overdue",
        coalesce(round(percentile_cont(0.5) within group (order by bg_to_disb)       filter (where bg_to_disb       is not null and bg_to_disb       >= 0))::numeric, 0) as "BG → Disb Median",
        count(*) filter (where bg_to_disb       is not null and bg_to_disb       >= 0 and bg_to_disb       > v_sla_bg_disb)       as "BG → Disb Overdue",
        coalesce(round(percentile_cont(0.5) within group (order by delivery_to_disb) filter (where delivery_to_disb is not null and delivery_to_disb >= 0))::numeric, 0) as "Delivery → Disb Median",
        count(*) filter (where delivery_to_disb is not null and delivery_to_disb >= 0 and delivery_to_disb > v_sla_delivery_disb) as "Delivery → Disb Overdue"
      from filtered
      group by branch_code
      order by branch_code
    ),
    formatted as (
      select jsonb_build_object(
        'Branch', branch, 'Vehicles', vehicle_count,
        'BG → Delivery Median',   "BG → Delivery Median",   'BG → Delivery Overdue',   "BG → Delivery Overdue",
        'BG → ETD Median',        "BG → ETD Median",        'BG → ETD Overdue',        "BG → ETD Overdue",
        'ETD → Outlet Median',    "ETD → Outlet Median",    'ETD → Outlet Overdue',    "ETD → Outlet Overdue",
        'Outlet → Reg Median',    "Outlet → Reg Median",    'Outlet → Reg Overdue',    "Outlet → Reg Overdue",
        'Reg → Delivery Median',  "Reg → Delivery Median",  'Reg → Delivery Overdue',  "Reg → Delivery Overdue",
        'BG → Disb Median',       "BG → Disb Median",       'BG → Disb Overdue',       "BG → Disb Overdue",
        'Delivery → Disb Median', "Delivery → Disb Median", 'Delivery → Disb Overdue', "Delivery → Disb Overdue"
      ) as row_obj
      from branch_kpi
    )
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(row_obj), '[]'::jsonb),
      'total_count', (select count(*) from formatted)
    ) into v_result
    from formatted;

  elsif p_report_type = 'salesman_performance' then
    with filtered as (
      select *
        from public.vehicles v
       where v.company_id = v_company_id
         and v.is_deleted = false
         and (p_branch is null or v.branch_code = p_branch)
         and (p_model  is null or v.model        = p_model)
         and (p_bg_date_from is null or v.bg_date >= p_bg_date_from)
         and (p_bg_date_to   is null or v.bg_date <= p_bg_date_to)
    ),
    salesman_stats as (
      select
        salesman_name as "Salesman",
        (array_agg(branch_code order by created_at desc))[1] as "Branch",
        count(*) as "Total Vehicles",
        count(*) filter (where delivery_date is not null) as "Delivered",
        case when count(*) filter (where bg_to_delivery is not null and bg_to_delivery >= 0) > 0
             then round(avg(bg_to_delivery) filter (where bg_to_delivery is not null and bg_to_delivery >= 0))::integer
             else null
        end as "Avg BG→Delivery (days)"
      from filtered
      group by salesman_name
      order by count(*) filter (where delivery_date is not null) desc
    ),
    total as (select count(*) as c from salesman_stats),
    paged as (
      select * from salesman_stats limit v_limit offset v_offset
    ),
    formatted as (
      select jsonb_build_object(
        'Salesman', "Salesman",
        'Branch', coalesce("Branch", '—'),
        'Total Vehicles', "Total Vehicles",
        'Delivered', "Delivered",
        'Avg BG→Delivery (days)', coalesce("Avg BG→Delivery (days)"::text, '—')
      ) as row_obj
      from paged
    )
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(row_obj), '[]'::jsonb),
      'total_count', (select c from total)
    ) into v_result
    from formatted;

  elsif p_report_type = 'vehicle_export' then
    with filtered as (
      select *
        from public.vehicles v
       where v.company_id = v_company_id
         and v.is_deleted = false
         and (p_branch is null or v.branch_code = p_branch)
         and (p_model  is null or v.model        = p_model)
         and (p_bg_date_from is null or v.bg_date >= p_bg_date_from)
         and (p_bg_date_to   is null or v.bg_date <= p_bg_date_to)
    ),
    total as (select count(*) as c from filtered),
    paged as (
      select * from filtered
       order by bg_date desc nulls last, created_at desc
       limit v_limit offset v_offset
    ),
    formatted as (
      select jsonb_build_object(
        'CHASSIS NO.', chassis_no,
        'BRCH K1', branch_code,
        'MODEL', model,
        'VAR', coalesce(variant, ''),
        'COLOR', coalesce(color, ''),
        'CUST NAME', customer_name,
        'SA NAME', salesman_name,
        'PAYMENT METHOD', payment_method,
        'BG DATE', coalesce(bg_date::text, ''),
        'VAA DATE', coalesce(vaa_date::text, ''),
        'FULL PAYMENT TYPE', coalesce(full_payment_type, ''),
        'FULL PAYMENT DATE', coalesce(full_payment_date::text, ''),
        'SHIPMENT NAME', coalesce(shipment_name, ''),
        'SHIPMENT ETD PKG', coalesce(shipment_etd_pkg::text, ''),
        'DATE SHIPMENT ETA KK/TWU/SDK', coalesce(shipment_eta_kk_twu_sdk::text, ''),
        'RECEIVED BY OUTLET', coalesce(date_received_by_outlet::text, ''),
        'LOU', coalesce(lou, ''),
        'CONTRA SOLA', coalesce(contra_sola, ''),
        'REG NO', coalesce(reg_no, ''),
        'REG DATE', coalesce(reg_date::text, ''),
        'INV No.', coalesce(invoice_no, ''),
        'OBR', coalesce(obr, ''),
        'DELIVERY DATE', coalesce(delivery_date::text, ''),
        'DISB. DATE', coalesce(disb_date::text, ''),
        'COMM PAYOUT', case when commission_paid = true then 'Paid' when commission_paid = false then 'Not Paid' else '' end,
        'COMM REMARK', coalesce(commission_remark, ''),
        'REMARK', coalesce(remark, ''),
        'DTP (Dealer Transfer Price)', coalesce(dealer_transfer_price, ''),
        'BG→Delivery (d)', coalesce(bg_to_delivery::text, ''),
        'BG→ETD (d)', coalesce(bg_to_shipment_etd::text, ''),
        'ETD→Outlet (d)', coalesce(etd_to_outlet::text, ''),
        'Outlet→Reg (d)', coalesce(outlet_to_reg::text, ''),
        'Reg→Delivery (d)', coalesce(reg_to_delivery::text, ''),
        'BG→Disb (d)', coalesce(bg_to_disb::text, ''),
        'Delivery→Disb (d)', coalesce(delivery_to_disb::text, ''),
        'D2D', case when is_d2d then 'Yes' else 'No' end
      ) as row_obj
      from paged
    )
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(row_obj), '[]'::jsonb),
      'total_count', (select c from total)
    ) into v_result
    from formatted;

  else
    v_result := jsonb_build_object('rows', '[]'::jsonb, 'total_count', 0);
  end if;

  return v_result;
end;
$$;

revoke all on function public.auto_aging_report(text, text, text, date, date, integer, integer) from public;
grant execute on function public.auto_aging_report(text, text, text, date, date, integer, integer) to authenticated;

comment on function public.auto_aging_report(text, text, text, date, date, integer, integer) is
  'Company-scoped server-side report generator for Auto Aging.
   SLA values are loaded once per call into plpgsql variables (not repeated sub-queries).
   commit_import_batch sibling: uses pg_advisory_xact_lock for serialized batch commits.';
