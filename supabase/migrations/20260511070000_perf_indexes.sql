-- P1.1: Missing performance indexes
--
-- Adds indexes on high-cardinality filter/sort columns that were absent and
-- would cause sequential scans at 20-50 concurrent writers.
--
-- All indexes are CONCURRENT-safe (CREATE INDEX IF NOT EXISTS) so they can be
-- re-applied to an already-migrated DB without error.

-- ── Tickets ──────────────────────────────────────────────────────────────────
-- Primary list query: WHERE company_id = ? AND category = ? ORDER BY created_at DESC
create index if not exists idx_tickets_company_category_created
  on public.tickets (company_id, category, created_at desc);

-- ── Import batches ────────────────────────────────────────────────────────────
-- Batch list & status checks: WHERE company_id = ? AND status = ?
create index if not exists idx_import_batches_company_status
  on public.import_batches (company_id, status);

-- ── Source reconciliation ─────────────────────────────────────────────────────
-- Matching queries: WHERE company_id = ? AND status = ?
create index if not exists idx_source_recon_matches_company
  on public.source_reconciliation_matches (company_id);

create index if not exists idx_source_recon_matches_company_status
  on public.source_reconciliation_matches (company_id, match_status);

-- ── Approval workflow ─────────────────────────────────────────────────────────
-- Step ordering: WHERE approval_request_id = ? ORDER BY step_order
-- entity_id + current_step_id covers approval inbox and workflow step queries
create index if not exists idx_approval_instances_entity_step
  on public.approval_instances (entity_id, current_step_id);

-- ── Sales orders ──────────────────────────────────────────────────────────────
-- Pipeline filter: WHERE company_id = ? AND stage_id = ?
-- (sales_orders_company_vehicle_id_idx already covers company+vehicle)
create index if not exists idx_sales_orders_company_stage
  on public.sales_orders (company_id, stage_id);

-- Booking date range: WHERE company_id = ? AND booking_date BETWEEN ? AND ?
create index if not exists idx_sales_orders_company_booking_date
  on public.sales_orders (company_id, booking_date desc);

-- ── Vehicles ──────────────────────────────────────────────────────────────────
-- auto_aging_report ORDER BY bg_date DESC within company
create index if not exists idx_vehicles_company_bg_date
  on public.vehicles (company_id, bg_date desc);

-- ── Invoices ─────────────────────────────────────────────────────────────────
-- Outstanding AR filter: WHERE company_id = ? AND payment_status = ?
create index if not exists idx_invoices_company_payment_status
  on public.invoices (company_id, payment_status);

-- Invoice date range for dashboard summaries
create index if not exists idx_invoices_company_invoice_date
  on public.invoices (company_id, invoice_date desc);

-- ── Audit logs ────────────────────────────────────────────────────────────────
-- Entity history: WHERE table_name = ? AND entity_id = ? ORDER BY created_at
create index if not exists idx_audit_logs_table_entity
  on public.audit_logs (table_name, entity_id, created_at desc);

-- ── Commission records ────────────────────────────────────────────────────────
-- Period + company filter for dashboard
create index if not exists idx_commission_records_company_period
  on public.commission_records (company_id, period, status);
