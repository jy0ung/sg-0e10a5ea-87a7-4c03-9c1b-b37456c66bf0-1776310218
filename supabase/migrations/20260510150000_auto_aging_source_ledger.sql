-- Stage 1B: Auto Aging source-combination query contract.
--
-- This RPC exposes the read-only ledger that later Auto Aging reports and
-- dashboards can use when DMS sync data is present. It keeps DMS upstream
-- facts, UBS local operating facts, and legacy invoice evidence visible side by
-- side without writing back to canonical UBS tables.

create or replace function public.auto_aging_source_ledger(
  p_branch text default null,
  p_model text default null,
  p_search text default null,
  p_bg_date_from date default null,
  p_bg_date_to date default null,
  p_limit integer default 100,
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
    return jsonb_build_object(
      'rows', '[]'::jsonb,
      'total_count', 0,
      'source_counts', '{}'::jsonb,
      'generated_at', now()
    );
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 100), 5000));
  v_offset := greatest(0, coalesce(p_offset, 0));

  with ubs_vehicles as (
    select v.*, lower(btrim(v.chassis_no)) as chassis_key
      from public.vehicles v
     where v.company_id = v_company_id
       and v.is_deleted = false
       and nullif(btrim(v.chassis_no), '') is not null
  ),
  ubs_sales_orders as (
    select *
      from (
        select so.*,
               lower(btrim(so.chassis_no)) as chassis_key,
               lower(btrim(so.vso_no)) as so_key,
               row_number() over (
                 partition by coalesce(
                   'chassis:' || nullif(lower(btrim(so.chassis_no)), ''),
                   'so:' || nullif(lower(btrim(so.vso_no)), '')
                 )
                 order by so.updated_at desc nulls last, so.created_at desc nulls last, so.id desc
               ) as rn
          from public.sales_orders so
         where so.company_id = v_company_id
           and (
             nullif(btrim(so.chassis_no), '') is not null
             or nullif(btrim(so.vso_no), '') is not null
           )
      ) ranked
     where rn = 1
  ),
  dms_stock as (
    select *
      from (
        select raw.*,
               lower(btrim(raw.chassis_no)) as chassis_key,
               row_number() over (
                 partition by lower(btrim(raw.chassis_no))
                 order by raw.fetched_at desc nulls last, raw.created_at desc nulls last, raw.id desc
               ) as rn
          from public.dms_raw_vehicle_stock raw
         where raw.company_id = v_company_id
           and nullif(btrim(raw.chassis_no), '') is not null
      ) ranked
     where rn = 1
  ),
  dms_orders as (
    select *
      from (
        select raw.*,
               lower(btrim(raw.dms_so_no)) as so_key,
               row_number() over (
                 partition by lower(btrim(raw.dms_so_no))
                 order by raw.fetched_at desc nulls last, raw.created_at desc nulls last, raw.id desc
               ) as rn
          from public.dms_raw_sales_orders raw
         where raw.company_id = v_company_id
           and nullif(btrim(raw.dms_so_no), '') is not null
      ) ranked
     where rn = 1
  ),
  dms_matches as (
    select *
      from (
        select raw.*,
               lower(btrim(raw.chassis_no)) as chassis_key,
               lower(btrim(raw.dms_so_no)) as so_key,
               row_number() over (
                 partition by coalesce(
                   'chassis:' || nullif(lower(btrim(raw.chassis_no)), ''),
                   'so:' || nullif(lower(btrim(raw.dms_so_no)), '')
                 )
                 order by raw.fetched_at desc nulls last, raw.created_at desc nulls last, raw.id desc
               ) as rn
          from public.dms_raw_order_vehicle_matches raw
         where raw.company_id = v_company_id
           and (
             nullif(btrim(raw.chassis_no), '') is not null
             or nullif(btrim(raw.dms_so_no), '') is not null
           )
      ) ranked
     where rn = 1
  ),
  dms_deliveries as (
    select *
      from (
        select raw.*,
               lower(btrim(raw.chassis_no)) as chassis_key,
               lower(btrim(raw.dms_so_no)) as so_key,
               row_number() over (
                 partition by coalesce(
                   'chassis:' || nullif(lower(btrim(raw.chassis_no)), ''),
                   'so:' || nullif(lower(btrim(raw.dms_so_no)), '')
                 )
                 order by raw.fetched_at desc nulls last, raw.created_at desc nulls last, raw.id desc
               ) as rn
          from public.dms_raw_deliveries raw
         where raw.company_id = v_company_id
           and (
             nullif(btrim(raw.chassis_no), '') is not null
             or nullif(btrim(raw.dms_so_no), '') is not null
           )
      ) ranked
     where rn = 1
  ),
  dms_collections as (
    select *
      from (
        select raw.*,
               lower(btrim(raw.chassis_no)) as chassis_key,
               lower(btrim(raw.dms_so_no)) as so_key,
               row_number() over (
                 partition by coalesce(
                   'chassis:' || nullif(lower(btrim(raw.chassis_no)), ''),
                   'so:' || nullif(lower(btrim(raw.dms_so_no)), '')
                 )
                 order by raw.fetched_at desc nulls last, raw.created_at desc nulls last, raw.id desc
               ) as rn
          from public.dms_raw_collections raw
         where raw.company_id = v_company_id
           and (
             nullif(btrim(raw.chassis_no), '') is not null
             or nullif(btrim(raw.dms_so_no), '') is not null
           )
      ) ranked
     where rn = 1
  ),
  legacy_invoices as (
    select *
      from (
        select raw.*,
               lower(btrim(raw.chassis_no)) as chassis_key,
               lower(btrim(raw.dms_so_no)) as so_key,
               row_number() over (
                 partition by coalesce(
                   'chassis:' || nullif(lower(btrim(raw.chassis_no)), ''),
                   'so:' || nullif(lower(btrim(raw.dms_so_no)), ''),
                   'invoice:' || nullif(lower(btrim(raw.invoice_no)), '')
                 )
                 order by raw.fetched_at desc nulls last, raw.created_at desc nulls last, raw.id desc
               ) as rn
          from public.legacy_staging_sales_invoices raw
         where raw.company_id = v_company_id
           and (
             nullif(btrim(raw.chassis_no), '') is not null
             or nullif(btrim(raw.dms_so_no), '') is not null
             or nullif(btrim(raw.invoice_no), '') is not null
           )
      ) ranked
     where rn = 1
  ),
  key_candidates as (
    select 'chassis:' || chassis_key as source_key, chassis_key, null::text as so_key from ubs_vehicles
    union all
    select 'chassis:' || chassis_key, chassis_key, null::text from dms_stock
    union all
    select coalesce('chassis:' || chassis_key, 'so:' || so_key), chassis_key, so_key from dms_matches
    union all
    select coalesce('chassis:' || chassis_key, 'so:' || so_key), chassis_key, so_key from dms_deliveries
    union all
    select coalesce('chassis:' || chassis_key, 'so:' || so_key), chassis_key, so_key from dms_collections
    union all
    select 'so:' || so_key, null::text, so_key from dms_orders
    union all
    select coalesce('chassis:' || chassis_key, 'so:' || so_key, 'invoice:' || lower(btrim(invoice_no))), chassis_key, so_key from legacy_invoices
    union all
    select coalesce('chassis:' || chassis_key, 'so:' || so_key), chassis_key, so_key from ubs_sales_orders
  ),
  keys as (
    select source_key,
           max(chassis_key) filter (where chassis_key is not null) as chassis_key,
           max(so_key) filter (where so_key is not null) as so_key
      from key_candidates
     where source_key is not null
     group by source_key
  ),
  combined as (
    select
      k.source_key,
      coalesce(k.chassis_key, uv.chassis_key, ds.chassis_key, dm.chassis_key, dd.chassis_key, dc.chassis_key, li.chassis_key, uso.chassis_key) as chassis_key,
      coalesce(k.so_key, dm.so_key, dd.so_key, dc.so_key, dor.so_key, li.so_key, uso.so_key) as so_key,
      uv.id as vehicle_id,
      uso.id as sales_order_id,
      ds.id as dms_vehicle_stock_id,
      dor.id as dms_sales_order_id,
      dm.id as dms_allocation_id,
      dd.id as dms_delivery_id,
      dc.id as dms_collection_id,
      li.id as legacy_invoice_id,
      coalesce(uv.chassis_no, ds.chassis_no, dm.chassis_no, dd.chassis_no, dc.chassis_no, li.chassis_no, uso.chassis_no) as chassis_no,
      coalesce(uv.branch_code, ds.branch_code, dm.branch_code, dd.branch_code, dc.branch_code, li.branch_code, uso.branch_code) as branch_code,
      coalesce(uv.model, ds.model_code, uso.model) as model,
      uv.customer_name,
      uv.salesman_name,
      uv.payment_method,
      uv.stage,
      uv.stage_override,
      uv.bg_date,
      uv.shipment_etd_pkg,
      uv.shipment_eta_kk_twu_sdk,
      uv.date_received_by_outlet,
      uv.reg_date,
      uv.delivery_date,
      uv.disb_date,
      uv.lou,
      uv.remark,
      uv.invoice_no,
      uv.obr,
      uv.bg_to_delivery,
      uv.bg_to_shipment_etd,
      uv.etd_to_outlet,
      uv.outlet_to_reg,
      uv.reg_to_delivery,
      uv.bg_to_disb,
      uv.delivery_to_disb,
      coalesce(dm.dms_so_no, dor.dms_so_no, dd.dms_so_no, dc.dms_so_no, li.dms_so_no, uso.vso_no) as dms_so_no,
      coalesce(dm.dms_so_no_id, dor.dms_so_no_id, dd.dms_so_no_id, dc.dms_so_no_id) as dms_so_no_id,
      ds.dms_vs_stock_id,
      ds.vin,
      ds.stock_status,
      ds.model_code as dms_model_code,
      ds.config_code as dms_config_code,
      ds.color_code as dms_color_code,
      dor.order_status as dms_order_status,
      dm.allocation_status as dms_allocation_status,
      dm.registration_status as dms_registration_status,
      dm.allocated_at as dms_allocated_at,
      dm.registered_at as dms_registered_at,
      dd.delivery_status as dms_delivery_status,
      dd.delivered_at as dms_delivered_at,
      dc.collection_status as dms_collection_status,
      dc.collection_amount as dms_collection_amount,
      dc.collection_date as dms_collection_date,
      li.invoice_no as legacy_invoice_no,
      li.invoice_date as legacy_invoice_date,
      li.invoice_amount as legacy_invoice_amount,
      li.paid_amount as legacy_paid_amount,
      li.outstanding_amount as legacy_outstanding_amount,
      greatest(
        coalesce(uv.updated_at, '-infinity'::timestamptz),
        coalesce(uso.updated_at, '-infinity'::timestamptz),
        coalesce(ds.fetched_at, '-infinity'::timestamptz),
        coalesce(dor.fetched_at, '-infinity'::timestamptz),
        coalesce(dm.fetched_at, '-infinity'::timestamptz),
        coalesce(dd.fetched_at, '-infinity'::timestamptz),
        coalesce(dc.fetched_at, '-infinity'::timestamptz),
        coalesce(li.fetched_at, '-infinity'::timestamptz)
      ) as last_source_at,
      jsonb_build_object(
        'ubs_vehicle', uv.id is not null,
        'ubs_sales_order', uso.id is not null,
        'dms_vehicle_stock', ds.id is not null,
        'dms_sales_order', dor.id is not null,
        'dms_allocation', dm.id is not null,
        'dms_delivery', dd.id is not null,
        'dms_collection', dc.id is not null,
        'legacy_invoice', li.id is not null
      ) as source_presence,
      jsonb_strip_nulls(jsonb_build_object(
        'branch_code', case
          when uv.branch_code is not null
           and coalesce(ds.branch_code, dm.branch_code, dd.branch_code, dc.branch_code, li.branch_code) is not null
           and lower(btrim(uv.branch_code)) <> lower(btrim(coalesce(ds.branch_code, dm.branch_code, dd.branch_code, dc.branch_code, li.branch_code)))
          then jsonb_build_object('ubs', uv.branch_code, 'source', coalesce(ds.branch_code, dm.branch_code, dd.branch_code, dc.branch_code, li.branch_code))
        end,
        'delivery_date', case
          when uv.delivery_date is not null
           and dd.delivered_at is not null
           and uv.delivery_date <> dd.delivered_at::date
          then jsonb_build_object('ubs', uv.delivery_date, 'dms', dd.delivered_at::date)
        end,
        'invoice_no', case
          when uv.invoice_no is not null
           and li.invoice_no is not null
           and lower(btrim(uv.invoice_no)) <> lower(btrim(li.invoice_no))
          then jsonb_build_object('ubs', uv.invoice_no, 'legacy', li.invoice_no)
        end
      )) as source_conflicts
    from keys k
    left join ubs_vehicles uv
      on uv.chassis_key = k.chassis_key
    left join lateral (
      select * from ubs_sales_orders candidate
       where (k.chassis_key is not null and candidate.chassis_key = k.chassis_key)
         or (k.so_key is not null and candidate.so_key = k.so_key)
       order by candidate.updated_at desc nulls last, candidate.created_at desc nulls last, candidate.id desc
       limit 1
    ) uso on true
    left join lateral (
      select * from dms_stock candidate
       where k.chassis_key is not null and candidate.chassis_key = k.chassis_key
       order by candidate.fetched_at desc nulls last, candidate.created_at desc nulls last, candidate.id desc
       limit 1
    ) ds on true
    left join lateral (
      select * from dms_matches candidate
       where (k.chassis_key is not null and candidate.chassis_key = k.chassis_key)
         or (k.so_key is not null and candidate.so_key = k.so_key)
       order by candidate.fetched_at desc nulls last, candidate.created_at desc nulls last, candidate.id desc
       limit 1
    ) dm on true
    left join lateral (
      select * from dms_orders candidate
       where coalesce(k.so_key, dm.so_key, uso.so_key) is not null
        and candidate.so_key = coalesce(k.so_key, dm.so_key, uso.so_key)
       order by candidate.fetched_at desc nulls last, candidate.created_at desc nulls last, candidate.id desc
       limit 1
    ) dor on true
    left join lateral (
      select * from dms_deliveries candidate
       where (k.chassis_key is not null and candidate.chassis_key = k.chassis_key)
         or (coalesce(k.so_key, dm.so_key, uso.so_key) is not null and candidate.so_key = coalesce(k.so_key, dm.so_key, uso.so_key))
       order by candidate.fetched_at desc nulls last, candidate.created_at desc nulls last, candidate.id desc
       limit 1
    ) dd on true
    left join lateral (
      select * from dms_collections candidate
       where (k.chassis_key is not null and candidate.chassis_key = k.chassis_key)
         or (coalesce(k.so_key, dm.so_key, uso.so_key) is not null and candidate.so_key = coalesce(k.so_key, dm.so_key, uso.so_key))
       order by candidate.fetched_at desc nulls last, candidate.created_at desc nulls last, candidate.id desc
       limit 1
    ) dc on true
    left join lateral (
      select * from legacy_invoices candidate
       where (k.chassis_key is not null and candidate.chassis_key = k.chassis_key)
         or (coalesce(k.so_key, dm.so_key, uso.so_key) is not null and candidate.so_key = coalesce(k.so_key, dm.so_key, uso.so_key))
       order by candidate.fetched_at desc nulls last, candidate.created_at desc nulls last, candidate.id desc
       limit 1
    ) li on true
  ),
  filtered as (
    select *
      from combined c
     where (p_branch is null or c.branch_code = p_branch)
       and (p_model is null or c.model = p_model)
       and (p_bg_date_from is null or c.bg_date >= p_bg_date_from)
       and (p_bg_date_to is null or c.bg_date <= p_bg_date_to)
       and (
         p_search is null
         or c.chassis_no ilike '%' || p_search || '%'
         or c.customer_name ilike '%' || p_search || '%'
         or c.dms_so_no ilike '%' || p_search || '%'
         or c.invoice_no ilike '%' || p_search || '%'
         or c.legacy_invoice_no ilike '%' || p_search || '%'
       )
  ),
  source_counts as (
    select jsonb_build_object(
      'ubs_vehicle', count(*) filter (where vehicle_id is not null),
      'ubs_sales_order', count(*) filter (where sales_order_id is not null),
      'dms_vehicle_stock', count(*) filter (where dms_vehicle_stock_id is not null),
      'dms_sales_order', count(*) filter (where dms_sales_order_id is not null),
      'dms_allocation', count(*) filter (where dms_allocation_id is not null),
      'dms_delivery', count(*) filter (where dms_delivery_id is not null),
      'dms_collection', count(*) filter (where dms_collection_id is not null),
      'legacy_invoice', count(*) filter (where legacy_invoice_id is not null),
      'needs_reconciliation', count(*) filter (where source_conflicts <> '{}'::jsonb or vehicle_id is null)
    ) as value
    from filtered
  ),
  total as (
    select count(*)::integer as value from filtered
  ),
  paged as (
    select * from filtered
     order by last_source_at desc nulls last, chassis_no asc nulls last, source_key asc
     limit v_limit offset v_offset
  ),
  formatted as (
    select jsonb_build_object(
      'source_key', source_key,
      'vehicle_id', vehicle_id,
      'sales_order_id', sales_order_id,
      'chassis_no', chassis_no,
      'branch_code', branch_code,
      'model', model,
      'customer_name', customer_name,
      'salesman_name', salesman_name,
      'payment_method', payment_method,
      'dms_so_no', dms_so_no,
      'last_source_at', nullif(last_source_at, '-infinity'::timestamptz),
      'needs_reconciliation', source_conflicts <> '{}'::jsonb or vehicle_id is null,
      'source_presence', source_presence,
      'source_conflicts', source_conflicts,
      'authority', jsonb_build_object(
        'proton_dms', jsonb_build_array('stock_status', 'order_status', 'allocation_status', 'registration_status', 'delivery_status', 'collection_snapshot'),
        'ubs', jsonb_build_array('bg_date', 'shipment_dates', 'sla_fields', 'lou', 'remarks', 'commission', 'stage_override'),
        'legacy_fookloi', jsonb_build_array('historical_invoice_no', 'historical_invoice_amount', 'paid_amount', 'outstanding_amount')
      ),
      'local_facts', jsonb_strip_nulls(jsonb_build_object(
        'stage', stage,
        'stage_override', stage_override,
        'bg_date', bg_date,
        'shipment_etd_pkg', shipment_etd_pkg,
        'shipment_eta_kk_twu_sdk', shipment_eta_kk_twu_sdk,
        'date_received_by_outlet', date_received_by_outlet,
        'reg_date', reg_date,
        'delivery_date', delivery_date,
        'disb_date', disb_date,
        'lou', lou,
        'remark', remark,
        'invoice_no', invoice_no,
        'obr', obr,
        'bg_to_delivery', bg_to_delivery,
        'bg_to_shipment_etd', bg_to_shipment_etd,
        'etd_to_outlet', etd_to_outlet,
        'outlet_to_reg', outlet_to_reg,
        'reg_to_delivery', reg_to_delivery,
        'bg_to_disb', bg_to_disb,
        'delivery_to_disb', delivery_to_disb
      )),
      'dms_facts', jsonb_strip_nulls(jsonb_build_object(
        'dms_so_no_id', dms_so_no_id,
        'dms_vs_stock_id', dms_vs_stock_id,
        'vin', vin,
        'stock_status', stock_status,
        'model_code', dms_model_code,
        'config_code', dms_config_code,
        'color_code', dms_color_code,
        'order_status', dms_order_status,
        'allocation_status', dms_allocation_status,
        'registration_status', dms_registration_status,
        'allocated_at', dms_allocated_at,
        'registered_at', dms_registered_at,
        'delivery_status', dms_delivery_status,
        'delivered_at', dms_delivered_at,
        'collection_status', dms_collection_status,
        'collection_amount', dms_collection_amount,
        'collection_date', dms_collection_date
      )),
      'legacy_facts', jsonb_strip_nulls(jsonb_build_object(
        'invoice_no', legacy_invoice_no,
        'invoice_date', legacy_invoice_date,
        'invoice_amount', legacy_invoice_amount,
        'paid_amount', legacy_paid_amount,
        'outstanding_amount', legacy_outstanding_amount
      ))
    ) as row_obj
    from paged
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(row_obj) from formatted), '[]'::jsonb),
    'total_count', (select value from total),
    'source_counts', coalesce((select value from source_counts), '{}'::jsonb),
    'generated_at', now()
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.auto_aging_source_ledger(text, text, text, date, date, integer, integer) from public;
grant execute on function public.auto_aging_source_ledger(text, text, text, date, date, integer, integer) to authenticated;

comment on function public.auto_aging_source_ledger(text, text, text, date, date, integer, integer) is
  'Company-scoped read-only Auto Aging source ledger that combines UBS vehicles/orders, DMS stock/order/allocation/delivery/collection staging, and legacy invoice evidence without canonical writes.';