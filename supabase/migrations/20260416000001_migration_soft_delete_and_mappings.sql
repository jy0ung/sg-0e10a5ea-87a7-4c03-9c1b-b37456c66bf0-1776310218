-- ============================================================
-- Migration: Soft-delete on vehicles + mapping admin tables
-- ============================================================

-- 1. Soft-delete columns on vehicles
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index for fast filtering of non-deleted vehicles
CREATE INDEX IF NOT EXISTS idx_vehicles_is_deleted ON vehicles (is_deleted);

-- 2. Branch Mappings table
CREATE TABLE IF NOT EXISTS branch_mappings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_value   text NOT NULL,
  canonical_code text NOT NULL,
  notes       text,
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (raw_value, company_id)
);

ALTER TABLE branch_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_mappings_select" ON branch_mappings
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "branch_mappings_insert" ON branch_mappings
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "branch_mappings_update" ON branch_mappings
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "branch_mappings_delete" ON branch_mappings
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager'))
  );

-- 3. Payment Method Mappings table
CREATE TABLE IF NOT EXISTS payment_method_mappings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_value       text NOT NULL,
  canonical_value text NOT NULL,
  notes           text,
  company_id      text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (raw_value, company_id)
);

ALTER TABLE payment_method_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_mappings_select" ON payment_method_mappings
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "payment_mappings_insert" ON payment_method_mappings
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "payment_mappings_update" ON payment_method_mappings
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "payment_mappings_delete" ON payment_method_mappings
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager'))
  );

-- 4. Seed default branch mappings for demo company
INSERT INTO branch_mappings (raw_value, canonical_code, notes, company_id)
SELECT raw_value, canonical_code, notes, id
FROM (VALUES
  ('KK',  'KK',  'Kota Kinabalu'),
  ('TWU', 'TWU', 'Tawau'),
  ('SDK', 'SDK', 'Sandakan'),
  ('LDU', 'LDU', 'Lahad Datu'),
  ('BTU', 'BTU', 'Bintulu'),
  ('MYY', 'MYY', 'Miri'),
  ('SBW', 'SBW', 'Sibu')
) AS v(raw_value, canonical_code, notes)
CROSS JOIN (SELECT id FROM companies LIMIT 1) AS c
ON CONFLICT (raw_value, company_id) DO NOTHING;

-- 5. Seed default payment method mappings
INSERT INTO payment_method_mappings (raw_value, canonical_value, notes, company_id)
SELECT raw_value, canonical_value, notes, id
FROM (VALUES
  ('CASH',       'Cash',       ''),
  ('LOAN',       'Loan',       ''),
  ('GOV',        'Government', ''),
  ('GOVERNMENT', 'Government', '')
) AS v(raw_value, canonical_value, notes)
CROSS JOIN (SELECT id FROM companies LIMIT 1) AS c
ON CONFLICT (raw_value, company_id) DO NOTHING;
