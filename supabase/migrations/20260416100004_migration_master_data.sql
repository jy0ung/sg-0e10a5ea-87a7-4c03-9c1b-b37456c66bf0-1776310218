-- Phase 1D: Master data tables (finance companies, insurance companies, vehicle models, vehicle colours)

-- Finance companies
CREATE TABLE IF NOT EXISTS public.finance_companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, company_id)
);

ALTER TABLE public.finance_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read finance_companies"
  ON public.finance_companies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage finance_companies"
  ON public.finance_companies FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- Insurance companies
CREATE TABLE IF NOT EXISTS public.insurance_companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, company_id)
);

ALTER TABLE public.insurance_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read insurance_companies"
  ON public.insurance_companies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage insurance_companies"
  ON public.insurance_companies FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- Vehicle models
CREATE TABLE IF NOT EXISTS public.vehicle_models (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  base_price  numeric(15,2),
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, company_id)
);

ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vehicle_models"
  ON public.vehicle_models FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage vehicle_models"
  ON public.vehicle_models FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- Vehicle colours
CREATE TABLE IF NOT EXISTS public.vehicle_colours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  hex         text,
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, company_id)
);

ALTER TABLE public.vehicle_colours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vehicle_colours"
  ON public.vehicle_colours FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage vehicle_colours"
  ON public.vehicle_colours FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

-- Seed common finance companies
INSERT INTO public.finance_companies (code, name, company_id) VALUES
  ('MAY',  'Maybank Islamic Berhad',       'c1'),
  ('CIMB', 'CIMB Bank Berhad',             'c1'),
  ('RHB',  'RHB Bank Berhad',              'c1'),
  ('HLB',  'Hong Leong Bank Berhad',       'c1'),
  ('AMB',  'AmBank Islamic Berhad',        'c1'),
  ('BIMB', 'Bank Islam Malaysia Berhad',   'c1'),
  ('PBSM', 'Public Bank Berhad',           'c1'),
  ('AFIN', 'Affin Bank Berhad',            'c1')
ON CONFLICT (code, company_id) DO NOTHING;

-- Seed common insurance companies
INSERT INTO public.insurance_companies (code, name, company_id) VALUES
  ('AIA',  'AIA Berhad',                  'c1'),
  ('AXA',  'AXA Affin General Insurance', 'c1'),
  ('PRDN', 'Prudential Assurance',        'c1'),
  ('ALLN', 'Allianz General Insurance',   'c1'),
  ('ZNTH', 'Zurich Insurance Malaysia',   'c1'),
  ('MSIG', 'MSIG Insurance Malaysia',     'c1'),
  ('BIMB', 'Takaful Malaysia',            'c1'),
  ('PACA', 'Pacific & Orient Insurance',  'c1')
ON CONFLICT (code, company_id) DO NOTHING;
