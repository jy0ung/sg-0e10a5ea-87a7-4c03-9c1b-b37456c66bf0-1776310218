-- Phase 1: expand the paginated vehicle-search RPC used by Vehicle Explorer.
-- Adds server-side payment/stage filters and broadens the sortable whitelist so
-- large vehicle tables do not need client-side full-array filtering/sorting.

drop function if exists public.search_vehicles(text, text, text, boolean, integer, integer, text, text);
drop function if exists public.search_vehicles(text, text, text, text, text, boolean, integer, integer, text, text);

create or replace function public.search_vehicles(
  p_branch text default null,
  p_model text default null,
  p_payment text default null,
  p_stage text default null,
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
         and ($7::boolean is null
              or ($7 = true  and v.delivery_date is not null)
              or ($7 = false and v.delivery_date is null))
         and ($6::text is null
              or v.chassis_no ilike '%%' || $6 || '%%'
              or v.customer_name ilike '%%' || $6 || '%%'
              or v.reg_no ilike '%%' || $6 || '%%'
              or v.invoice_no ilike '%%' || $6 || '%%')
    ),
    counted as (select count(*)::bigint as c from filtered),
    paged as (
      select * from filtered
       order by %s
       limit $8 offset $9
    )
    select coalesce(jsonb_agg(to_jsonb(paged.*)), '[]'::jsonb), (select c from counted)
      from paged
  $q$, v_sort_sql)
  into v_rows, v_total
  using v_company_id, p_branch, p_model, p_payment, p_stage, p_search, p_has_delivery_date, v_limit, v_offset;

  return query select v_rows, coalesce(v_total, 0);
end;
$$;

revoke all on function public.search_vehicles(text, text, text, text, text, boolean, integer, integer, text, text) from public;
grant execute on function public.search_vehicles(text, text, text, text, text, boolean, integer, integer, text, text) to authenticated;

comment on function public.search_vehicles(text, text, text, text, text, boolean, integer, integer, text, text) is
  'Company-scoped paginated vehicle search with server-side filter/sort support for Vehicle Explorer.';