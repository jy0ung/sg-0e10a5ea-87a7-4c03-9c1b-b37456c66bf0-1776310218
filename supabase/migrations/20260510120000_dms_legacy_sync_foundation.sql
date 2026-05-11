-- ============================================================================
-- Phase 5 foundation: DMS and legacy source staging
-- ============================================================================
-- This migration creates the backend-only landing zone for upstream DMS data,
-- legacy fookloi.net extracts, and deterministic reconciliation decisions.
-- It does not wire any browser route or product page to these tables.

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  source_system text not null check (source_system in ('dms', 'legacy_fookloi', 'google_sheets', 'manual')),
  sync_type text not null,
  source_endpoint text,
  request_filters jsonb not null default '{}'::jsonb,
  page_cursor text,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  record_count integer not null default 0 check (record_count >= 0),
  payload_hash text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_runs_finished_after_started_check
    check (finished_at is null or finished_at >= started_at)
);

create index if not exists sync_runs_company_source_status_idx
  on public.sync_runs (company_id, source_system, status, started_at desc);

create index if not exists sync_runs_company_type_idx
  on public.sync_runs (company_id, sync_type, started_at desc);

comment on table public.sync_runs is
  'Auditable backend sync attempts for DMS, legacy fookloi.net, Google Sheets exceptions, and manual source imports.';

create table if not exists public.dms_raw_sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source_endpoint text not null default '/api/2b/dms.retail/manfacturer/order/pageorders',
  dms_so_no text,
  dms_so_no_id text,
  dms_customer_id text,
  dms_customer_business_id text,
  order_status text,
  branch_code text,
  salesperson_code text,
  order_date timestamptz,
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  canonical_sales_order_id uuid references public.sales_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dms_raw_sales_orders_company_so_no_id_key
  on public.dms_raw_sales_orders (company_id, dms_so_no_id)
  where dms_so_no_id is not null;

create unique index if not exists dms_raw_sales_orders_company_payload_hash_key
  on public.dms_raw_sales_orders (company_id, payload_hash);

create index if not exists dms_raw_sales_orders_company_so_no_idx
  on public.dms_raw_sales_orders (company_id, dms_so_no);

create index if not exists dms_raw_sales_orders_company_status_idx
  on public.dms_raw_sales_orders (company_id, order_status, fetched_at desc);

comment on table public.dms_raw_sales_orders is
  'Raw Proton DMS sales-order payloads staged before UBS normalization or reconciliation.';

create table if not exists public.dms_raw_vehicle_stock (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source_endpoint text not null default '/api/2b/dms.retail/vsStock/findStockList',
  dms_vs_stock_id text,
  vin text,
  chassis_no text,
  stock_status text,
  branch_code text,
  model_code text,
  config_code text,
  color_code text,
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  canonical_vehicle_id uuid references public.vehicles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dms_raw_vehicle_stock_company_stock_id_key
  on public.dms_raw_vehicle_stock (company_id, dms_vs_stock_id)
  where dms_vs_stock_id is not null;

create unique index if not exists dms_raw_vehicle_stock_company_payload_hash_key
  on public.dms_raw_vehicle_stock (company_id, payload_hash);

create index if not exists dms_raw_vehicle_stock_company_vin_idx
  on public.dms_raw_vehicle_stock (company_id, vin)
  where vin is not null;

create index if not exists dms_raw_vehicle_stock_company_chassis_idx
  on public.dms_raw_vehicle_stock (company_id, chassis_no)
  where chassis_no is not null;

comment on table public.dms_raw_vehicle_stock is
  'Raw Proton DMS vehicle-stock payloads staged before UBS normalization or reconciliation.';

create table if not exists public.dms_raw_collections (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source_endpoint text not null default '/api/2b/dms.retail/vcOrder/queryList',
  dms_collection_id text,
  dms_so_no text,
  dms_so_no_id text,
  vin text,
  chassis_no text,
  branch_code text,
  collection_status text,
  collection_amount numeric(14, 2),
  collection_date date,
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dms_raw_collections_company_collection_id_key
  on public.dms_raw_collections (company_id, dms_collection_id)
  where dms_collection_id is not null;

create unique index if not exists dms_raw_collections_company_payload_hash_key
  on public.dms_raw_collections (company_id, payload_hash);

create index if not exists dms_raw_collections_company_so_no_idx
  on public.dms_raw_collections (company_id, dms_so_no)
  where dms_so_no is not null;

create index if not exists dms_raw_collections_company_chassis_idx
  on public.dms_raw_collections (company_id, chassis_no)
  where chassis_no is not null;

comment on table public.dms_raw_collections is
  'Raw Proton DMS collection snapshots staged separately from future UBS finance events.';

create table if not exists public.dms_raw_order_vehicle_matches (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source_endpoint text not null default '/api/2b/dms.retail/manfacturer/order/query/ordersMatchCar',
  dms_match_id text,
  dms_so_no text,
  dms_so_no_id text,
  dms_vs_stock_id text,
  vin text,
  chassis_no text,
  branch_code text,
  allocation_status text,
  registration_status text,
  allocated_at timestamptz,
  registered_at timestamptz,
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  canonical_sales_order_id uuid references public.sales_orders(id) on delete set null,
  canonical_vehicle_id uuid references public.vehicles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dms_raw_order_vehicle_matches_company_match_id_key
  on public.dms_raw_order_vehicle_matches (company_id, dms_match_id)
  where dms_match_id is not null;

create unique index if not exists dms_raw_order_vehicle_matches_company_payload_hash_key
  on public.dms_raw_order_vehicle_matches (company_id, payload_hash);

create index if not exists dms_raw_order_vehicle_matches_so_vehicle_idx
  on public.dms_raw_order_vehicle_matches (company_id, dms_so_no, chassis_no);

comment on table public.dms_raw_order_vehicle_matches is
  'Raw Proton DMS order-to-car allocation and registration context staged before UBS linking.';

create table if not exists public.dms_raw_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source_endpoint text not null default '/api/2b/dms.retail/car/order/pageDelivery',
  dms_delivery_id text,
  dms_so_no text,
  dms_so_no_id text,
  vin text,
  chassis_no text,
  branch_code text,
  delivery_status text,
  delivered_at timestamptz,
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  canonical_vehicle_id uuid references public.vehicles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dms_raw_deliveries_company_delivery_id_key
  on public.dms_raw_deliveries (company_id, dms_delivery_id)
  where dms_delivery_id is not null;

create unique index if not exists dms_raw_deliveries_company_payload_hash_key
  on public.dms_raw_deliveries (company_id, payload_hash);

create index if not exists dms_raw_deliveries_company_so_no_idx
  on public.dms_raw_deliveries (company_id, dms_so_no)
  where dms_so_no is not null;

create index if not exists dms_raw_deliveries_company_chassis_idx
  on public.dms_raw_deliveries (company_id, chassis_no)
  where chassis_no is not null;

comment on table public.dms_raw_deliveries is
  'Raw Proton DMS delivery and outbound payloads staged before Auto Aging and Sales reporting.';

create table if not exists public.dms_raw_leads (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source_endpoint text not null default '/api/dms.app/pc/sales/leads/page',
  dms_lead_id text,
  dms_customer_id text,
  branch_code text,
  salesperson_code text,
  lead_status text,
  lead_created_at timestamptz,
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dms_raw_leads_company_lead_id_key
  on public.dms_raw_leads (company_id, dms_lead_id)
  where dms_lead_id is not null;

create unique index if not exists dms_raw_leads_company_payload_hash_key
  on public.dms_raw_leads (company_id, payload_hash);

create index if not exists dms_raw_leads_company_status_idx
  on public.dms_raw_leads (company_id, lead_status, fetched_at desc);

comment on table public.dms_raw_leads is
  'Raw Proton DMS lead payloads staged before Sales Pipeline normalization.';

create table if not exists public.dms_raw_prospects (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source_endpoint text not null default '/api/dms.app/pc/sales/prospect/page',
  dms_prospect_id text,
  dms_customer_id text,
  branch_code text,
  salesperson_code text,
  prospect_status text,
  prospect_created_at timestamptz,
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dms_raw_prospects_company_prospect_id_key
  on public.dms_raw_prospects (company_id, dms_prospect_id)
  where dms_prospect_id is not null;

create unique index if not exists dms_raw_prospects_company_payload_hash_key
  on public.dms_raw_prospects (company_id, payload_hash);

create index if not exists dms_raw_prospects_company_status_idx
  on public.dms_raw_prospects (company_id, prospect_status, fetched_at desc);

comment on table public.dms_raw_prospects is
  'Raw Proton DMS prospect payloads staged before Sales Pipeline normalization.';

create table if not exists public.dms_raw_soa_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source_endpoint text not null default '/api/2b/dms.finance/soaRequest/getSoaList',
  dms_soa_id text,
  dms_so_no text,
  branch_code text,
  snapshot_status text,
  snapshot_date date,
  amount numeric(14, 2),
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dms_raw_soa_snapshots_company_soa_id_key
  on public.dms_raw_soa_snapshots (company_id, dms_soa_id)
  where dms_soa_id is not null;

create unique index if not exists dms_raw_soa_snapshots_company_payload_hash_key
  on public.dms_raw_soa_snapshots (company_id, payload_hash);

create index if not exists dms_raw_soa_snapshots_company_so_no_idx
  on public.dms_raw_soa_snapshots (company_id, dms_so_no)
  where dms_so_no is not null;

comment on table public.dms_raw_soa_snapshots is
  'Raw Proton DMS SOA finance snapshots staged separately from future UBS finance events.';

create table if not exists public.dms_raw_master_data (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source_endpoint text not null,
  entity_type text not null,
  dms_entity_id text,
  entity_code text,
  entity_label text,
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dms_raw_master_data_company_entity_id_key
  on public.dms_raw_master_data (company_id, entity_type, dms_entity_id)
  where dms_entity_id is not null;

create unique index if not exists dms_raw_master_data_company_payload_hash_key
  on public.dms_raw_master_data (company_id, payload_hash);

create index if not exists dms_raw_master_data_company_type_code_idx
  on public.dms_raw_master_data (company_id, entity_type, entity_code);

comment on table public.dms_raw_master_data is
  'Raw Proton DMS master data payloads staged by entity type before UBS mapping.';

create table if not exists public.legacy_staging_customers (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  legacy_source text not null default 'fookloi.net',
  legacy_customer_id text,
  customer_name text,
  identity_no text,
  company_registration_no text,
  tin_no text,
  phone text,
  email text,
  branch_code text,
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  canonical_customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists legacy_staging_customers_company_legacy_id_key
  on public.legacy_staging_customers (company_id, legacy_source, legacy_customer_id)
  where legacy_customer_id is not null;

create unique index if not exists legacy_staging_customers_company_payload_hash_key
  on public.legacy_staging_customers (company_id, legacy_source, payload_hash);

create index if not exists legacy_staging_customers_identity_idx
  on public.legacy_staging_customers (company_id, identity_no)
  where identity_no is not null;

create index if not exists legacy_staging_customers_company_registration_idx
  on public.legacy_staging_customers (company_id, company_registration_no)
  where company_registration_no is not null;

comment on table public.legacy_staging_customers is
  'Raw legacy fookloi.net customer records staged for historical backfill and reconciliation.';

create table if not exists public.legacy_staging_sales_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  legacy_source text not null default 'fookloi.net',
  legacy_invoice_id text,
  invoice_no text,
  dms_so_no text,
  chassis_no text,
  vin text,
  branch_code text,
  customer_identity_no text,
  customer_name text,
  invoice_date date,
  invoice_amount numeric(14, 2),
  paid_amount numeric(14, 2),
  outstanding_amount numeric(14, 2),
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  canonical_invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists legacy_staging_sales_invoices_company_legacy_id_key
  on public.legacy_staging_sales_invoices (company_id, legacy_source, legacy_invoice_id)
  where legacy_invoice_id is not null;

create unique index if not exists legacy_staging_sales_invoices_company_payload_hash_key
  on public.legacy_staging_sales_invoices (company_id, legacy_source, payload_hash);

create index if not exists legacy_staging_sales_invoices_invoice_no_idx
  on public.legacy_staging_sales_invoices (company_id, invoice_no)
  where invoice_no is not null;

create index if not exists legacy_staging_sales_invoices_so_no_idx
  on public.legacy_staging_sales_invoices (company_id, dms_so_no)
  where dms_so_no is not null;

create index if not exists legacy_staging_sales_invoices_chassis_idx
  on public.legacy_staging_sales_invoices (company_id, chassis_no)
  where chassis_no is not null;

comment on table public.legacy_staging_sales_invoices is
  'Raw legacy fookloi.net sales invoice evidence staged before finance-grade canonical writes.';

create table if not exists public.legacy_staging_records (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  legacy_source text not null default 'fookloi.net',
  record_type text not null check (record_type in (
    'purchase_invoice', 'dealer_invoice', 'staff', 'branch', 'advisor',
    'bank', 'supplier', 'dealer', 'model', 'color', 'finance_company', 'payment_type'
  )),
  legacy_record_id text,
  document_no text,
  branch_code text,
  reference_code text,
  reference_label text,
  fetched_at timestamptz not null default now(),
  payload_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists legacy_staging_records_company_legacy_id_key
  on public.legacy_staging_records (company_id, legacy_source, record_type, legacy_record_id)
  where legacy_record_id is not null;

create unique index if not exists legacy_staging_records_company_payload_hash_key
  on public.legacy_staging_records (company_id, legacy_source, payload_hash);

create index if not exists legacy_staging_records_company_type_code_idx
  on public.legacy_staging_records (company_id, record_type, reference_code);

create index if not exists legacy_staging_records_company_document_idx
  on public.legacy_staging_records (company_id, record_type, document_no)
  where document_no is not null;

comment on table public.legacy_staging_records is
  'Generic raw legacy fookloi.net staging for reference data and non-sales-invoice evidence before canonical writes.';

create table if not exists public.source_reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  object_type text not null check (object_type in ('sales_order', 'vehicle', 'customer', 'invoice_payment_evidence')),
  source_system text not null check (source_system in ('dms', 'legacy_fookloi', 'google_sheets', 'ubs')),
  source_table text not null,
  source_record_id uuid not null,
  canonical_table text,
  canonical_record_id uuid,
  match_status text not null default 'candidate'
    check (match_status in ('candidate', 'auto_matched', 'accepted', 'conflict', 'ignored', 'rejected')),
  confidence_score numeric(5, 4) check (confidence_score is null or confidence_score between 0 and 1),
  match_rule text,
  match_basis jsonb not null default '{}'::jsonb,
  conflict_payload jsonb not null default '{}'::jsonb,
  source_priority integer not null default 100,
  review_owner uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, object_type, source_system, source_table, source_record_id, canonical_table, canonical_record_id)
);

create index if not exists source_reconciliation_matches_company_status_idx
  on public.source_reconciliation_matches (company_id, object_type, match_status, source_priority);

create index if not exists source_reconciliation_matches_source_idx
  on public.source_reconciliation_matches (source_system, source_table, source_record_id);

comment on table public.source_reconciliation_matches is
  'Deterministic and reviewed match decisions between source staging records and canonical UBS records.';

create table if not exists public.source_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  match_id uuid not null references public.source_reconciliation_matches(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'auto_matched', 'accepted', 'conflict', 'ignored', 'rejected', 'note_added')),
  event_payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists source_reconciliation_events_company_match_idx
  on public.source_reconciliation_events (company_id, match_id, created_at desc);

comment on table public.source_reconciliation_events is
  'Append-only audit trail for source reconciliation status changes and review notes.';

create or replace function public.seed_source_reconciliation_candidates(
  p_company_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company_id text;
  v_dms_orders integer := 0;
  v_dms_vehicles integer := 0;
  v_legacy_customers integer := 0;
  v_legacy_invoices integer := 0;
begin
  v_company_id := coalesce(p_company_id, public.current_company_id());

  if v_company_id is null or not public.is_same_company(v_company_id) then
    raise exception 'Cannot seed reconciliation candidates outside caller company scope';
  end if;

  insert into public.source_reconciliation_matches (
    company_id,
    object_type,
    source_system,
    source_table,
    source_record_id,
    canonical_table,
    canonical_record_id,
    match_status,
    confidence_score,
    match_rule,
    match_basis,
    source_priority
  )
  select
    raw.company_id,
    'sales_order',
    'dms',
    'dms_raw_sales_orders',
    raw.id,
    'sales_orders',
    so.id,
    'candidate',
    0.8500,
    'dms_so_no_to_sales_order_vso_no',
    jsonb_build_object('dms_so_no', raw.dms_so_no, 'vso_no', so.vso_no),
    10
  from public.dms_raw_sales_orders raw
  join public.sales_orders so
    on so.company_id = raw.company_id
   and nullif(btrim(raw.dms_so_no), '') is not null
   and lower(btrim(so.vso_no)) = lower(btrim(raw.dms_so_no))
  where raw.company_id = v_company_id
  on conflict do nothing;

  get diagnostics v_dms_orders = row_count;

  insert into public.source_reconciliation_matches (
    company_id,
    object_type,
    source_system,
    source_table,
    source_record_id,
    canonical_table,
    canonical_record_id,
    match_status,
    confidence_score,
    match_rule,
    match_basis,
    source_priority
  )
  select
    raw.company_id,
    'vehicle',
    'dms',
    'dms_raw_vehicle_stock',
    raw.id,
    'vehicles',
    v.id,
    'candidate',
    0.9800,
    'dms_chassis_no_to_vehicle_chassis_no',
    jsonb_build_object('chassis_no', raw.chassis_no, 'vin', raw.vin),
    10
  from public.dms_raw_vehicle_stock raw
  join public.vehicles v
    on v.company_id = raw.company_id
   and nullif(btrim(raw.chassis_no), '') is not null
   and lower(btrim(v.chassis_no)) = lower(btrim(raw.chassis_no))
  where raw.company_id = v_company_id
  on conflict do nothing;

  get diagnostics v_dms_vehicles = row_count;

  insert into public.source_reconciliation_matches (
    company_id,
    object_type,
    source_system,
    source_table,
    source_record_id,
    canonical_table,
    canonical_record_id,
    match_status,
    confidence_score,
    match_rule,
    match_basis,
    source_priority
  )
  select
    raw.company_id,
    'customer',
    'legacy_fookloi',
    'legacy_staging_customers',
    raw.id,
    'customers',
    c.id,
    'candidate',
    0.9200,
    'legacy_identity_no_to_customer_ic_no',
    jsonb_build_object('identity_no', raw.identity_no, 'ic_no', c.ic_no),
    30
  from public.legacy_staging_customers raw
  join public.customers c
    on c.company_id = raw.company_id
   and nullif(btrim(raw.identity_no), '') is not null
   and lower(btrim(c.ic_no)) = lower(btrim(raw.identity_no))
  where raw.company_id = v_company_id
  on conflict do nothing;

  get diagnostics v_legacy_customers = row_count;

  insert into public.source_reconciliation_matches (
    company_id,
    object_type,
    source_system,
    source_table,
    source_record_id,
    canonical_table,
    canonical_record_id,
    match_status,
    confidence_score,
    match_rule,
    match_basis,
    source_priority
  )
  select
    raw.company_id,
    'invoice_payment_evidence',
    'legacy_fookloi',
    'legacy_staging_sales_invoices',
    raw.id,
    'invoices',
    inv.id,
    'candidate',
    0.9500,
    'legacy_invoice_no_to_invoice_no',
    jsonb_build_object('invoice_no', raw.invoice_no, 'amount', raw.invoice_amount),
    30
  from public.legacy_staging_sales_invoices raw
  join public.invoices inv
    on inv.company_id = raw.company_id
   and nullif(btrim(raw.invoice_no), '') is not null
   and lower(btrim(inv.invoice_no)) = lower(btrim(raw.invoice_no))
  where raw.company_id = v_company_id
  on conflict do nothing;

  get diagnostics v_legacy_invoices = row_count;

  return jsonb_build_object(
    'dms_sales_order_candidates', v_dms_orders,
    'dms_vehicle_candidates', v_dms_vehicles,
    'legacy_customer_candidates', v_legacy_customers,
    'legacy_invoice_candidates', v_legacy_invoices
  );
end;
$$;

revoke all on function public.seed_source_reconciliation_candidates(text) from public;
grant execute on function public.seed_source_reconciliation_candidates(text) to authenticated;

comment on function public.seed_source_reconciliation_candidates(text) is
  'Seeds same-company reconciliation candidates from deterministic DMS/legacy keys without updating canonical UBS records.';

create or replace function public.phase5_source_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_runs_touch_updated_at on public.sync_runs;
create trigger sync_runs_touch_updated_at
  before update on public.sync_runs
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists dms_raw_sales_orders_touch_updated_at on public.dms_raw_sales_orders;
create trigger dms_raw_sales_orders_touch_updated_at
  before update on public.dms_raw_sales_orders
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists dms_raw_vehicle_stock_touch_updated_at on public.dms_raw_vehicle_stock;
create trigger dms_raw_vehicle_stock_touch_updated_at
  before update on public.dms_raw_vehicle_stock
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists dms_raw_collections_touch_updated_at on public.dms_raw_collections;
create trigger dms_raw_collections_touch_updated_at
  before update on public.dms_raw_collections
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists dms_raw_order_vehicle_matches_touch_updated_at on public.dms_raw_order_vehicle_matches;
create trigger dms_raw_order_vehicle_matches_touch_updated_at
  before update on public.dms_raw_order_vehicle_matches
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists dms_raw_deliveries_touch_updated_at on public.dms_raw_deliveries;
create trigger dms_raw_deliveries_touch_updated_at
  before update on public.dms_raw_deliveries
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists dms_raw_leads_touch_updated_at on public.dms_raw_leads;
create trigger dms_raw_leads_touch_updated_at
  before update on public.dms_raw_leads
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists dms_raw_prospects_touch_updated_at on public.dms_raw_prospects;
create trigger dms_raw_prospects_touch_updated_at
  before update on public.dms_raw_prospects
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists dms_raw_soa_snapshots_touch_updated_at on public.dms_raw_soa_snapshots;
create trigger dms_raw_soa_snapshots_touch_updated_at
  before update on public.dms_raw_soa_snapshots
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists dms_raw_master_data_touch_updated_at on public.dms_raw_master_data;
create trigger dms_raw_master_data_touch_updated_at
  before update on public.dms_raw_master_data
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists legacy_staging_customers_touch_updated_at on public.legacy_staging_customers;
create trigger legacy_staging_customers_touch_updated_at
  before update on public.legacy_staging_customers
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists legacy_staging_sales_invoices_touch_updated_at on public.legacy_staging_sales_invoices;
create trigger legacy_staging_sales_invoices_touch_updated_at
  before update on public.legacy_staging_sales_invoices
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists legacy_staging_records_touch_updated_at on public.legacy_staging_records;
create trigger legacy_staging_records_touch_updated_at
  before update on public.legacy_staging_records
  for each row execute function public.phase5_source_touch_updated_at();

drop trigger if exists source_reconciliation_matches_touch_updated_at on public.source_reconciliation_matches;
create trigger source_reconciliation_matches_touch_updated_at
  before update on public.source_reconciliation_matches
  for each row execute function public.phase5_source_touch_updated_at();

alter table public.sync_runs enable row level security;
alter table public.dms_raw_sales_orders enable row level security;
alter table public.dms_raw_vehicle_stock enable row level security;
alter table public.dms_raw_collections enable row level security;
alter table public.dms_raw_order_vehicle_matches enable row level security;
alter table public.dms_raw_deliveries enable row level security;
alter table public.dms_raw_leads enable row level security;
alter table public.dms_raw_prospects enable row level security;
alter table public.dms_raw_soa_snapshots enable row level security;
alter table public.dms_raw_master_data enable row level security;
alter table public.legacy_staging_customers enable row level security;
alter table public.legacy_staging_sales_invoices enable row level security;
alter table public.legacy_staging_records enable row level security;
alter table public.source_reconciliation_matches enable row level security;
alter table public.source_reconciliation_events enable row level security;

create policy sync_runs_tenant_select on public.sync_runs
  for select to authenticated
  using (public.is_same_company(company_id));

create policy dms_raw_sales_orders_tenant_select on public.dms_raw_sales_orders
  for select to authenticated
  using (public.is_same_company(company_id));

create policy dms_raw_vehicle_stock_tenant_select on public.dms_raw_vehicle_stock
  for select to authenticated
  using (public.is_same_company(company_id));

create policy dms_raw_collections_tenant_select on public.dms_raw_collections
  for select to authenticated
  using (public.is_same_company(company_id));

create policy dms_raw_order_vehicle_matches_tenant_select on public.dms_raw_order_vehicle_matches
  for select to authenticated
  using (public.is_same_company(company_id));

create policy dms_raw_deliveries_tenant_select on public.dms_raw_deliveries
  for select to authenticated
  using (public.is_same_company(company_id));

create policy dms_raw_leads_tenant_select on public.dms_raw_leads
  for select to authenticated
  using (public.is_same_company(company_id));

create policy dms_raw_prospects_tenant_select on public.dms_raw_prospects
  for select to authenticated
  using (public.is_same_company(company_id));

create policy dms_raw_soa_snapshots_tenant_select on public.dms_raw_soa_snapshots
  for select to authenticated
  using (public.is_same_company(company_id));

create policy dms_raw_master_data_tenant_select on public.dms_raw_master_data
  for select to authenticated
  using (public.is_same_company(company_id));

create policy legacy_staging_customers_tenant_select on public.legacy_staging_customers
  for select to authenticated
  using (public.is_same_company(company_id));

create policy legacy_staging_sales_invoices_tenant_select on public.legacy_staging_sales_invoices
  for select to authenticated
  using (public.is_same_company(company_id));

create policy legacy_staging_records_tenant_select on public.legacy_staging_records
  for select to authenticated
  using (public.is_same_company(company_id));

create policy source_reconciliation_matches_tenant_select on public.source_reconciliation_matches
  for select to authenticated
  using (public.is_same_company(company_id));

create policy source_reconciliation_matches_admin_manage on public.source_reconciliation_matches
  for all to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'director', 'general_manager')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'director', 'general_manager')
  );

create policy source_reconciliation_events_tenant_select on public.source_reconciliation_events
  for select to authenticated
  using (public.is_same_company(company_id));

create policy source_reconciliation_events_admin_insert on public.source_reconciliation_events
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'director', 'general_manager')
  );