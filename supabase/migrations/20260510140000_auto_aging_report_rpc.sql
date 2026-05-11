-- Stage 1B: Server-side report RPC for Auto Aging Report Center.
--
-- Replaces the client-side pattern of fetching 50,000 vehicles and computing
-- report shapes in the browser. Each report type runs entirely in Postgres
-- and returns the result as paginated JSONB.
--
-- Report types:
--   aging_summary        – KPI median/avg/p90/overdue per KPI (same shape as dashboard summary KPI cards)
--   sla_compliance       – Per-branch breakdown of median days and SLA overdue counts per KPI
--   salesman_performance – Vehicle counts, delivery count, avg BG→Delivery per salesman
--   vehicle_export       – Paginated full vehicle rows for CSV export

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
  v_company_id text;
  v_limit integer;
  v_offset integer;
  v_result jsonb;
begin
  select company_id into v_company_id from public.profiles where id = auth.uid();
  if v_company_id is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total_count', 0);
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 500), 10000));
  v_offset := greatest(0, coalesce(p_offset, 0));

  if p_report_type = 'aging_summary' then
    -- KPI summary: same structure as auto_aging_dashboard_summary kpi_summaries
    -- but returned as { rows: [...], total_count: N }
    with filtered as (
      select *
        from public.vehicles v
       where v.company_id = v_company_id
         and v.is_deleted = false
         and (p_branch is null or v.branch_code = p_branch)
         and (p_model is null or v.model = p_model)
         and (p_bg_date_from is null or v.bg_date >= p_bg_date_from)
         and (p_bg_date_to is null or v.bg_date <= p_bg_date_to)
    ),
    kpi_rows as (
      select 1 as sort_order, 'bg_to_delivery'::text as kpi_id, 'BG Date to Delivery Date'::text as label, 'BG → Delivery'::text as short_label, 45 as default_sla,
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
    summary_rows as (
      select sort_order,
             kpi_id,
             label as "KPI",
             short_label as "Short Label",
             count(*) filter (where value is not null and is_missing = false and is_invalid = false) as "Valid Vehicles",
             count(*) filter (where is_missing) as "Missing",
             count(*) filter (where is_invalid) as "Invalid",
             coalesce(round(percentile_cont(0.5) within group (order by value) filter (where value is not null and is_missing = false and is_invalid = false))::numeric, 0) as "Median (days)",
             coalesce(round(avg(value) filter (where value is not null and is_missing = false and is_invalid = false))::numeric, 0) as "Average (days)",
             coalesce(round(percentile_cont(0.9) within group (order by value) filter (where value is not null and is_missing = false and is_invalid = false))::numeric, 0) as "P90 (days)",
             coalesce(
               (select s.sla_days from public.sla_policies s where s.company_id = v_company_id and s.kpi_id = kpi_rows.kpi_id limit 1),
               default_sla
             ) as sla_days,
             count(*) filter (
               where value is not null
                 and is_missing = false
                 and is_invalid = false
                 and value > coalesce(
                   (select s.sla_days from public.sla_policies s where s.company_id = v_company_id and s.kpi_id = kpi_rows.kpi_id limit 1),
                   default_sla
                 )
             ) as overdue_raw
        from kpi_rows
       group by sort_order, kpi_id, label, short_label, default_sla
    ),
    formatted as (
      select jsonb_build_object(
        'KPI', "KPI",
        'Short Label', "Short Label",
        'Valid Vehicles', "Valid Vehicles",
        'Missing', "Missing",
        'Invalid', "Invalid",
        'Median (days)', "Median (days)",
        'Average (days)', "Average (days)",
        'P90 (days)', "P90 (days)",
        'SLA (days)', sla_days,
        'Overdue', overdue_raw,
        'Overdue %', case when "Valid Vehicles" > 0 then round((overdue_raw::numeric / "Valid Vehicles") * 100) || '%' else '0%' end
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
    -- Per-branch SLA compliance breakdown
    with filtered as (
      select *
        from public.vehicles v
       where v.company_id = v_company_id
         and v.is_deleted = false
         and (p_branch is null or v.branch_code = p_branch)
         and (p_model is null or v.model = p_model)
         and (p_bg_date_from is null or v.bg_date >= p_bg_date_from)
         and (p_bg_date_to is null or v.bg_date <= p_bg_date_to)
    ),
    branch_kpi as (
      select
        branch_code as branch,
        count(*) as vehicle_count,
        -- BG → Delivery
        coalesce(round(percentile_cont(0.5) within group (order by bg_to_delivery) filter (where bg_to_delivery is not null and bg_to_delivery >= 0))::numeric, 0) as "BG → Delivery Median",
        count(*) filter (where bg_to_delivery is not null and bg_to_delivery >= 0 and bg_to_delivery > coalesce((select s.sla_days from sla_policies s where s.company_id = v_company_id and s.kpi_id = 'bg_to_delivery' limit 1), 45)) as "BG → Delivery Overdue",
        -- BG → ETD
        coalesce(round(percentile_cont(0.5) within group (order by bg_to_shipment_etd) filter (where bg_to_shipment_etd is not null and bg_to_shipment_etd >= 0))::numeric, 0) as "BG → ETD Median",
        count(*) filter (where bg_to_shipment_etd is not null and bg_to_shipment_etd >= 0 and bg_to_shipment_etd > coalesce((select s.sla_days from sla_policies s where s.company_id = v_company_id and s.kpi_id = 'bg_to_shipment_etd' limit 1), 14)) as "BG → ETD Overdue",
        -- ETD → Outlet
        coalesce(round(percentile_cont(0.5) within group (order by etd_to_outlet) filter (where etd_to_outlet is not null and etd_to_outlet >= 0))::numeric, 0) as "ETD → Outlet Median",
        count(*) filter (where etd_to_outlet is not null and etd_to_outlet >= 0 and etd_to_outlet > coalesce((select s.sla_days from sla_policies s where s.company_id = v_company_id and s.kpi_id = 'etd_to_outlet' limit 1), 28)) as "ETD → Outlet Overdue",
        -- Outlet → Reg
        coalesce(round(percentile_cont(0.5) within group (order by outlet_to_reg) filter (where outlet_to_reg is not null and outlet_to_reg >= 0))::numeric, 0) as "Outlet → Reg Median",
        count(*) filter (where outlet_to_reg is not null and outlet_to_reg >= 0 and outlet_to_reg > coalesce((select s.sla_days from sla_policies s where s.company_id = v_company_id and s.kpi_id = 'outlet_to_reg' limit 1), 7)) as "Outlet → Reg Overdue",
        -- Reg → Delivery
        coalesce(round(percentile_cont(0.5) within group (order by reg_to_delivery) filter (where reg_to_delivery is not null and reg_to_delivery >= 0))::numeric, 0) as "Reg → Delivery Median",
        count(*) filter (where reg_to_delivery is not null and reg_to_delivery >= 0 and reg_to_delivery > coalesce((select s.sla_days from sla_policies s where s.company_id = v_company_id and s.kpi_id = 'reg_to_delivery' limit 1), 14)) as "Reg → Delivery Overdue",
        -- BG → Disb
        coalesce(round(percentile_cont(0.5) within group (order by bg_to_disb) filter (where bg_to_disb is not null and bg_to_disb >= 0))::numeric, 0) as "BG → Disb Median",
        count(*) filter (where bg_to_disb is not null and bg_to_disb >= 0 and bg_to_disb > coalesce((select s.sla_days from sla_policies s where s.company_id = v_company_id and s.kpi_id = 'bg_to_disb' limit 1), 60)) as "BG → Disb Overdue",
        -- Delivery → Disb
        coalesce(round(percentile_cont(0.5) within group (order by delivery_to_disb) filter (where delivery_to_disb is not null and delivery_to_disb >= 0))::numeric, 0) as "Delivery → Disb Median",
        count(*) filter (where delivery_to_disb is not null and delivery_to_disb >= 0 and delivery_to_disb > coalesce((select s.sla_days from sla_policies s where s.company_id = v_company_id and s.kpi_id = 'delivery_to_disb' limit 1), 14)) as "Delivery → Disb Overdue"
      from filtered
      group by branch_code
      order by branch_code
    ),
    formatted as (
      select jsonb_build_object(
        'Branch', branch,
        'Vehicles', vehicle_count,
        'BG → Delivery Median', "BG → Delivery Median",
        'BG → Delivery Overdue', "BG → Delivery Overdue",
        'BG → ETD Median', "BG → ETD Median",
        'BG → ETD Overdue', "BG → ETD Overdue",
        'ETD → Outlet Median', "ETD → Outlet Median",
        'ETD → Outlet Overdue', "ETD → Outlet Overdue",
        'Outlet → Reg Median', "Outlet → Reg Median",
        'Outlet → Reg Overdue', "Outlet → Reg Overdue",
        'Reg → Delivery Median', "Reg → Delivery Median",
        'Reg → Delivery Overdue', "Reg → Delivery Overdue",
        'BG → Disb Median', "BG → Disb Median",
        'BG → Disb Overdue', "BG → Disb Overdue",
        'Delivery → Disb Median', "Delivery → Disb Median",
        'Delivery → Disb Overdue', "Delivery → Disb Overdue"
      ) as row_obj
      from branch_kpi
    )
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(row_obj), '[]'::jsonb),
      'total_count', (select count(*) from formatted)
    ) into v_result
    from formatted;

  elsif p_report_type = 'salesman_performance' then
    -- Salesman performance aggregation
    with filtered as (
      select *
        from public.vehicles v
       where v.company_id = v_company_id
         and v.is_deleted = false
         and (p_branch is null or v.branch_code = p_branch)
         and (p_model is null or v.model = p_model)
         and (p_bg_date_from is null or v.bg_date >= p_bg_date_from)
         and (p_bg_date_to is null or v.bg_date <= p_bg_date_to)
    ),
    salesman_stats as (
      select
        salesman_name as "Salesman",
        (array_agg(branch_code order by created_at desc))[1] as "Branch",
        count(*) as "Total Vehicles",
        count(*) filter (where delivery_date is not null) as "Delivered",
        case
          when count(*) filter (where bg_to_delivery is not null and bg_to_delivery >= 0) > 0
          then round(avg(bg_to_delivery) filter (where bg_to_delivery is not null and bg_to_delivery >= 0))::integer
          else null
        end as "Avg BG→Delivery (days)"
      from filtered
      group by salesman_name
      order by count(*) filter (where delivery_date is not null) desc
    ),
    total as (select count(*) as c from salesman_stats),
    paged as (
      select * from salesman_stats
      limit v_limit offset v_offset
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
    -- Paginated full vehicle export for CSV
    with filtered as (
      select *
        from public.vehicles v
       where v.company_id = v_company_id
         and v.is_deleted = false
         and (p_branch is null or v.branch_code = p_branch)
         and (p_model is null or v.model = p_model)
         and (p_bg_date_from is null or v.bg_date >= p_bg_date_from)
         and (p_bg_date_to is null or v.bg_date <= p_bg_date_to)
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
  'Company-scoped server-side report generator for Auto Aging. Computes aging summary, SLA compliance, salesman performance, and vehicle export entirely in Postgres, eliminating the need to fetch large vehicle sets into the browser.';
