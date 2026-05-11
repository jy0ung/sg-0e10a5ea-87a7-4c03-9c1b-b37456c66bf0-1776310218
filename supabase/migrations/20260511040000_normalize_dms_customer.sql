-- ============================================================================
-- Phase 5 Stage 1: normalize_dms_customer() — staged-data customer normalizer
-- ============================================================================
-- Reads an accepted dms_raw_sales_orders row (which carries dms_customer_id and
-- dms_customer_business_id from the DMS sales order payload) and applies
-- per-column authority rules to update the matching canonical customers row.
--
-- Does NOT fetch live DMS data — only processes rows already deposited by
-- dms-sync-worker into dms_raw_sales_orders. Customer identity fields
-- (name, ic_no, phone, email) are extracted from raw_payload JSONB using
-- provisional DMS field names; unrecognised paths are silently null and the
-- if_null guard preserves the existing canonical value.
--
-- Pre-condition:  An accepted source_reconciliation_matches row must exist for
--                 the raw sales order row WITH object_type = 'customer'.  This
--                 is distinct from the sales_order match for the same raw row.
--
-- Overwrite contract (mirrors normalizer_column_authority):
--   dms_customer_id, dms_customer_business_id, dms_last_synced_at  → always
--   name, ic_no, phone, email (from raw_payload)                   → if_null
--   notes                                                           → NEVER
--
-- Returns jsonb: { "action": "normalized"|"unmatched", ... }
-- ============================================================================

-- Add canonical_customer_id back-link to dms_raw_sales_orders
alter table public.dms_raw_sales_orders
  add column if not exists canonical_customer_id uuid
    references public.customers(id) on delete set null;

-- Index for efficient back-link queries
create index if not exists dms_raw_sales_orders_canonical_customer_id_idx
  on public.dms_raw_sales_orders (canonical_customer_id)
  where canonical_customer_id is not null;

-- ----------------------------------------------------------------------------
-- normalize_dms_customer(p_raw_id)
--
-- Parameters
--   p_raw_id  uuid  Primary key of the dms_raw_sales_orders row to process.
--
-- Pre-conditions (enforced with exceptions)
--   1. The dms_raw_sales_orders row must exist.
--   2. A source_reconciliation_matches row must exist for this raw_id with
--      object_type = 'customer' and match_status IN ('accepted', 'auto_matched').
--
-- Resolution order for canonical customers row
--   a. match.canonical_record_id
--   b. customers.dms_customer_id  (unique index per company)
--   c. customers.dms_customer_business_id
--
-- If_null identity fields are extracted from raw_payload with provisional
-- DMS field name patterns.  Update the JSONB paths here once the Proton DMS
-- API contract is confirmed:
--   name    → raw_payload->>'customerName' or 'custName' or 'name'
--   ic_no   → raw_payload->>'ic' or 'icNo' or 'identityNo'
--   phone   → raw_payload->>'phone' or 'phoneNo' or 'mobile'
--   email   → raw_payload->>'email' or 'emailAddr'
-- ----------------------------------------------------------------------------
create or replace function public.normalize_dms_customer(p_raw_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw        dms_raw_sales_orders%rowtype;
  v_match      source_reconciliation_matches%rowtype;
  v_target_id  uuid;
  v_result     jsonb;

  -- Provisional identity fields extracted from raw_payload
  v_name   text;
  v_ic_no  text;
  v_phone  text;
  v_email  text;
begin
  -- 1. Load raw staging row
  select * into v_raw
  from public.dms_raw_sales_orders
  where id = p_raw_id;

  if not found then
    raise exception 'dms_raw_sales_orders row % not found', p_raw_id
      using errcode = 'no_data_found';
  end if;

  -- 2. Require an accepted / auto_matched customer-object reconciliation match
  --    object_type = 'customer' distinguishes this from the sales_order match
  --    that may exist for the same source_record_id.
  select * into v_match
  from public.source_reconciliation_matches
  where source_table     = 'dms_raw_sales_orders'
    and source_record_id = p_raw_id
    and object_type      = 'customer'
    and match_status     in ('accepted', 'auto_matched')
    and company_id       = v_raw.company_id
  order by source_priority asc
  limit 1;

  if not found then
    raise exception
      'No accepted customer reconciliation match for dms_raw_sales_orders row %. '
      'Seed a source_reconciliation_matches row with object_type=''customer'' '
      'and accept it before calling normalize_dms_customer().',
      p_raw_id
      using errcode = 'insufficient_privilege';
  end if;

  -- 3. Resolve canonical customers row
  --    Priority: match.canonical_record_id → dms_customer_id → dms_customer_business_id
  v_target_id := v_match.canonical_record_id;

  if v_target_id is null and v_raw.dms_customer_id is not null then
    select id into v_target_id
    from public.customers
    where company_id       = v_raw.company_id
      and dms_customer_id  = v_raw.dms_customer_id
      and is_deleted        = false
    limit 1;
  end if;

  if v_target_id is null and v_raw.dms_customer_business_id is not null then
    select id into v_target_id
    from public.customers
    where company_id              = v_raw.company_id
      and dms_customer_business_id = v_raw.dms_customer_business_id
      and is_deleted               = false
    limit 1;
  end if;

  -- 4. No canonical target found — return unmatched, no exception
  if v_target_id is null then
    return jsonb_build_object(
      'action',                  'unmatched',
      'raw_id',                  p_raw_id,
      'reason',                  'No existing customers row found matching dms_customer_id or dms_customer_business_id. '
                                  'Create the customer in UBS first, or set canonical_record_id on the reconciliation match.',
      'dms_customer_id',         v_raw.dms_customer_id,
      'dms_customer_business_id', v_raw.dms_customer_business_id
    );
  end if;

  -- 5. Extract provisional identity fields from raw_payload
  --    Paths are best-effort; update these once Proton DMS API field names are confirmed.
  v_name  := nullif(trim(coalesce(
    v_raw.raw_payload->>'customerName',
    v_raw.raw_payload->>'custName',
    v_raw.raw_payload->>'name'
  )), '');

  v_ic_no := nullif(trim(coalesce(
    v_raw.raw_payload->>'ic',
    v_raw.raw_payload->>'icNo',
    v_raw.raw_payload->>'identityNo',
    v_raw.raw_payload->>'nric'
  )), '');

  v_phone := nullif(trim(coalesce(
    v_raw.raw_payload->>'phone',
    v_raw.raw_payload->>'phoneNo',
    v_raw.raw_payload->>'mobile',
    v_raw.raw_payload->>'contactNo'
  )), '');

  v_email := nullif(trim(coalesce(
    v_raw.raw_payload->>'email',
    v_raw.raw_payload->>'emailAddr',
    v_raw.raw_payload->>'emailAddress'
  )), '');

  -- 6. Apply per-column authority rules
  --    always  → overwrite unconditionally
  --    if_null → only write when current canonical value IS NULL
  --    never   → notes; intentionally excluded
  update public.customers
  set
    -- authority = 'always'
    dms_customer_id          = v_raw.dms_customer_id,
    dms_customer_business_id = v_raw.dms_customer_business_id,
    dms_last_synced_at       = now(),
    -- authority = 'if_null'
    name   = case when name   is null and v_name  is not null then v_name  else name   end,
    ic_no  = case when ic_no  is null and v_ic_no is not null then v_ic_no else ic_no  end,
    phone  = case when phone  is null and v_phone is not null then v_phone else phone  end,
    email  = case when email  is null and v_email is not null then v_email else email  end
    -- UBS-local column intentionally omitted: notes
  where id         = v_target_id
    and company_id = v_raw.company_id;

  if not found then
    raise exception
      'customers row % not found or company_id mismatch during normalizer update',
      v_target_id
      using errcode = 'no_data_found';
  end if;

  -- 7. Back-link the raw row to the canonical customer
  update public.dms_raw_sales_orders
  set canonical_customer_id = v_target_id
  where id = p_raw_id;

  -- 8. Stamp canonical_record_id onto the match row (idempotent)
  update public.source_reconciliation_matches
  set
    canonical_table     = 'customers',
    canonical_record_id = v_target_id
  where id = v_match.id
    and canonical_record_id is null;

  -- 9. Append 'normalized' audit event
  v_result := jsonb_build_object(
    'action',                  'normalized',
    'raw_id',                  p_raw_id,
    'customer_id',             v_target_id,
    'dms_customer_id',         v_raw.dms_customer_id,
    'dms_customer_business_id', v_raw.dms_customer_business_id,
    'company_id',              v_raw.company_id
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
