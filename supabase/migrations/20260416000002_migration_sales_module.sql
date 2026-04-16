-- ============================================================
-- Migration: Sales Module schema
-- ============================================================

-- 1. Customers (CRM-lite)
CREATE TABLE IF NOT EXISTS customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  ic_no       text,
  phone       text,
  email       text,
  address     text,
  notes       text,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select" ON customers
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "customers_insert" ON customers
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "customers_update" ON customers
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "customers_delete" ON customers
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager','manager'))
  );

-- 2. Deal Stages
CREATE TABLE IF NOT EXISTS deal_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  stage_order integer NOT NULL DEFAULT 0,
  color       text NOT NULL DEFAULT '#6b7280',
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, company_id)
);

ALTER TABLE deal_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deal_stages_select" ON deal_stages
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "deal_stages_insert" ON deal_stages
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager'))
  );

CREATE POLICY "deal_stages_update" ON deal_stages
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager'))
  );

-- 3. Sales Orders
CREATE TABLE IF NOT EXISTS sales_orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             uuid REFERENCES customers(id) ON DELETE SET NULL,
  salesman_name           text NOT NULL,
  branch_code             text NOT NULL,
  model                   text NOT NULL,
  variant                 text,
  color                   text,
  booking_amount          numeric(12,2),
  discount                numeric(12,2) DEFAULT 0,
  selling_price           numeric(12,2),
  payment_method          text,
  stage_id                uuid REFERENCES deal_stages(id) ON DELETE SET NULL,
  booking_date            date NOT NULL,
  expected_delivery_date  date,
  notes                   text,
  chassis_no              text,                                -- linked to vehicles.chassis_no after BG entry created
  company_id              uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_orders_select" ON sales_orders
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "sales_orders_insert" ON sales_orders
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "sales_orders_update" ON sales_orders
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "sales_orders_delete" ON sales_orders
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager','manager'))
  );

-- Index for salesman performance queries
CREATE INDEX IF NOT EXISTS idx_sales_orders_salesman ON sales_orders (salesman_name, company_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_branch ON sales_orders (branch_code, company_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_booking_date ON sales_orders (booking_date);

-- 4. Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id  uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  invoice_no      text NOT NULL,
  invoice_date    date NOT NULL,
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount      numeric(12,2) NOT NULL DEFAULT 0,
  total_amount    numeric(12,2) NOT NULL DEFAULT 0,
  payment_status  text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  paid_amount     numeric(12,2) NOT NULL DEFAULT 0,
  due_date        date,
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_no, company_id)
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- 5. Salesman Targets
CREATE TABLE IF NOT EXISTS salesman_targets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesman_name   text NOT NULL,
  branch_code     text NOT NULL,
  period_year     integer NOT NULL,
  period_month    integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  target_units    integer NOT NULL DEFAULT 0,
  target_revenue  numeric(14,2) NOT NULL DEFAULT 0,
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salesman_name, branch_code, period_year, period_month, company_id)
);

ALTER TABLE salesman_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salesman_targets_select" ON salesman_targets
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "salesman_targets_insert" ON salesman_targets
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager','manager'))
  );

CREATE POLICY "salesman_targets_update" ON salesman_targets
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager','manager'))
  );

-- 6. Commission Rules
CREATE TABLE IF NOT EXISTS commission_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesman_name   text,                     -- null = applies to all salesmen in branch
  branch_code     text,                     -- null = applies to all branches
  rule_name       text NOT NULL,
  threshold_days  integer,                  -- for aging-based commission: deliver within N days
  amount          numeric(10,2) NOT NULL DEFAULT 0,
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission_rules_select" ON commission_rules
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "commission_rules_insert" ON commission_rules
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager'))
  );

CREATE POLICY "commission_rules_update" ON commission_rules
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager'))
  );

CREATE POLICY "commission_rules_delete" ON commission_rules
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director'))
  );

-- 7. Commission Records (computed outcomes per vehicle/salesman)
CREATE TABLE IF NOT EXISTS commission_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  chassis_no      text NOT NULL,
  salesman_name   text NOT NULL,
  rule_id         uuid REFERENCES commission_rules(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid')),
  amount          numeric(10,2) NOT NULL DEFAULT 0,
  period          text NOT NULL,             -- e.g. '2026-04'
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission_records_select" ON commission_records
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "commission_records_insert" ON commission_records
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "commission_records_update" ON commission_records
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager'))
  );

-- 8. Seed default deal stages for demo company
INSERT INTO deal_stages (name, stage_order, color, company_id)
SELECT name, stage_order, color, id
FROM (VALUES
  ('Enquiry',    1, '#94a3b8'),
  ('Test Drive', 2, '#60a5fa'),
  ('Booking',    3, '#a78bfa'),
  ('Negotiation',4, '#f59e0b'),
  ('Confirmed',  5, '#10b981'),
  ('Delivered',  6, '#22c55e'),
  ('Lost',       7, '#ef4444')
) AS v(name, stage_order, color)
CROSS JOIN (SELECT id FROM companies LIMIT 1) AS c
ON CONFLICT (name, company_id) DO NOTHING;
