-- ============================================================================
-- Phase 5 Stage 1 (v2): normalize_dms_vehicle_stock() — corrected stage logic
-- ============================================================================
-- Replaces the v1 function from 20260511020000.
--
-- Correction: vehicles.stage is fully owned by the recompute_vehicle_stage
-- BEFORE trigger (fires on UPDATE OF reg_date, reg_no, delivery_date,
-- disb_date, stage_override). The normalizer must NOT include stage in its
-- UPDATE SET clause — DMS stock_status values ('AR', 'ALLOCATED', etc.) do
-- not map to the UBS stage vocabulary and writing them would violate the
-- vehicles_stage_check constraint. Delivery_date is the only column the
-- normalizer writes that influences stage (the trigger computes it).
--
-- Updated overwrite contract:
--   dms_vs_stock_id, dms_last_synced_at                      → always
--   dms_so_no (from delivery row)                             → if_null
--   chassis_no, model, variant, color, branch_code            → if_null
--   delivery_date                                             → if_null_or_older
--   stage                                                     → NOT TOUCHED
--                                                               (owned by
--                                                                recompute_vehicle_stage trigger)
--   salesman_id, salesman_name, remark, lou, obr,
--     commission_*, bg_date, full_payment_date, stage_override → NEVER touched
-- ============================================================================

create or replace function public.normalize_dms_vehicle_stock(
  p_raw_id       uuid,
  p_delivery_id  uuid  default null  -- optional dms_raw_deliveries row to apply
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw       dms_raw_vehicle_stock%rowtype;
  v_delivery  dms_raw_deliveries%rowtype;
  v_match     source_reconciliation_matches%rowtype;
  v_target_id uuid;
  v_result    jsonb;
begin
  -- 1. Load raw staging row
  select * into v_raw
  from public.dms_raw_vehicle_stock
  where id = p_raw_id;

  if not found then
    raise exception 'dms_raw_vehicle_stock row % not found', p_raw_id
      using errcode = 'no_data_found';
  end if;

  -- 2. Load optional delivery row (same company guard)
  if p_delivery_id is not null then
    select * into v_delivery
    from public.dms_raw_deliveries
    where id         = p_delivery_id
      and company_id = v_raw.company_id;

    if not found then
      raise exception
        'dms_raw_deliveries row % not found or company_id mismatch', p_delivery_id
        using errcode = 'no_data_found';
    end if;
  end if;

  -- 3. Require an accepted / auto_matched reconciliation match
  select * into v_match
  from public.source_reconciliation_matches
  where source_table     = 'dms_raw_vehicle_stock'
    and source_record_id = p_raw_id
    and match_status     in ('accepted', 'auto_matched')
    and company_id       = v_raw.company_id
  order by source_priority asc
  limit 1;

  if not found then
    raise exception
      'No accepted reconciliation match for dms_raw_vehicle_stock row %. '
      'Call seed_source_reconciliation_candidates() and accept the match first.',
      p_raw_id
      using errcode = 'insufficient_privilege';
  end if;

  -- 4. Resolve canonical vehicles row
  --    Priority: match.canonical_record_id → dms_vs_stock_id → chassis_no
  v_target_id := v_match.canonical_record_id;

  if v_target_id is null and v_raw.dms_vs_stock_id is not null then
    select id into v_target_id
    from public.vehicles
    where company_id      = v_raw.company_id
      and dms_vs_stock_id = v_raw.dms_vs_stock_id
      and is_deleted      = false
    limit 1;
  end if;

  if v_target_id is null and v_raw.chassis_no is not null then
    select id into v_target_id
    from public.vehicles
    where company_id = v_raw.company_id
      and chassis_no  = v_raw.chassis_no
      and is_deleted  = false
    limit 1;
  end if;

  -- 5. No canonical target — return unmatched without exception
  if v_target_id is null then
    return jsonb_build_object(
      'action',          'unmatched',
      'raw_id',          p_raw_id,
      'reason',          'No existing vehicles row found matching dms_vs_stock_id or chassis_no. '
                         'Create the vehicle in UBS first, or set canonical_record_id on the reconciliation match.',
      'dms_vs_stock_id', v_raw.dms_vs_stock_id,
      'chassis_no',      v_raw.chassis_no
    );
  end if;

  -- 6. Apply per-column authority rules
  --    NOTE: stage is intentionally excluded — it is fully owned by the
  --    recompute_vehicle_stage BEFORE trigger. Writing delivery_date below
  --    causes that trigger to fire and recompute stage from business columns.
  update public.vehicles
  set
    -- authority = 'always'
    dms_vs_stock_id    = v_raw.dms_vs_stock_id,
    dms_last_synced_at = now(),
    -- authority = 'if_null'
    chassis_no   = case when chassis_no  is null then coalesce(v_raw.chassis_no,  chassis_no)  else chassis_no  end,
    model        = case when model       is null then coalesce(v_raw.model_code,  model)        else model       end,
    variant      = case when variant     is null then coalesce(v_raw.config_code, variant)      else variant     end,
    color        = case when color       is null then coalesce(v_raw.color_code,  color)        else color       end,
    branch_code  = case when branch_code is null then coalesce(v_raw.branch_code, branch_code) else branch_code end,
    -- authority = 'if_null' for dms_so_no (from delivery row)
    dms_so_no    = case
                     when dms_so_no is null and v_delivery.dms_so_no is not null
                       then v_delivery.dms_so_no
                     else dms_so_no
                   end,
    -- authority = 'if_null_or_older' for delivery_date
    delivery_date = case
                      when v_delivery.delivered_at is not null then
                        case
                          when delivery_date is null then v_delivery.delivered_at::date
                          when v_delivery.delivered_at::date < delivery_date then v_delivery.delivered_at::date
                          else delivery_date
                        end
                      else delivery_date
                    end
    -- UBS-local columns intentionally omitted (NEVER touched by normalizer):
    --   stage, stage_override, salesman_id, salesman_name, remark, lou, obr,
    --   contra_sola, commission_paid, commission_paid_at, commission_remark,
    --   bg_date, full_payment_date, full_payment_type
  where id         = v_target_id
    and company_id = v_raw.company_id;

  if not found then
    raise exception
      'vehicles row % not found or company_id mismatch during normalizer update',
      v_target_id
      using errcode = 'no_data_found';
  end if;

  -- 7. Back-link raw rows to canonical record
  update public.dms_raw_vehicle_stock
  set canonical_vehicle_id = v_target_id
  where id = p_raw_id;

  if p_delivery_id is not null then
    update public.dms_raw_deliveries
    set canonical_vehicle_id = v_target_id
    where id = p_delivery_id;
  end if;

  -- 8. Stamp canonical_record_id onto the match row (idempotent)
  update public.source_reconciliation_matches
  set
    canonical_table     = 'vehicles',
    canonical_record_id = v_target_id
  where id = v_match.id
    and canonical_record_id is null;

  -- 9. Append 'normalized' audit event
  v_result := jsonb_build_object(
    'action',          'normalized',
    'raw_id',          p_raw_id,
    'vehicle_id',      v_target_id,
    'dms_vs_stock_id', v_raw.dms_vs_stock_id,
    'chassis_no',      v_raw.chassis_no,
    'delivery_id',     p_delivery_id,
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
