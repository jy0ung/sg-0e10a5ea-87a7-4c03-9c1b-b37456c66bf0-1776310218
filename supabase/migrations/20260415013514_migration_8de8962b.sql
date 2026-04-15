-- 1. COMPANIES TABLE
CREATE TABLE IF NOT EXISTS public.companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "companies_select_all" ON public.companies;
CREATE POLICY "companies_select_all" ON public.companies FOR SELECT USING (true);

-- 2. BRANCHES TABLE
CREATE TABLE IF NOT EXISTS public.branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, code)
);
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branches_select_all" ON public.branches;
CREATE POLICY "branches_select_all" ON public.branches FOR SELECT USING (true);

-- 3. PROFILES TABLE (ALTER existing)
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='profiles' and column_name='full_name') THEN
    ALTER TABLE public.profiles RENAME COLUMN full_name TO name;
  END IF;
END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'analyst';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_scope TEXT DEFAULT 'company';

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, access_scope)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'analyst'),
    COALESCE(NEW.raw_user_meta_data->>'access_scope', 'company')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, email, name, role, access_scope)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'name', u.email),
  COALESCE(u.raw_user_meta_data->>'role', 'analyst'),
  COALESCE(u.raw_user_meta_data->>'access_scope', 'company')
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- 4. IMPORT BATCHES TABLE
CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'uploaded',
  total_rows INTEGER DEFAULT 0,
  valid_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  duplicate_rows INTEGER DEFAULT 0,
  published_at TIMESTAMP WITH TIME ZONE,
  company_id TEXT REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_batches_select_all" ON public.import_batches;
CREATE POLICY "import_batches_select_all" ON public.import_batches FOR SELECT USING (true);
DROP POLICY IF EXISTS "import_batches_insert_auth" ON public.import_batches;
CREATE POLICY "import_batches_insert_auth" ON public.import_batches FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "import_batches_update_auth" ON public.import_batches;
CREATE POLICY "import_batches_update_auth" ON public.import_batches FOR UPDATE USING (true);

-- 5. VEHICLES TABLE
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chassis_no TEXT NOT NULL,
  bg_date DATE,
  shipment_etd_pkg DATE,
  shipment_eta_kk_twu_sdk DATE,
  date_received_by_outlet DATE,
  reg_date DATE,
  delivery_date DATE,
  disb_date DATE,
  branch_code TEXT NOT NULL,
  model TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  salesman_name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  remark TEXT,
  vaa_date DATE,
  full_payment_date DATE,
  is_d2d BOOLEAN DEFAULT false,
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  source_row_id TEXT,
  variant TEXT,
  dealer_transfer_price TEXT,
  full_payment_type TEXT,
  shipment_name TEXT,
  lou TEXT,
  contra_sola TEXT,
  reg_no TEXT,
  invoice_no TEXT,
  obr TEXT,
  bg_to_delivery INTEGER,
  bg_to_shipment_etd INTEGER,
  etd_to_outlet INTEGER,
  outlet_to_reg INTEGER,
  reg_to_delivery INTEGER,
  bg_to_disb INTEGER,
  delivery_to_disb INTEGER,
  company_id TEXT REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(chassis_no, company_id)
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicles_select_all" ON public.vehicles;
CREATE POLICY "vehicles_select_all" ON public.vehicles FOR SELECT USING (true);
DROP POLICY IF EXISTS "vehicles_insert_auth" ON public.vehicles;
CREATE POLICY "vehicles_insert_auth" ON public.vehicles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "vehicles_update_auth" ON public.vehicles;
CREATE POLICY "vehicles_update_auth" ON public.vehicles FOR UPDATE USING (true);

-- 6. QUALITY ISSUES TABLE
CREATE TABLE IF NOT EXISTS public.quality_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chassis_no TEXT NOT NULL,
  field TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.quality_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quality_issues_select_all" ON public.quality_issues;
CREATE POLICY "quality_issues_select_all" ON public.quality_issues FOR SELECT USING (true);
DROP POLICY IF EXISTS "quality_issues_insert_auth" ON public.quality_issues;
CREATE POLICY "quality_issues_insert_auth" ON public.quality_issues FOR INSERT WITH CHECK (true);

-- 7. SLA POLICIES TABLE
CREATE TABLE IF NOT EXISTS public.sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id TEXT NOT NULL,
  label TEXT NOT NULL,
  sla_days INTEGER NOT NULL DEFAULT 30,
  company_id TEXT REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(kpi_id, company_id)
);
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sla_policies_select_all" ON public.sla_policies;
CREATE POLICY "sla_policies_select_all" ON public.sla_policies FOR SELECT USING (true);
DROP POLICY IF EXISTS "sla_policies_update_auth" ON public.sla_policies;
CREATE POLICY "sla_policies_update_auth" ON public.sla_policies FOR UPDATE USING (true);
DROP POLICY IF EXISTS "sla_policies_insert_auth" ON public.sla_policies;
CREATE POLICY "sla_policies_insert_auth" ON public.sla_policies FOR INSERT WITH CHECK (true);

-- 8. SEED DEFAULT DATA
INSERT INTO public.companies (id, name, code)
VALUES ('c1', 'Demo Company', 'DEMO')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.branches (id, name, code, company_id)
VALUES 
  ('b1', 'Kuching Branch', 'KCH', 'c1'),
  ('b2', 'Sibu Branch', 'SBU', 'c1'),
  ('b3', 'Miri Branch', 'MRI', 'c1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sla_policies (kpi_id, label, sla_days, company_id)
VALUES
  ('bg_to_delivery', 'BG to Delivery', 90, 'c1'),
  ('bg_to_shipment_etd', 'BG to Shipment ETD', 30, 'c1'),
  ('etd_to_outlet', 'ETD to Outlet Received', 21, 'c1'),
  ('outlet_to_reg', 'Outlet to Registration', 14, 'c1'),
  ('reg_to_delivery', 'Registration to Delivery', 7, 'c1'),
  ('bg_to_disb', 'BG to Disbursement', 120, 'c1'),
  ('delivery_to_disb', 'Delivery to Disbursement', 30, 'c1')
ON CONFLICT (kpi_id, company_id) DO NOTHING;