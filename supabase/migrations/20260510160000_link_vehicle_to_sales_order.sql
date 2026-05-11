-- Stage 2: controlled existing-vehicle link for Sales Pipeline.
--
-- Links an existing same-company vehicle to a same-company sales order without
-- creating a new Auto Aging vehicle row. This is the safe path for vehicle
-- linking after DMS/UBS reconciliation starts feeding vehicle inventory.

alter table public.sales_orders
  add column if not exists order_no text,
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;

create index if not exists sales_orders_company_vehicle_id_idx
  on public.sales_orders (company_id, vehicle_id)
  where vehicle_id is not null;

create or replace function public.link_vehicle_to_sales_order(
  p_sales_order_id uuid,
  p_chassis_no text default null,
  p_vehicle_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company_id text;
  v_order public.sales_orders%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_existing_order_id uuid;
begin
  select company_id into v_company_id from public.profiles where id = auth.uid();
  if v_company_id is null then
    raise exception 'Company context is required';
  end if;

  if p_sales_order_id is null then
    raise exception 'Sales order id is required';
  end if;

  if p_vehicle_id is null and nullif(btrim(coalesce(p_chassis_no, '')), '') is null then
    raise exception 'Vehicle id or chassis number is required';
  end if;

  select * into v_order
    from public.sales_orders so
   where so.id = p_sales_order_id
     and so.company_id = v_company_id
     and coalesce(so.is_deleted, false) = false
   for update;

  if not found then
    raise exception 'Sales order not found in caller company';
  end if;

  select * into v_vehicle
    from public.vehicles v
   where v.company_id = v_company_id
     and coalesce(v.is_deleted, false) = false
     and (
       (p_vehicle_id is not null and v.id = p_vehicle_id)
       or (
         p_vehicle_id is null
         and nullif(btrim(coalesce(p_chassis_no, '')), '') is not null
         and lower(btrim(v.chassis_no)) = lower(btrim(p_chassis_no))
       )
     )
   order by case when p_vehicle_id is not null and v.id = p_vehicle_id then 0 else 1 end,
            v.updated_at desc nulls last,
            v.created_at desc nulls last
   limit 1
   for update;

  if not found then
    raise exception 'Vehicle not found in caller company';
  end if;

  if v_order.vehicle_id is not null and v_order.vehicle_id <> v_vehicle.id then
    raise exception 'Sales order is already linked to another vehicle';
  end if;

  select so.id into v_existing_order_id
    from public.sales_orders so
   where so.company_id = v_company_id
     and coalesce(so.is_deleted, false) = false
     and so.id <> v_order.id
     and so.vehicle_id = v_vehicle.id
   limit 1;

  if v_existing_order_id is not null then
    raise exception 'Vehicle is already linked to another sales order';
  end if;

  update public.sales_orders
     set vehicle_id = v_vehicle.id,
         chassis_no = v_vehicle.chassis_no,
         updated_at = now()
   where id = v_order.id
     and company_id = v_company_id;

  return jsonb_build_object(
    'sales_order_id', v_order.id,
    'vehicle_id', v_vehicle.id,
    'chassis_no', v_vehicle.chassis_no,
    'order_no', v_order.order_no
  );
end;
$$;

revoke all on function public.link_vehicle_to_sales_order(uuid, text, uuid) from public;
grant execute on function public.link_vehicle_to_sales_order(uuid, text, uuid) to authenticated;

comment on function public.link_vehicle_to_sales_order(uuid, text, uuid) is
  'Company-scoped RPC that links an existing Auto Aging vehicle to a Sales Order by vehicle id or chassis number without creating or overwriting vehicle rows.';

create or replace function public.unlink_vehicle_from_sales_order(
  p_sales_order_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company_id text;
  v_order public.sales_orders%rowtype;
begin
  select company_id into v_company_id from public.profiles where id = auth.uid();
  if v_company_id is null then
    raise exception 'Company context is required';
  end if;

  if p_sales_order_id is null then
    raise exception 'Sales order id is required';
  end if;

  select * into v_order
    from public.sales_orders so
   where so.id = p_sales_order_id
     and so.company_id = v_company_id
     and coalesce(so.is_deleted, false) = false
   for update;

  if not found then
    raise exception 'Sales order not found in caller company';
  end if;

  update public.sales_orders
     set vehicle_id = null,
         chassis_no = null,
         updated_at = now()
   where id = v_order.id
     and company_id = v_company_id;

  return jsonb_build_object(
    'sales_order_id', v_order.id,
    'previous_vehicle_id', v_order.vehicle_id,
    'previous_chassis_no', v_order.chassis_no,
    'order_no', v_order.order_no
  );
end;
$$;

revoke all on function public.unlink_vehicle_from_sales_order(uuid) from public;
grant execute on function public.unlink_vehicle_from_sales_order(uuid) to authenticated;

comment on function public.unlink_vehicle_from_sales_order(uuid) is
  'Company-scoped RPC that removes the vehicle link from a Sales Order without deleting or modifying the vehicle row.';