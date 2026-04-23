-- Phase 2 hotfix: company_id is TEXT, not UUID.
--
-- The Phase 2 RPCs (commit_import_batch, search_vehicles, vehicle_kpi_summary)
-- were authored with `company_id uuid` declarations, but every tenant column in
-- the schema uses `text` (values like 'flc', 'c1'). Any call from the UI fails
-- with "invalid input syntax for type uuid". This migration drops and
-- recreates all three functions with the correct `text` signatures.

-- ---------------------------------------------------------------------------
-- commit_import_batch
-- ---------------------------------------------------------------------------
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
        dealer_transfer_price numeric,
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
  'Transactional commit for an import batch (company_id is text). Upserts vehicles, inserts quality issues, finalizes batch status.';

-- ---------------------------------------------------------------------------
-- search_vehicles
-- ---------------------------------------------------------------------------
drop function if exists public.search_vehicles(text, text, text, boolean, integer, integer, text, text);

create or replace function public.search_vehicles(
  p_branch text default null,
  p_model text default null,
  p_search text default null,
  p_has_delivery_date boolean default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_sort_column text default 'created_at',
  p_sort_direction text default 'desc'
) returns table (
  rows jsonb,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_company_id text;
  v_limit integer;
  v_offset integer;
  v_sort_col text;
  v_sort_dir text;
  v_sort_sql text;
  v_total bigint;
  v_rows jsonb;
begin
  select company_id into v_company_id from public.profiles where id = auth.uid();
  if v_company_id is null then
    return query select '[]'::jsonb as rows, 0::bigint as total_count;
    return;
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 500));
  v_offset := greatest(0, coalesce(p_offset, 0));

  v_sort_col := lower(coalesce(p_sort_column, 'created_at'));
  if v_sort_col not in (
    'created_at', 'chassis_no', 'branch_code', 'model', 'customer_name',
    'salesman_name', 'bg_date', 'delivery_date', 'reg_date', 'disb_date',
    'bg_to_delivery', 'bg_to_disb'
  ) then
    v_sort_col := 'created_at';
  end if;

  v_sort_dir := case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_sort_sql := format('%I %s nulls last, id desc', v_sort_col, v_sort_dir);

  execute format($q$
    with filtered as (
      select *
        from public.vehicles v
       where v.company_id = $1
         and v.is_deleted = false
         and ($2::text is null or v.branch_code = $2)
         and ($3::text is null or v.model = $3)
         and ($5::boolean is null
              or ($5 = true  and v.delivery_date is not null)
              or ($5 = false and v.delivery_date is null))
         and ($4::text is null
              or v.chassis_no ilike '%%' || $4 || '%%'
              or v.customer_name ilike '%%' || $4 || '%%'
              or v.reg_no ilike '%%' || $4 || '%%'
              or v.invoice_no ilike '%%' || $4 || '%%')
    ),
    counted as (select count(*)::bigint as c from filtered),
    paged as (
      select * from filtered
       order by %s
       limit $6 offset $7
    )
    select coalesce(jsonb_agg(to_jsonb(paged.*)), '[]'::jsonb), (select c from counted)
      from paged
  $q$, v_sort_sql)
  into v_rows, v_total
  using v_company_id, p_branch, p_search, p_model, p_has_delivery_date, v_limit, v_offset;

  return query select v_rows, coalesce(v_total, 0);
end;
$$;

revoke all on function public.search_vehicles(text, text, text, boolean, integer, integer, text, text) from public;
grant execute on function public.search_vehicles(text, text, text, boolean, integer, integer, text, text) to authenticated;

comment on function public.search_vehicles(text, text, text, boolean, integer, integer, text, text) is
  'Company-scoped paginated vehicle search (company_id is text).';

-- ---------------------------------------------------------------------------
-- vehicle_kpi_summary
-- ---------------------------------------------------------------------------
drop function if exists public.vehicle_kpi_summary(text);

create or replace function public.vehicle_kpi_summary(
  p_branch text default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_company_id text;
  v_result jsonb;
begin
  select company_id into v_company_id from public.profiles where id = auth.uid();
  if v_company_id is null then
    return '{}'::jsonb;
  end if;

  with scoped as (
    select *
      from public.vehicles
     where company_id = v_company_id
       and is_deleted = false
       and (p_branch is null or branch_code = p_branch)
  )
  select jsonb_build_object(
    'total', (select count(*) from scoped),
    'delivered', (select count(*) from scoped where delivery_date is not null),
    'pending_delivery', (select count(*) from scoped where delivery_date is null),
    'pending_registration', (select count(*) from scoped where reg_date is null),
    'pending_disbursement', (select count(*) from scoped where disb_date is null),
    'avg_bg_to_delivery', (select round(avg(bg_to_delivery)::numeric, 1) from scoped where bg_to_delivery is not null),
    'avg_bg_to_disb', (select round(avg(bg_to_disb)::numeric, 1) from scoped where bg_to_disb is not null),
    'avg_etd_to_outlet', (select round(avg(etd_to_outlet)::numeric, 1) from scoped where etd_to_outlet is not null),
    'avg_outlet_to_reg', (select round(avg(outlet_to_reg)::numeric, 1) from scoped where outlet_to_reg is not null),
    'avg_reg_to_delivery', (select round(avg(reg_to_delivery)::numeric, 1) from scoped where reg_to_delivery is not null),
    'by_branch', (
      select coalesce(jsonb_object_agg(branch_code, cnt), '{}'::jsonb)
        from (select branch_code, count(*)::int as cnt from scoped group by branch_code) b
    ),
    'by_model', (
      select coalesce(jsonb_object_agg(model, cnt), '{}'::jsonb)
        from (select model, count(*)::int as cnt from scoped group by model order by cnt desc limit 20) m
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.vehicle_kpi_summary(text) from public;
grant execute on function public.vehicle_kpi_summary(text) to authenticated;

comment on function public.vehicle_kpi_summary(text) is
  'Company-scoped aggregate KPIs for vehicles (company_id is text).';
