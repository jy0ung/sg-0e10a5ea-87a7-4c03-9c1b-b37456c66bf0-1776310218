-- ============================================================================
-- Phase 5 Stage 1: normalize_dms_sales_order() — staged-data normalizer
-- ============================================================================
-- Reads an accepted dms_raw_sales_orders row and applies per-column authority
-- rules (from normalizer_column_authority) to update the matching canonical
-- sales_orders row. Does NOT fetch live DMS data — only processes rows that
-- dms-sync-worker has already deposited into the staging table.
--
-- Overwrite contract (enforced in function body, mirrors normalizer_column_authority):
--   dms_so_no, dms_so_no_id, dms_customer_id, dms_customer_business_id  → always
--   dms_last_synced_at                                                    → always (now())
--   branch_code                                                           → if_null
--   booking_date (from DMS order_date::date)                             → if_null
--   notes, selling_price, discount, deposit_amount, bank_loan_amount,
--     stage_id, vehicle_id                                               → NEVER touched
--
-- Returns a jsonb summary of what was done ('normalized' or 'unmatched').
-- ============================================================================

-- Add 'normalized' to the allowed event_type values for audit events.
alter table public.source_reconciliation_events
  drop constraint if exists source_reconciliation_events_event_type_check;

alter table public.source_reconciliation_events
  add constraint source_reconciliation_events_event_type_check
  check (event_type = any (array[
    'created'::text,
    'auto_matched'::text,
    'accepted'::text,
    'conflict'::text,
    'ignored'::text,
    'rejected'::text,
    'note_added'::text,
    'normalized'::text
  ]));

-- ----------------------------------------------------------------------------
-- normalize_dms_sales_order(p_raw_id)
--
-- Parameters
--   p_raw_id  uuid   Primary key of the dms_raw_sales_orders row to normalize.
--
-- Pre-conditions (enforced with exceptions)
--   1. The row must exist in dms_raw_sales_orders.
--   2. A source_reconciliation_matches row for this raw_id must exist with
--      match_status IN ('accepted', 'auto_matched').
--
-- Behavior
--   3. Locates the target sales_orders row via:
--        a. source_reconciliation_matches.canonical_record_id (if set), then
--        b. sales_orders.dms_so_no_id match, then
--        c. sales_orders.dms_so_no match.
--   4. If no canonical target is found, returns
--        { "action": "unmatched", "reason": "..." }
--      without raising an exception (caller decides next step).
--   5. Applies overwrite rules and UPDATE the canonical row.
--   6. Back-links dms_raw_sales_orders.canonical_sales_order_id.
--   7. Stamps canonical_record_id onto the match row (if previously NULL).
--   8. Inserts a 'normalized' source_reconciliation_events audit record.
--   9. Returns { "action": "normalized", "sales_order_id": "...", ... }.
-- ----------------------------------------------------------------------------
create or replace function public.normalize_dms_sales_order(p_raw_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw    dms_raw_sales_orders%rowtype;
  v_match  source_reconciliation_matches%rowtype;
  v_target_id uuid;
  v_result jsonb;
begin
  -- 1. Load raw staging row
  select * into v_raw
  from public.dms_raw_sales_orders
  where id = p_raw_id;

  if not found then
    raise exception 'dms_raw_sales_orders row % not found', p_raw_id
      using errcode = 'no_data_found';
  end if;

  -- 2. Require an accepted / auto_matched reconciliation match
  select * into v_match
  from public.source_reconciliation_matches
  where source_table     = 'dms_raw_sales_orders'
    and source_record_id = p_raw_id
    and match_status     in ('accepted', 'auto_matched')
    and company_id       = v_raw.company_id
  order by source_priority asc
  limit 1;

  if not found then
    raise exception
      'No accepted reconciliation match for dms_raw_sales_orders row %. '
      'Call seed_source_reconciliation_candidates() and accept the match first.',
      p_raw_id
      using errcode = 'insufficient_privilege';
  end if;

  -- 3. Resolve canonical sales_orders row
  --    Priority: match.canonical_record_id → dms_so_no_id dedup → dms_so_no dedup
  v_target_id := v_match.canonical_record_id;

  if v_target_id is null and v_raw.dms_so_no_id is not null then
    select id into v_target_id
    from public.sales_orders
    where company_id  = v_raw.company_id
      and dms_so_no_id = v_raw.dms_so_no_id
      and is_deleted   = false
    limit 1;
  end if;

  if v_target_id is null and v_raw.dms_so_no is not null then
    select id into v_target_id
    from public.sales_orders
    where company_id = v_raw.company_id
      and dms_so_no  = v_raw.dms_so_no
      and is_deleted = false
    limit 1;
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
  'Normalizes one accepted dms_raw_sales_orders row into the canonical sales_orders table '
  'using the per-column overwrite rules in normalizer_column_authority. '
  'Reads staged data only — does NOT fetch live DMS data. '
  'Returns a jsonb summary: { action: "normalized"|"unmatched", ... }.';
