-- Identity grouping only; retain the other report contracts and invoker RLS.
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
      select v.*, e.id as employee_id, e.name as employee_name,
        coalesce('employee:' || e.id::text, 'vehicle:' || v.id::text) as identity_key
      from public.vehicles v
      left join public.profiles p on p.id = v.salesman_id and p.company_id = v.company_id
      left join public.employees e on e.id = p.employee_id and e.company_id = v.company_id
      where v.company_id = v_company_id and v.is_deleted = false
        and (p_branch is null or v.branch_code = p_branch)
        and (p_model is null or v.model = p_model)
        and (p_bg_date_from is null or v.bg_date >= p_bg_date_from)
        and (p_bg_date_to is null or v.bg_date <= p_bg_date_to)
    ), salesman_stats as (
      select identity_key, employee_id, branch_code,
        max(coalesce(employee_name, salesman_name, 'Unassigned')) as salesman_label,
        count(*) as vehicle_count,
        count(*) filter (where delivery_date is not null) as delivered,
        round(avg(bg_to_delivery) filter (where bg_to_delivery >= 0))::integer as avg_days
      from filtered
      group by identity_key, employee_id, branch_code
    ), paged as (
      select * from salesman_stats
      order by delivered desc, identity_key, branch_code nulls last
      limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(jsonb_build_object(
        'Identity Key', identity_key,
        'Employee ID', employee_id,
        'Identity Status', case when employee_id is null then 'Needs identity review' else 'Employee' end,
        'Salesman', salesman_label,
        'Branch', coalesce(branch_code, '—'),
        'Total Vehicles', vehicle_count,
        'Delivered', delivered,
        'Avg BG→Delivery (days)', coalesce(avg_days::text, '—')
      ) order by delivered desc, identity_key, branch_code nulls last), '[]'::jsonb),
      'total_count', (select count(*) from salesman_stats)
    ) into v_result from paged;

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
