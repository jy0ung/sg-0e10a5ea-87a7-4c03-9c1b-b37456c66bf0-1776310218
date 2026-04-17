-- Phase 2: Add soft-delete columns to sales_orders, customers, purchase_invoices
-- Matches the pattern already used on the vehicles table (is_deleted + deleted_at).

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS is_deleted  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_deleted  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS is_deleted  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

-- Partial indexes for fast "active records" queries
CREATE INDEX IF NOT EXISTS idx_sales_orders_active    ON sales_orders    (company_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_customers_active       ON customers       (company_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_active ON purchase_invoices (company_id) WHERE is_deleted = false;
