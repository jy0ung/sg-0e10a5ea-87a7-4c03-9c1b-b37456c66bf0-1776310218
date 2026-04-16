-- ============================================================
-- Migration: Phase 10 — remaining Proton CRM gap tables
-- ============================================================

-- Helper macro for standard admin-only RLS
-- Each table gets: authenticated SELECT, admin-only ALL

-- ── 1. TIN Types ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tin_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'Active',
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, company_id)
);
ALTER TABLE public.tin_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tin_types_read"   ON public.tin_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "tin_types_manage" ON public.tin_types FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- ── 2. Registration Fees ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.registration_fees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  price       numeric(15,2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'Active',
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.registration_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reg_fees_read"   ON public.registration_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY "reg_fees_manage" ON public.registration_fees FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- ── 3. Road Tax Fees ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.road_tax_fees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  price       numeric(15,2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'Active',
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.road_tax_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "road_tax_read"   ON public.road_tax_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY "road_tax_manage" ON public.road_tax_fees FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- ── 4. Inspection Fees ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inspection_fees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code   text,
  description text NOT NULL,
  price       numeric(15,2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'Active',
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inspection_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insp_fees_read"   ON public.inspection_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY "insp_fees_manage" ON public.inspection_fees FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- ── 5. Handling Fees ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.handling_fees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code   text,
  description text NOT NULL,
  price       numeric(15,2) NOT NULL DEFAULT 0,
  billing     text,
  status      text NOT NULL DEFAULT 'Active',
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.handling_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "handling_fees_read"   ON public.handling_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY "handling_fees_manage" ON public.handling_fees FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- ── 6. Additional Items (Other Products) ────────────────────
CREATE TABLE IF NOT EXISTS public.additional_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code   text,
  description text NOT NULL,
  unit_price  numeric(15,2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'Active',
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.additional_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "add_items_read"   ON public.additional_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "add_items_manage" ON public.additional_items FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- ── 7. Payment Types ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  billing     text,
  status      text NOT NULL DEFAULT 'Active',
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, company_id)
);
ALTER TABLE public.payment_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pay_types_read"   ON public.payment_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "pay_types_manage" ON public.payment_types FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- ── 8. Banks (Company Bank Info) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.banks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  account_no  text,
  status      text NOT NULL DEFAULT 'Active',
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "banks_read"   ON public.banks FOR SELECT TO authenticated USING (true);
CREATE POLICY "banks_manage" ON public.banks FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- ── 9. Suppliers ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  code                text,
  company_reg_no      text,
  company_address     text,
  mailing_address     text,
  attn                text,
  contact_no          text,
  email               text,
  status              text NOT NULL DEFAULT 'Active',
  company_id          text NOT NULL DEFAULT 'c1',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_read"   ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_manage" ON public.suppliers FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- ── 10. Dealers ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dealers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  acc_code            text,
  company_reg_no      text,
  company_address     text,
  mailing_address     text,
  attn                text,
  contact_no          text,
  email               text,
  status              text NOT NULL DEFAULT 'Active',
  company_id          text NOT NULL DEFAULT 'c1',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dealers_read"   ON public.dealers FOR SELECT TO authenticated USING (true);
CREATE POLICY "dealers_manage" ON public.dealers FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- ── 11. User Groups ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'Active',
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, company_id)
);
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_groups_read"   ON public.user_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_groups_manage" ON public.user_groups FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- ── 12. Dealer Invoices ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dealer_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no    text NOT NULL,
  branch        text,
  dealer_name   text,
  car_model     text,
  car_colour    text,
  chassis_no    text,
  sales_price   numeric(15,2),
  invoice_date  date,
  status        text NOT NULL DEFAULT 'Active',
  company_id    text NOT NULL DEFAULT 'c1',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dealer_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dealer_inv_read"   ON public.dealer_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "dealer_inv_manage" ON public.dealer_invoices FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager')));

-- ── 13. Official Receipts ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.official_receipts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_date    date,
  branch          text,
  receipt_no      text NOT NULL,
  amount          numeric(15,2),
  attachment_url  text,
  verified_by     text,
  status          text NOT NULL DEFAULT 'Pending',
  company_id      text NOT NULL DEFAULT 'c1',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_no, company_id)
);
ALTER TABLE public.official_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "or_read"   ON public.official_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "or_manage" ON public.official_receipts FOR ALL    TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager')));

-- ── Seed data ─────────────────────────────────────────────────

INSERT INTO public.tin_types (code, name, status, company_id) VALUES
  ('IND', 'Individual',   'Active', 'c1'),
  ('COM', 'Company',      'Active', 'c1'),
  ('GOV', 'Government',   'Active', 'c1'),
  ('OTH', 'Other',        'Active', 'c1')
ON CONFLICT (code, company_id) DO NOTHING;

INSERT INTO public.payment_types (name, billing, status, company_id) VALUES
  ('Cash',           'Yes', 'Active', 'c1'),
  ('Loan',           'No',  'Active', 'c1'),
  ('Government',     'No',  'Active', 'c1'),
  ('Trade-In',       'No',  'Active', 'c1')
ON CONFLICT (name, company_id) DO NOTHING;

INSERT INTO public.user_groups (name, status, company_id) VALUES
  ('Administrator',  'Active', 'c1'),
  ('Sales Advisor',  'Active', 'c1'),
  ('Manager',        'Active', 'c1'),
  ('Viewer',         'Active', 'c1')
ON CONFLICT (name, company_id) DO NOTHING;
