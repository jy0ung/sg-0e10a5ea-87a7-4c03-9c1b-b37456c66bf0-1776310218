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
           bg_to_delivery is null as is_missing,
           bg_to_delivery is not null and bg_to_delivery < 0 as is_invalid
      from filtered
    union all
    select 2, 'bg_to_shipment_etd', 'BG Date to Shipment ETD PKG', 'BG → ETD', 14,
           bg_to_shipment_etd::numeric,
           bg_to_shipment_etd is null,
           bg_to_shipment_etd is not null and bg_to_shipment_etd < 0
      from filtered
    union all
    select 3, 'etd_to_outlet', 'Shipment ETD PKG to Date Received by Outlet', 'ETD → Outlet', 28,
           etd_to_outlet::numeric,
           etd_to_outlet is null,
           etd_to_outlet is not null and etd_to_outlet < 0
      from filtered
    union all
    select 4, 'outlet_to_reg', 'Date Received by Outlet to Registration Date', 'Outlet → Reg', 7,
           outlet_to_reg::numeric,
           outlet_to_reg is null,
           outlet_to_reg is not null and outlet_to_reg < 0
      from filtered
    union all
    select 5, 'reg_to_delivery', 'Registration Date to Delivery Date', 'Reg → Delivery', 14,
           reg_to_delivery::numeric,
           reg_to_delivery is null,
           reg_to_delivery is not null and reg_to_delivery < 0
      from filtered
    union all
    select 6, 'bg_to_disb', 'BG Date to Disb. Date', 'BG → Disb', 60,
           bg_to_disb::numeric,
           bg_to_disb is null,
           bg_to_disb is not null and bg_to_disb < 0
      from filtered
    union all
    select 7, 'delivery_to_disb', 'Delivery Date to Disb. Date', 'Delivery → Disb', 14,
           delivery_to_disb::numeric,
           delivery_to_disb is null,
           delivery_to_disb is not null and delivery_to_disb < 0
      from filtered
  ),
  kpi_summary_rows as (
    select sort_order,
           kpi_id,
           label,
           short_label,
           default_sla,
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
                 default_sla
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
             default_sla
           ) as sla_days
      from kpi_rows
     group by sort_order, kpi_id, label, short_label, default_sla
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
  'Exact Auto Aging overview KPI-card summary and quality-issue sample for the current branch/model/BG-date filter without requiring non-persisted completeness columns.';