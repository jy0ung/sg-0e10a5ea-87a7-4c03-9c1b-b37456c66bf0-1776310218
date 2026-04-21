-- Phase 2 #17: server-side vehicle search + KPI aggregation.
--
-- These RPCs let the UI paginate the vehicles table and pull aggregated KPI
-- summaries without shipping entire row sets to the client. Both functions
-- enforce company scoping by deriving the caller's company from profiles,
-- mirroring the pattern used in Phase 0/2 helpers. RLS on vehicles is still
-- authoritative; these RPCs just push the filter/sort/limit into Postgres.

-- ---------------------------------------------------------------------------
-- search_vehicles(): paginated + filtered vehicle fetch
-- ---------------------------------------------------------------------------
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
  v_company_id uuid;
  v_limit integer;
  v_offset integer;
  v_sort_col text;
  v_sort_dir text;
  v_sort_sql text;
  v_total bigint;
  v_rows jsonb;
begin
  -- Caller-scoped company id. RLS still filters, but we short-circuit here
  -- so the query plan gets a direct company filter rather than a subquery.
  select company_id into v_company_id from public.profiles where id = auth.uid();
  if v_company_id is null then
    return query select '[]'::jsonb as rows, 0::bigint as total_count;
    return;
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 500));
  v_offset := greatest(0, coalesce(p_offset, 0));

  -- Whitelist sort columns to prevent SQL injection via p_sort_column.
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

  -- Count and page in the same CTE so total_count reflects the filter.
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
  'Company-scoped, paginated vehicle search. Returns {rows, total_count} so the UI can page without pulling the full dataset.';

-- ---------------------------------------------------------------------------
-- vehicle_kpi_summary(): aggregated KPI metrics computed server-side
-- ---------------------------------------------------------------------------
create or replace function public.vehicle_kpi_summary(
  p_branch text default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_company_id uuid;
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
  'Company-scoped aggregate KPIs for vehicles. Replaces client-side reducers over the full row set.';
