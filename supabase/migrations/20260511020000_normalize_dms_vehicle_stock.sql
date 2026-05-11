-- ============================================================================
-- Phase 5 Stage 1: normalize_dms_vehicle_stock() — staged-data normalizer
-- ============================================================================
-- Reads an accepted dms_raw_vehicle_stock row and applies per-column authority
-- rules to update the matching canonical vehicles row.
-- Optionally incorporates a dms_raw_deliveries row for the same vehicle to
-- apply the delivery_date (if_null_or_older rule).
--
-- Does NOT fetch live DMS data — only processes rows already deposited by
-- dms-sync-worker into the staging tables.
--
-- Overwrite contract (mirrors normalizer_column_authority):
--   dms_vs_stock_id, dms_last_synced_at                      → always
--   dms_so_no (from delivery match)                           → if_null
--   chassis_no, model, variant, color, branch_code            → if_null
--   delivery_date                                             → if_null_or_older
--   stage (from stock_status)                                 → if_null and
--                                                               stage_override IS NULL
--   salesman_id, salesman_name, remark, lou, obr,
--     commission_*, bg_date, full_payment_date, stage_override → NEVER touched
--
-- Returns jsonb: { "action": "normalized"|"unmatched", ... }
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
  v_raw      dms_raw_vehicle_stock%rowtype;
  v_delivery dms_raw_deliveries%rowtype;
  v_match    source_reconciliation_matches%rowtype;
  v_target_id uuid;
  v_result    jsonb;

  -- DMS stock_status → UBS stage vocabulary mapping
  -- Only used when canonical stage IS NULL and stage_override IS NULL
  v_mapped_stage text;
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
    where id          = p_delivery_id
      and company_id  = v_raw.company_id;

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
    where company_id     = v_raw.company_id
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
      'action',         'unmatched',
      'raw_id',         p_raw_id,
      'reason',         'No existing vehicles row found matching dms_vs_stock_id or chassis_no. '
                        'Create the vehicle in UBS first, or set canonical_record_id on the reconciliation match.',
      'dms_vs_stock_id', v_raw.dms_vs_stock_id,
      'chassis_no',      v_raw.chassis_no
    );
  end if;

  -- 6. Map DMS stock_status to UBS stage vocabulary
  --    Only applied when canonical stage IS NULL and stage_override IS NULL
  v_mapped_stage := case v_raw.stock_status
    when 'AR'        then 'Arrived'
    when 'ALLOCATED' then 'Allocated'
    when 'DELIVERED' then 'Delivered'
    when 'SOLD'      then 'Sold'
    else null  -- unknown status: leave stage unchanged
  end;

  -- 7. Apply per-column authority rules
  update public.vehicles
  set
    -- authority = 'always'
    dms_vs_stock_id   = v_raw.dms_vs_stock_id,
    dms_last_synced_at = now(),
    -- authority = 'if_null'
    chassis_no        = case when chassis_no   is null then coalesce(v_raw.chassis_no, chassis_no) else chassis_no end,
    model             = case when model        is null then coalesce(v_raw.model_code,  model)      else model      end,
    variant           = case when variant      is null then coalesce(v_raw.config_code, variant)    else variant    end,
    color             = case when color        is null then coalesce(v_raw.color_code,  color)      else color      end,
    branch_code       = case when branch_code  is null then coalesce(v_raw.branch_code, branch_code) else branch_code end,
    -- authority = 'if_null' for dms_so_no (from delivery row)
    dms_so_no         = case
                          when dms_so_no is null and v_delivery.dms_so_no is not null
                            then v_delivery.dms_so_no
                          else dms_so_no
                        end,
    -- authority = 'if_null_or_older' for delivery_date
    delivery_date     = case
                          when v_delivery.delivered_at is not null then
                            case
                              when delivery_date is null then v_delivery.delivered_at::date
                              when v_delivery.delivered_at::date < delivery_date then v_delivery.delivered_at::date
                              else delivery_date
                            end
                          else delivery_date
                        end,
    -- authority = 'if_null' for stage (only if no override set)
    stage             = case
                          when stage is null
                           and stage_override is null
                           and v_mapped_stage is not null
                            then v_mapped_stage
                          else stage
                        end
    -- UBS-local columns intentionally omitted:
    --   salesman_id, salesman_name, remark, lou, obr, contra_sola,
    --   commission_paid, commission_paid_at, commission_remark,
    --   bg_date, full_payment_date, full_payment_type, stage_override
  where id         = v_target_id
    and company_id = v_raw.company_id;

  if not found then
    raise exception
      'vehicles row % not found or company_id mismatch during normalizer update',
      v_target_id
      using errcode = 'no_data_found';
  end if;

  -- 8. Back-link raw rows to canonical record
  update public.dms_raw_vehicle_stock
  set canonical_vehicle_id = v_target_id
  where id = p_raw_id;

  if p_delivery_id is not null then
    update public.dms_raw_deliveries
    set canonical_vehicle_id = v_target_id
    where id = p_delivery_id;
  end if;

  -- 9. Stamp canonical_record_id onto the match row (idempotent)
  update public.source_reconciliation_matches
  set
    canonical_table     = 'vehicles',
    canonical_record_id = v_target_id
  where id = v_match.id
    and canonical_record_id is null;

  -- 10. Append 'normalized' audit event
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

comment on function public.normalize_dms_vehicle_stock(uuid, uuid) is
  'Normalizes one accepted dms_raw_vehicle_stock row into the canonical vehicles table '
  'using the per-column overwrite rules in normalizer_column_authority. '
  'Optionally incorporates a dms_raw_deliveries row (p_delivery_id) to apply delivery_date and dms_so_no. '
  'Reads staged data only — does NOT fetch live DMS data. '
  'Returns a jsonb summary: { action: "normalized"|"unmatched", ... }.';
