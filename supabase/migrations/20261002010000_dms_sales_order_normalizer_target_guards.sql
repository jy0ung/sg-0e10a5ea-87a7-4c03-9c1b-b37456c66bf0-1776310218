-- Bounded raw-DMS -> legacy-SO write guard. No Case/source-link or KPI policy.
-- Existing rows are locked and requalified after waits. Raw-row locking serializes
-- this normalizer on one source. Candidate sets exclude concurrent arbitrary
-- privileged phantom inserts; this is not global reconciliation-writer isolation.
create or replace function public.normalize_dms_sales_order(p_raw_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_raw public.dms_raw_sales_orders%rowtype;
  v_match public.source_reconciliation_matches%rowtype;
  v_ids uuid[];
  v_target_id uuid;
  v_result jsonb;
begin
  -- Serialize calls on this source and read its current facts after a lock wait.
  select * into v_raw
  from public.dms_raw_sales_orders
  where id = p_raw_id
  for update;

  if not found then
    raise exception 'dms_raw_sales_orders row % not found', p_raw_id
      using errcode = 'P0002';
  end if;

  -- Evaluate the entire qualifying core set BEFORE canonical-shape validation.
  -- UUID ordering is only lock acquisition order, never a decision tie-breaker.
  -- FOR UPDATE rechecks predicates on existing rows changed while we waited.
  select array_agg(eligible.id) into v_ids
  from (
    select m.id
    from public.source_reconciliation_matches m
    where m.company_id = v_raw.company_id
      and m.source_system = 'dms'
      and m.object_type = 'sales_order'
      and m.source_table = 'dms_raw_sales_orders'
      and m.source_record_id = p_raw_id
      and m.match_status in ('accepted', 'auto_matched')
    order by m.id
    for update
  ) eligible;

  if coalesce(cardinality(v_ids), 0) = 0 then
    raise exception
      'No accepted reconciliation match for dms_raw_sales_orders row %. '
      'Call seed_source_reconciliation_candidates() and accept the match first.', p_raw_id
      using errcode = '42501';
  elsif cardinality(v_ids) > 1 then
    raise exception 'Multiple approved DMS Sales Order reconciliation decisions for raw row %', p_raw_id
      using errcode = '21000';
  end if;

  -- The sole decision is already locked. Read the post-wait declaration.
  select * into strict v_match
  from public.source_reconciliation_matches
  where id = v_ids[1];

  if (v_match.canonical_table is null and v_match.canonical_record_id is not null)
    or (v_match.canonical_table is not null and v_match.canonical_table <> 'sales_orders') then
    raise exception 'Invalid Sales Order canonical declaration on decision %', v_match.id
      using errcode = '22023';
  end if;

  -- Preserve explicit UUID -> exact nonblank external ID -> exact nonblank text.
  -- An invalid explicit target never falls through to weaker evidence.
  if v_match.canonical_record_id is not null then
    select so.id into v_target_id
    from public.sales_orders so
    where so.id = v_match.canonical_record_id
      and so.company_id = v_raw.company_id
      and so.is_deleted = false
    for update;
    if not found then
      raise exception 'Explicit sales_orders target % is absent, foreign or locally deleted', v_match.canonical_record_id
        using errcode = 'P0002';
    end if;
  else
    if nullif(btrim(v_raw.dms_so_no_id), '') is not null then
      select array_agg(eligible.id) into v_ids
      from (
        select so.id
        from public.sales_orders so
        where so.company_id = v_raw.company_id
          and so.dms_so_no_id = v_raw.dms_so_no_id
          and so.is_deleted = false
        order by so.id
        for update
      ) eligible;
      if cardinality(v_ids) > 1 then
        raise exception 'Ambiguous Sales Order external ID for raw row %', p_raw_id
          using errcode = '21000';
      end if;
      v_target_id := v_ids[1];
    end if;

    if v_target_id is null and nullif(btrim(v_raw.dms_so_no), '') is not null then
      select array_agg(eligible.id) into v_ids
      from (
        select so.id
        from public.sales_orders so
        where so.company_id = v_raw.company_id
          and so.dms_so_no = v_raw.dms_so_no
          and so.is_deleted = false
        order by so.id
        for update
      ) eligible;
      if cardinality(v_ids) > 1 then
        raise exception 'Ambiguous Sales Order text for raw row %', p_raw_id
          using errcode = '21000';
      end if;
      v_target_id := v_ids[1];
    end if;
  end if;

  -- 4. No canonical target found — return unmatched, no exception
  if v_target_id is null then
    return jsonb_build_object(
      'action',      'unmatched',
      'raw_id',      p_raw_id,
      'reason',      'No existing sales_orders row found matching dms_so_no_id or dms_so_no. '
                     'Create the order in UBS first, or set canonical_record_id on the reconciliation match.',
      'dms_so_no',   v_raw.dms_so_no,
      'dms_so_no_id', v_raw.dms_so_no_id
    );
  end if;

  -- 5. Apply per-column authority rules
  --    'always'  → overwrite unconditionally
  --    'if_null' → only write when current canonical value IS NULL
  --    UBS-local → columns not touched (notes, selling_price, stage_id, …)
  update public.sales_orders
  set
    -- authority = 'always'
    dms_so_no               = v_raw.dms_so_no,
    dms_so_no_id            = v_raw.dms_so_no_id,
    dms_customer_id         = v_raw.dms_customer_id,
    dms_customer_business_id = v_raw.dms_customer_business_id,
    dms_last_synced_at      = now(),
    -- authority = 'if_null'
    branch_code             = case when branch_code is null
                                then v_raw.branch_code
                                else branch_code
                              end,
    booking_date            = case when booking_date is null
                                then v_raw.order_date::date
                                else booking_date
                              end
  where id         = v_target_id
    and company_id = v_raw.company_id;   -- belt-and-suspenders company scope

  if not found then
    raise exception
      'sales_orders row % not found or company_id mismatch during normalizer update',
      v_target_id
      using errcode = 'no_data_found';
  end if;

  -- 6. Back-link the raw row to the canonical record
  update public.dms_raw_sales_orders
  set canonical_sales_order_id = v_target_id
  where id = p_raw_id;

  -- 7. Stamp canonical_record_id onto the match row (idempotent)
  update public.source_reconciliation_matches
  set
    canonical_table     = 'sales_orders',
    canonical_record_id = v_target_id
  where id = v_match.id
    and canonical_record_id is null;

  -- 8. Append 'normalized' audit event
  v_result := jsonb_build_object(
    'action',          'normalized',
    'raw_id',          p_raw_id,
    'sales_order_id',  v_target_id,
    'dms_so_no',       v_raw.dms_so_no,
    'dms_so_no_id',    v_raw.dms_so_no_id,
    'dms_customer_id', v_raw.dms_customer_id,
    'company_id',      v_raw.company_id
  );

  insert into public.source_reconciliation_events (
    company_id,
    match_id,
    event_type,
    event_payload
  ) values (
    v_raw.company_id,
    v_match.id,
    'normalized',
    v_result
  );

  return v_result;
end;
$$;

comment on function public.normalize_dms_sales_order(uuid) is
  'Service-only staged DMS -> legacy SO normalization: exactly one typed approved decision, '
  'valid canonical declaration and one eligible same-company target at the selected tier. '
  'Preserves column authority and existing normalized/unmatched JSON; serializes same-raw calls, '
  'not arbitrary privileged reconciliation writers or phantom candidate inserts.';

revoke all on function public.normalize_dms_sales_order(uuid) from public, anon, authenticated;
grant execute on function public.normalize_dms_sales_order(uuid) to service_role;
