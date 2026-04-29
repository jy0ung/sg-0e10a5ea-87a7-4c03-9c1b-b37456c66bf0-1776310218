-- Auto Aging overview refactor:
-- 1. Extend the paginated search RPC with BG-date range filters so the overview
--    can request a server-filtered slice without hydrating the full dataset.
-- 2. Add a focused dashboard summary RPC for exact KPI-card aggregates and the
--    current quality-issue sample.

-- Recreate search_vehicles with BG-date filters and a higher cap for
-- dashboard-scoped sampling.
drop function if exists public.search_vehicles(text, text, text, text, text, boolean, integer, integer, text, text);
drop function if exists public.search_vehicles(text, text, text, text, text, date, date, boolean, integer, integer, text, text);

create or replace function public.search_vehicles(
  p_branch text default null,
  p_model text default null,
  p_payment text default null,
  p_stage text default null,
  p_search text default null,
  p_bg_date_from date default null,
  p_bg_date_to date default null,
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

  v_limit := greatest(1, least(coalesce(p_limit, 50), 2000));
  v_offset := greatest(0, coalesce(p_offset, 0));

  v_sort_col := lower(coalesce(p_sort_column, 'created_at'));
  if v_sort_col not in (
    'created_at', 'chassis_no', 'branch_code', 'model', 'variant', 'color',
    'customer_name', 'salesman_name', 'bg_date', 'shipment_etd_pkg',
    'shipment_eta_kk_twu_sdk', 'date_received_by_outlet', 'reg_date',
    'reg_no', 'delivery_date', 'disb_date', 'payment_method',
    'full_payment_type', 'full_payment_date', 'vaa_date', 'invoice_no', 'obr',
    'dealer_transfer_price', 'shipment_name', 'lou', 'contra_sola', 'is_d2d',
    'commission_paid', 'commission_remark', 'remark', 'bg_to_delivery',
    'bg_to_shipment_etd', 'etd_to_outlet', 'outlet_to_reg', 'reg_to_delivery',
    'bg_to_disb', 'delivery_to_disb', 'stage'
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
         and ($4::text is null
              or ($4 = 'Unspecified' and (coalesce(trim(v.payment_method), '') = '' or lower(trim(v.payment_method)) in ('unknown', '-', '—')))
              or ($4 <> 'Unspecified' and upper(trim(v.payment_method)) = upper(trim($4))))
         and ($5::text is null or coalesce(v.stage_override, v.stage) = $5)
         and ($6::text is null
              or v.chassis_no ilike '%%' || $6 || '%%'
              or v.customer_name ilike '%%' || $6 || '%%'
              or v.reg_no ilike '%%' || $6 || '%%'
              or v.invoice_no ilike '%%' || $6 || '%%')
         and ($7::date is null or v.bg_date >= $7)
         and ($8::date is null or v.bg_date <= $8)
         and ($9::boolean is null
              or ($9 = true  and v.delivery_date is not null)
              or ($9 = false and v.delivery_date is null))
    ),
    counted as (select count(*)::bigint as c from filtered),
    paged as (
      select * from filtered
       order by %s
       limit $10 offset $11
    )
    select coalesce(jsonb_agg(to_jsonb(paged.*)), '[]'::jsonb), (select c from counted)
      from paged
  $q$, v_sort_sql)
  into v_rows, v_total
  using v_company_id, p_branch, p_model, p_payment, p_stage, p_search, p_bg_date_from, p_bg_date_to, p_has_delivery_date, v_limit, v_offset;

  return query select v_rows, coalesce(v_total, 0);
end;
$$;

revoke all on function public.search_vehicles(text, text, text, text, text, date, date, boolean, integer, integer, text, text) from public;
grant execute on function public.search_vehicles(text, text, text, text, text, date, date, boolean, integer, integer, text, text) to authenticated;

comment on function public.search_vehicles(text, text, text, text, text, date, date, boolean, integer, integer, text, text) is
  'Company-scoped paginated vehicle search with server-side filter/sort support for Vehicle Explorer and Auto Aging overview.';

create or replace function public.auto_aging_dashboard_summary(
  p_branch text default null,
  p_model text default null,
  p_from date default null,
  p_to date default null
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
    return jsonb_build_object(
      'available_branches', '[]'::jsonb,
      'available_models', '[]'::jsonb,
      'kpi_summaries', '[]'::jsonb,
      'quality_issue_count', 0,
      'quality_issue_sample', '[]'::jsonb
    );
  end if;

  with company_scope as (
    select *
      from public.vehicles v
     where v.company_id = v_company_id
       and v.is_deleted = false
  ),
  filtered as (
    select *
      from company_scope v
     where (p_branch is null or v.branch_code = p_branch)
       and (p_model is null or v.model = p_model)
       and (p_from is null or v.bg_date >= p_from)
       and (p_to is null or v.bg_date <= p_to)
  ),
  available_branches as (
    select coalesce(jsonb_agg(branch_code order by branch_code), '[]'::jsonb) as value
      from (
        select distinct branch_code
          from company_scope
         where coalesce(trim(branch_code), '') <> ''
      ) branches
  ),
  available_models as (
    select coalesce(jsonb_agg(model order by model), '[]'::jsonb) as value
      from (
        select distinct model
          from company_scope
         where coalesce(trim(model), '') <> ''
      ) models
  ),
  kpi_rows as (
    select 1 as sort_order, 'bg_to_delivery'::text as kpi_id, 'BG Date to Delivery Date'::text as label, 'BG → Delivery'::text as short_label, 45::integer as default_sla,
           bg_to_delivery::numeric as value,
           coalesce(is_incomplete, false) or bg_to_delivery is null as is_missing,
           coalesce(is_incomplete, false) = false and bg_to_delivery is not null and bg_to_delivery < 0 as is_invalid
      from filtered
    union all
    select 2, 'bg_to_shipment_etd', 'BG Date to Shipment ETD PKG', 'BG → ETD', 14,
           bg_to_shipment_etd::numeric,
           coalesce(is_incomplete, false) or bg_to_shipment_etd is null,
           coalesce(is_incomplete, false) = false and bg_to_shipment_etd is not null and bg_to_shipment_etd < 0
      from filtered
    union all
    select 3, 'etd_to_outlet', 'Shipment ETD PKG to Date Received by Outlet', 'ETD → Outlet', 28,
           etd_to_outlet::numeric,
           coalesce(is_incomplete, false) or etd_to_outlet is null,
           coalesce(is_incomplete, false) = false and etd_to_outlet is not null and etd_to_outlet < 0
      from filtered
    union all
    select 4, 'outlet_to_reg', 'Date Received by Outlet to Registration Date', 'Outlet → Reg', 7,
           outlet_to_reg::numeric,
           coalesce(is_incomplete, false) or outlet_to_reg is null,
           coalesce(is_incomplete, false) = false and outlet_to_reg is not null and outlet_to_reg < 0
      from filtered
    union all
    select 5, 'reg_to_delivery', 'Registration Date to Delivery Date', 'Reg → Delivery', 14,
           reg_to_delivery::numeric,
           coalesce(is_incomplete, false) or reg_to_delivery is null,
           coalesce(is_incomplete, false) = false and reg_to_delivery is not null and reg_to_delivery < 0
      from filtered
    union all
    select 6, 'bg_to_disb', 'BG Date to Disb. Date', 'BG → Disb', 60,
           bg_to_disb::numeric,
           coalesce(is_incomplete, false) or bg_to_disb is null,
           coalesce(is_incomplete, false) = false and bg_to_disb is not null and bg_to_disb < 0
      from filtered
    union all
    select 7, 'delivery_to_disb', 'Delivery Date to Disb. Date', 'Delivery → Disb', 14,
           delivery_to_disb::numeric,
           coalesce(is_incomplete, false) or delivery_to_disb is null,
           coalesce(is_incomplete, false) = false and delivery_to_disb is not null and delivery_to_disb < 0
      from filtered
  ),
  kpi_summary_rows as (
    select sort_order,
           kpi_id,
           label,
           short_label,
           count(*) filter (where value is not null and is_missing = false and is_invalid = false) as valid_count,
           count(*) filter (where is_invalid) as invalid_count,
           count(*) filter (where is_missing) as missing_count,
           coalesce(round(percentile_cont(0.5) within group (order by value) filter (where value is not null and is_missing = false and is_invalid = false))::numeric, 0) as median,
           coalesce(round(avg(value) filter (where value is not null and is_missing = false and is_invalid = false))::numeric, 0) as average,
           coalesce(round(percentile_cont(0.9) within group (order by value) filter (where value is not null and is_missing = false and is_invalid = false))::numeric, 0) as p90,
           count(*) filter (
             where value is not null
               and is_missing = false
               and is_invalid = false
               and value > coalesce(
                 (
                   select s.sla_days
                     from public.sla_policies s
                    where s.company_id = v_company_id
                      and s.kpi_id = kpi_rows.kpi_id
                    limit 1
                 ),
                 max(default_sla)
               )
           ) as overdue_count,
           coalesce(
             (
               select s.sla_days
                 from public.sla_policies s
                where s.company_id = v_company_id
                  and s.kpi_id = kpi_rows.kpi_id
                limit 1
             ),
             max(default_sla)
           ) as sla_days
      from kpi_rows
     group by sort_order, kpi_id, label, short_label
  ),
  kpi_summaries as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'kpi_id', kpi_id,
          'label', label,
          'short_label', short_label,
          'valid_count', valid_count,
          'invalid_count', invalid_count,
          'missing_count', missing_count,
          'median', median,
          'average', average,
          'p90', p90,
          'overdue_count', overdue_count,
          'sla_days', sla_days
        )
        order by sort_order
      ),
      '[]'::jsonb
    ) as value
      from kpi_summary_rows
  ),
  quality_issue_count as (
    select count(*)::integer as value
      from public.quality_issues qi
     where qi.company_id = v_company_id
       and exists (
         select 1
           from filtered f
          where f.chassis_no = qi.chassis_no
       )
  ),
  quality_issue_sample as (
    select coalesce(
      jsonb_agg(to_jsonb(sampled.*) order by sampled.created_at desc nulls last, sampled.id desc),
      '[]'::jsonb
    ) as value
      from (
        select qi.id,
               qi.chassis_no,
               qi.field,
               qi.issue_type,
               qi.message,
               qi.severity,
               qi.import_batch_id,
               qi.created_at
          from public.quality_issues qi
         where qi.company_id = v_company_id
           and exists (
             select 1
               from filtered f
              where f.chassis_no = qi.chassis_no
           )
         order by qi.created_at desc nulls last, qi.id desc
         limit 8
      ) sampled
  )
  select jsonb_build_object(
    'available_branches', (select value from available_branches),
    'available_models', (select value from available_models),
    'kpi_summaries', (select value from kpi_summaries),
    'quality_issue_count', (select value from quality_issue_count),
    'quality_issue_sample', (select value from quality_issue_sample)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.auto_aging_dashboard_summary(text, text, date, date) from public;
grant execute on function public.auto_aging_dashboard_summary(text, text, date, date) to authenticated;

comment on function public.auto_aging_dashboard_summary(text, text, date, date) is
  'Exact Auto Aging overview KPI-card summary and quality-issue sample for the current branch/model/BG-date filter.';
