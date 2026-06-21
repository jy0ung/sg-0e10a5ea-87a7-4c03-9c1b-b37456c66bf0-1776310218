CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id),
  branch_id TEXT REFERENCES branches(id),
  deal_no TEXT NOT NULL,
  vso_no TEXT,
  stage TEXT NOT NULL DEFAULT 'lead',
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stage_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stage_updated_by UUID REFERENCES profiles(id),
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_ic TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  model_id UUID REFERENCES vehicle_models(id),
  model_name TEXT,
  variant TEXT,
  colour TEXT,
  chassis_no TEXT,
  selling_price NUMERIC(12,2),
  deposit_amount NUMERIC(12,2),
  deposit_date DATE,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  accessories_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2),
  sales_advisor_id UUID REFERENCES profiles(id),
  sales_advisor_name TEXT,
  lead_source TEXT,
  lead_source_detail TEXT,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(deal_no, company_id),
  CHECK(stage IN ('lead','prospect','booking','loan_submission','lou','shipment','receive','registration','delivery','disbursement','completed'))
);
CREATE INDEX idx_deals_stage ON deals(stage, company_id);
CREATE INDEX idx_deals_branch_stage ON deals(branch_id, stage, company_id);
CREATE INDEX idx_deals_advisor ON deals(sales_advisor_id, company_id);
CREATE INDEX idx_deals_created ON deals(created_at DESC, company_id);
CREATE INDEX idx_deals_completed ON deals(completed_at DESC, company_id) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_deals_customer ON deals(customer_id, company_id);
CREATE TABLE deal_loan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  bank_id UUID REFERENCES banks(id),
  bank_name TEXT,
  loan_type TEXT,
  loan_amount NUMERIC(12,2),
  loan_tenure_months INT,
  monthly_installment NUMERIC(12,2),
  interest_rate NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  lou_received_at TIMESTAMPTZ,
  lou_verified_at TIMESTAMPTZ,
  disbursed_at TIMESTAMPTZ,
  loan_form_url TEXT,
  lou_url TEXT,
  approval_letter_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(status IN ('pending','submitted','approved','rejected','lou_issued','lou_verified','disbursed'))
);
CREATE INDEX idx_deal_loan_deal ON deal_loan(deal_id);
CREATE INDEX idx_deal_loan_status ON deal_loan(status, company_id);
CREATE INDEX idx_deal_loan_bank ON deal_loan(bank_id, company_id);

CREATE TABLE deal_insurance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  insurer_id UUID REFERENCES insurance_companies(id),
  insurer_name TEXT,
  policy_no TEXT,
  cover_note_no TEXT,
  premium NUMERIC(12,2),
  coverage_type TEXT,
  start_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  cover_note_issued_at TIMESTAMPTZ,
  policy_issued_at TIMESTAMPTZ,
  cover_note_url TEXT,
  policy_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(status IN ('pending','cover_note_issued','policy_active','expired'))
);
CREATE INDEX idx_deal_insurance_deal ON deal_insurance(deal_id);

CREATE TABLE deal_registration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  jpj_ref TEXT,
  plate_no TEXT,
  registration_date DATE,
  road_tax_expiry DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,
  plate_received_at TIMESTAMPTZ,
  registration_doc_url TEXT,
  road_tax_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(status IN ('pending','submitted','registered','plate_received'))
);
CREATE INDEX idx_deal_registration_deal ON deal_registration(deal_id);

CREATE TABLE deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  actor_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deal_activities_deal ON deal_activities(deal_id, created_at DESC);
CREATE INDEX idx_deal_activities_action ON deal_activities(action, created_at DESC, company_id);
CREATE INDEX idx_deal_activities_actor ON deal_activities(actor_id, created_at DESC);

CREATE TABLE deal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  doc_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deal_documents_deal ON deal_documents(deal_id);
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY deals_select ON deals FOR SELECT USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global'));
CREATE POLICY deals_insert ON deals FOR INSERT WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY deals_update ON deals FOR UPDATE USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY deals_delete ON deals FOR DELETE USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin')));

ALTER TABLE deal_loan ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_loan_select ON deal_loan FOR SELECT USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global'));
CREATE POLICY deal_loan_insert ON deal_loan FOR INSERT WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY deal_loan_update ON deal_loan FOR UPDATE USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

ALTER TABLE deal_insurance ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_insurance_select ON deal_insurance FOR SELECT USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global'));
CREATE POLICY deal_insurance_insert ON deal_insurance FOR INSERT WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY deal_insurance_update ON deal_insurance FOR UPDATE USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

ALTER TABLE deal_registration ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_registration_select ON deal_registration FOR SELECT USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global'));
CREATE POLICY deal_registration_insert ON deal_registration FOR INSERT WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY deal_registration_update ON deal_registration FOR UPDATE USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_activities_select ON deal_activities FOR SELECT USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global'));
CREATE POLICY deal_activities_insert ON deal_activities FOR INSERT WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) AND actor_id = auth.uid());

ALTER TABLE deal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_documents_select ON deal_documents FOR SELECT USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global'));
CREATE POLICY deal_documents_insert ON deal_documents FOR INSERT WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) AND uploaded_by = auth.uid());
CREATE OR REPLACE FUNCTION generate_deal_no(p_company_id TEXT, p_branch_id TEXT)
RETURNS TEXT AS $$
DECLARE
  branch_code TEXT;
  year_part TEXT;
  month_part TEXT;
  seq_num INT;
  deal_no TEXT;
BEGIN
  SELECT code INTO branch_code FROM branches WHERE id = p_branch_id;
  IF branch_code IS NULL THEN branch_code := 'GEN'; END IF;
  year_part := TO_CHAR(now(), 'YY');
  month_part := TO_CHAR(now(), 'MM');
  SELECT COALESCE(MAX(CAST(SPLIT_PART(deal_no, '/', 5) AS INT)), 0) + 1
  INTO seq_num FROM deals
  WHERE company_id = p_company_id AND branch_id = p_branch_id
    AND deal_no LIKE 'DEAL/' || branch_code || '/' || year_part || '/' || month_part || '/%';
  deal_no := 'DEAL/' || branch_code || '/' || year_part || '/' || month_part || '/' || LPAD(seq_num::TEXT, 3, '0');
  RETURN deal_no;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_deal_stage_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    NEW.stage_entered_at := now();
    NEW.stage_updated_at := now();
    IF NEW.stage = 'completed' AND OLD.stage != 'completed' THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deal_stage_timestamps BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_deal_stage_timestamps();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deal_loan_updated_at BEFORE UPDATE ON deal_loan FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_deal_insurance_updated_at BEFORE UPDATE ON deal_insurance FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_deal_registration_updated_at BEFORE UPDATE ON deal_registration FOR EACH ROW EXECUTE FUNCTION update_updated_at();
