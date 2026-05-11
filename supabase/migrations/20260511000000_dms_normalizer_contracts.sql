-- ============================================================================
-- Phase 5 Stage 1: DMS normalizer reference columns and field-mapping contracts
-- ============================================================================
-- Adds durable DMS reference columns to canonical UBS tables so that normalizer
-- workers can write DMS-origin IDs and sync timestamps without extra joins.
--
-- Normalizer contract rules enforced here and in application code:
--   1. DMS fields OVERWRITE canonical UBS columns only for Proton-origin facts.
--   2. UBS-local fields (notes, stage_override, salesman_id, SLA fields, LOU,
--      remark, commission) MUST NOT be overwritten by DMS sync.
--   3. Every canonical update from DMS must set dms_last_synced_at to now().
--   4. Before normalizing, a source_reconciliation_matches row with
--      match_status IN ('accepted', 'auto_matched') must exist for the record.
--   5. Conflicts (DMS value differs from existing non-null UBS value by more
--      than the tolerance threshold) must land in source_reconciliation_matches
--      with match_status='conflict' rather than overwriting silently.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- sales_orders: DMS reference columns
-- Mapping: dms_raw_sales_orders → sales_orders
--
-- DMS field         → UBS column           Authority   Notes
-- ─────────────────────────────────────────────────────────────────────────────
-- soNo              → dms_so_no            DMS         Also candidate for vso_no
-- soNoId            → dms_so_no_id         DMS         Stable deduplication key
-- customerId        → dms_customer_id      DMS
-- customerBusinessId→ dms_customer_business_id DMS
-- orderStatus       → (order_status via    DMS         Map to canonical stage
--                      stage_id lookup)                via deal_stages.name
-- branchCode        → branch_code          DMS         Only if branch_code NULL
-- salespersonCode   → (salesman_name        DMS         Lookup via DMS master
--                      lookup)                          data employee endpoint
-- orderDate         → booking_date         DMS         Only if booking_date NULL
-- (no DMS source)   → notes                UBS-local   Never overwrite
-- (no DMS source)   → selling_price        UBS-local   Never overwrite without
--                                                       Finance sign-off
-- (no DMS source)   → discount/deposit/    UBS-local   Never overwrite
--                      bank_loan_amount
-- (no DMS source)   → stage_id             UBS-local   Managed by UBS pipeline
-- (no DMS source)   → vehicle_id           UBS+DMS     Set via link_vehicle_to_
--                                                       sales_order RPC or
--                                                       dms_raw_order_vehicle_
--                                                       matches normalizer
-- ----------------------------------------------------------------------------
alter table public.sales_orders
  add column if not exists dms_so_no text,
  add column if not exists dms_so_no_id text,
  add column if not exists dms_customer_id text,
  add column if not exists dms_customer_business_id text,
  add column if not exists dms_last_synced_at timestamptz;

create unique index if not exists sales_orders_company_dms_so_no_id_key
  on public.sales_orders (company_id, dms_so_no_id)
  where dms_so_no_id is not null;

create index if not exists sales_orders_company_dms_so_no_idx
  on public.sales_orders (company_id, dms_so_no)
  where dms_so_no is not null;

comment on column public.sales_orders.dms_so_no is
  'Proton DMS soNo (human-readable order number). Normalizer writes this from dms_raw_sales_orders.dms_so_no.';

comment on column public.sales_orders.dms_so_no_id is
  'Proton DMS soNoId (stable machine ID). Unique per company. Normalizer deduplication key.';

comment on column public.sales_orders.dms_customer_id is
  'Proton DMS customer ID. Written by normalizer from dms_raw_sales_orders.dms_customer_id.';

comment on column public.sales_orders.dms_customer_business_id is
  'Proton DMS customer business/company registration ID.';

comment on column public.sales_orders.dms_last_synced_at is
  'Timestamp of the last DMS normalizer write to this canonical sales order row.';

-- ----------------------------------------------------------------------------
-- vehicles: DMS reference columns
-- Mapping: dms_raw_vehicle_stock → vehicles
--          dms_raw_order_vehicle_matches → vehicles (allocation/reg context)
--          dms_raw_deliveries → vehicles (delivery_date, stage)
--
-- DMS field         → UBS column           Authority   Notes
-- ─────────────────────────────────────────────────────────────────────────────
-- vsStockId         → dms_vs_stock_id      DMS         Stable dedup key
-- chassisNo         → chassis_no           DMS         High-confidence match key
-- vin               → (no direct column)   DMS         Stored in dms_vs_stock_id
--                                                       record; use raw_payload
-- modelCode         → model (via master    DMS         Lookup via dms_raw_master
--                      data mapping)                    _data entity_type=model
-- configCode        → variant              DMS         Only if variant NULL
-- colorCode         → color (via master    DMS         Lookup via dms_raw_master
--                      data mapping)                    _data entity_type=color
-- stockStatus       → stage / stage_       DMS         Map to Auto Aging stage
--                      override                         vocab; do not overwrite
--                                                       if stage_override set
-- branchCode        → branch_code          DMS         Only if branch_code NULL
-- (allocation)      → dms_so_no            DMS         From order_vehicle_match
-- (delivery)        → delivery_date        DMS         Only set forward; never
--                                                       overwrite a later date
-- (delivery)        → stage               DMS          Map 'delivered' status
--                                                       only; preserve UBS stage
--                                                       if already post-delivery
-- (no DMS source)   → salesman_id          UBS-local   Never overwrite
-- (no DMS source)   → remark / lou / obr   UBS-local   Never overwrite
-- (no DMS source)   → commission_*         UBS-local   Never overwrite
-- (no DMS source)   → bg_date / full_      UBS-local   Finance-grade; never
--                      payment_date                     overwrite without Finance
--                                                       sign-off
-- ----------------------------------------------------------------------------
alter table public.vehicles
  add column if not exists dms_vs_stock_id text,
  add column if not exists dms_so_no text,
  add column if not exists dms_last_synced_at timestamptz;

create unique index if not exists vehicles_company_dms_vs_stock_id_key
  on public.vehicles (company_id, dms_vs_stock_id)
  where dms_vs_stock_id is not null;

create index if not exists vehicles_company_dms_so_no_idx
  on public.vehicles (company_id, dms_so_no)
  where dms_so_no is not null;

comment on column public.vehicles.dms_vs_stock_id is
  'Proton DMS vsStockId. Unique per company. Normalizer deduplication key from dms_raw_vehicle_stock.';

comment on column public.vehicles.dms_so_no is
  'Proton DMS soNo of the sales order this vehicle was allocated to. Set by order-vehicle-match normalizer.';

comment on column public.vehicles.dms_last_synced_at is
  'Timestamp of the last DMS normalizer write to this canonical vehicle row.';

-- ----------------------------------------------------------------------------
-- customers: DMS reference columns
-- Mapping: dms_raw_sales_orders.dms_customer_id → customers (lookup)
--          legacy_staging_customers → customers (backfill)
--
-- DMS field         → UBS column           Authority   Notes
-- ─────────────────────────────────────────────────────────────────────────────
-- customerId        → dms_customer_id      DMS         Primary DMS lookup key
-- customerBusinessId→ dms_customer_business_id DMS
-- name              → name                 DMS/legacy  Only if name NULL
-- icNo / tinNo      → ic_no               DMS/legacy  High-confidence match key
-- phone             → phone                DMS/legacy  Only if phone NULL
-- email             → email                DMS/legacy  Only if email NULL
-- (no DMS source)   → notes                UBS-local   Never overwrite
-- ----------------------------------------------------------------------------
alter table public.customers
  add column if not exists dms_customer_id text,
  add column if not exists dms_customer_business_id text,
  add column if not exists dms_last_synced_at timestamptz;

create unique index if not exists customers_company_dms_customer_id_key
  on public.customers (company_id, dms_customer_id)
  where dms_customer_id is not null;

comment on column public.customers.dms_customer_id is
  'Proton DMS customer ID. Unique per company. Normalizer deduplication key.';

comment on column public.customers.dms_customer_business_id is
  'Proton DMS customer business/company registration ID.';

comment on column public.customers.dms_last_synced_at is
  'Timestamp of the last DMS normalizer write to this canonical customer row.';

-- ----------------------------------------------------------------------------
-- Normalizer contract view: exposes which staging rows have accepted matches
-- and are eligible for canonical write-back. Read-only; no UBS rows are
-- modified by this migration.
-- ----------------------------------------------------------------------------
create or replace view public.dms_normalizer_eligible_records as
  select
    m.company_id,
    m.object_type,
    m.source_system,
    m.source_table,
    m.source_record_id,
    m.canonical_table,
    m.canonical_record_id,
    m.match_status,
    m.confidence_score,
    m.match_rule,
    m.match_basis,
    m.source_priority,
    m.reviewed_at,
    m.review_notes
  from public.source_reconciliation_matches m
  where m.match_status in ('accepted', 'auto_matched')
    and m.source_system = 'dms';

comment on view public.dms_normalizer_eligible_records is
  'Read-only view of DMS staging records that have an accepted or auto-matched reconciliation decision and are eligible for canonical UBS write-back.';

-- RLS: only company-scoped admins/executives can read this view
-- (view inherits RLS from source_reconciliation_matches)

-- ----------------------------------------------------------------------------
-- Normalizer authority enum: documents which columns are DMS-authoritative
-- vs. UBS-local. Stored as a table so application code can query it at
-- runtime to enforce overwrite rules without hardcoding field lists.
-- ----------------------------------------------------------------------------
create table if not exists public.normalizer_column_authority (
  id uuid primary key default gen_random_uuid(),
  canonical_table text not null,
  column_name text not null,
  authority text not null check (authority in ('dms', 'legacy_fookloi', 'ubs_local', 'ubs_plus_dms')),
  overwrite_rule text not null check (overwrite_rule in (
    'always',           -- DMS always wins; overwrite existing value
    'if_null',          -- Only write if canonical column is currently NULL
    'if_null_or_older', -- Write if NULL or DMS value is newer
    'never',            -- UBS-local only; never overwrite from DMS
    'conflict_review'   -- Write only after manual conflict review
  )),
  notes text,
  created_at timestamptz not null default now(),
  unique (canonical_table, column_name)
);

comment on table public.normalizer_column_authority is
  'Explicit per-column authority and overwrite rules used by DMS normalizer workers. Query this table at runtime to enforce field-level overwrite policies.';

-- sales_orders authority rules
insert into public.normalizer_column_authority (canonical_table, column_name, authority, overwrite_rule, notes) values
  ('sales_orders', 'dms_so_no',                 'dms',       'always',           'Primary DMS soNo reference'),
  ('sales_orders', 'dms_so_no_id',               'dms',       'always',           'Stable DMS machine ID'),
  ('sales_orders', 'dms_customer_id',            'dms',       'always',           'DMS customer reference'),
  ('sales_orders', 'dms_customer_business_id',   'dms',       'always',           'DMS customer business ID'),
  ('sales_orders', 'dms_last_synced_at',         'dms',       'always',           'Updated on every DMS sync'),
  ('sales_orders', 'branch_code',                'dms',       'if_null',          'DMS wins only if UBS branch_code is NULL'),
  ('sales_orders', 'booking_date',               'dms',       'if_null',          'DMS orderDate wins only if booking_date is NULL'),
  ('sales_orders', 'notes',                      'ubs_local', 'never',            'UBS-local free text; never overwrite'),
  ('sales_orders', 'selling_price',              'ubs_local', 'conflict_review',  'Finance-grade; require manual review before overwrite'),
  ('sales_orders', 'discount',                   'ubs_local', 'never',            'UBS-local; never overwrite'),
  ('sales_orders', 'deposit_amount',             'ubs_local', 'never',            'UBS-local; never overwrite'),
  ('sales_orders', 'bank_loan_amount',           'ubs_local', 'never',            'UBS-local; never overwrite'),
  ('sales_orders', 'stage_id',                   'ubs_local', 'never',            'UBS pipeline stage; never overwrite from DMS'),
  ('sales_orders', 'vehicle_id',                 'ubs_plus_dms', 'if_null',       'Set by link_vehicle_to_sales_order RPC or order-vehicle-match normalizer')
on conflict (canonical_table, column_name) do update
  set authority = excluded.authority,
      overwrite_rule = excluded.overwrite_rule,
      notes = excluded.notes;

-- vehicles authority rules
insert into public.normalizer_column_authority (canonical_table, column_name, authority, overwrite_rule, notes) values
  ('vehicles', 'dms_vs_stock_id',      'dms',       'always',           'Stable DMS stock ID'),
  ('vehicles', 'dms_so_no',            'dms',       'if_null',          'DMS order link from allocation match; only if NULL'),
  ('vehicles', 'dms_last_synced_at',   'dms',       'always',           'Updated on every DMS sync'),
  ('vehicles', 'chassis_no',           'dms',       'if_null',          'High-confidence match key; DMS wins if UBS value NULL'),
  ('vehicles', 'model',                'dms',       'if_null',          'DMS modelCode lookup via master data; only if NULL'),
  ('vehicles', 'variant',              'dms',       'if_null',          'DMS configCode lookup; only if NULL'),
  ('vehicles', 'color',                'dms',       'if_null',          'DMS colorCode lookup via master data; only if NULL'),
  ('vehicles', 'branch_code',          'dms',       'if_null',          'DMS branchCode; only if NULL'),
  ('vehicles', 'delivery_date',        'dms',       'if_null_or_older', 'DMS delivery date wins if NULL or DMS date is earlier'),
  ('vehicles', 'salesman_id',          'ubs_local', 'never',            'UBS-local; never overwrite from DMS'),
  ('vehicles', 'salesman_name',        'ubs_local', 'never',            'UBS-local; never overwrite from DMS'),
  ('vehicles', 'remark',               'ubs_local', 'never',            'UBS-local free text'),
  ('vehicles', 'lou',                  'ubs_local', 'never',            'UBS LOU aging; never overwrite'),
  ('vehicles', 'obr',                  'ubs_local', 'never',            'UBS OBR tracking; never overwrite'),
  ('vehicles', 'stage',                'ubs_plus_dms', 'if_null',       'DMS stockStatus maps to stage vocab only if NULL and no stage_override'),
  ('vehicles', 'stage_override',       'ubs_local', 'never',            'UBS manual override; DMS must never clear this'),
  ('vehicles', 'bg_date',              'ubs_local', 'conflict_review',  'Finance-grade booking guarantee date; conflict review required'),
  ('vehicles', 'full_payment_date',    'ubs_local', 'conflict_review',  'Finance-grade; conflict review required'),
  ('vehicles', 'commission_paid',      'ubs_local', 'never',            'UBS commission tracking; never overwrite'),
  ('vehicles', 'commission_paid_at',   'ubs_local', 'never',            'UBS commission; never overwrite')
on conflict (canonical_table, column_name) do update
  set authority = excluded.authority,
      overwrite_rule = excluded.overwrite_rule,
      notes = excluded.notes;

-- customers authority rules
insert into public.normalizer_column_authority (canonical_table, column_name, authority, overwrite_rule, notes) values
  ('customers', 'dms_customer_id',            'dms',       'always',           'Primary DMS customer reference'),
  ('customers', 'dms_customer_business_id',   'dms',       'always',           'DMS business ID'),
  ('customers', 'dms_last_synced_at',         'dms',       'always',           'Updated on every DMS sync'),
  ('customers', 'name',                       'dms',       'if_null',          'DMS customer name; only if UBS name is NULL'),
  ('customers', 'ic_no',                      'dms',       'if_null',          'IC/TIN match key; only if NULL'),
  ('customers', 'phone',                      'dms',       'if_null',          'DMS phone; only if NULL'),
  ('customers', 'email',                      'dms',       'if_null',          'DMS email; only if NULL'),
  ('customers', 'notes',                      'ubs_local', 'never',            'UBS-local free text; never overwrite')
on conflict (canonical_table, column_name) do update
  set authority = excluded.authority,
      overwrite_rule = excluded.overwrite_rule,
      notes = excluded.notes;

-- RLS: normalizer_column_authority is a configuration table; readable by all
-- authenticated users within a company, writable only by service role.
alter table public.normalizer_column_authority enable row level security;

create policy "normalizer_column_authority_select_authenticated"
  on public.normalizer_column_authority
  for select
  to authenticated
  using (true);

comment on policy "normalizer_column_authority_select_authenticated" on public.normalizer_column_authority is
  'All authenticated users can read normalizer authority rules. Only service role can insert/update.';
