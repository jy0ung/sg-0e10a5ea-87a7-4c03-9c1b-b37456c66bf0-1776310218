-- Phase 1C: Branches table
CREATE TABLE IF NOT EXISTS public.branches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  or_series   text,
  vdo_series  text,
  company_id  text NOT NULL DEFAULT 'c1',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, company_id)
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read branches"
  ON public.branches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage branches"
  ON public.branches FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'company_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'company_admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_branches_company_id ON public.branches (company_id);
CREATE INDEX IF NOT EXISTS idx_branches_code       ON public.branches (code);

-- Seed default branches from existing vehicle data
INSERT INTO public.branches (code, name, company_id) VALUES
  ('KK',  'Kota Kinabalu',  'c1'),
  ('TWU', 'Tawau',          'c1'),
  ('SDK', 'Sandakan',       'c1'),
  ('LDU', 'Lahad Datu',     'c1'),
  ('KUD', 'Kudat',          'c1'),
  ('LBN', 'Labuan',         'c1'),
  ('BTU', 'Beaufort',       'c1'),
  ('MYY', 'Miri',           'c1'),
  ('SBW', 'Sibu',           'c1')
ON CONFLICT (code, company_id) DO NOTHING;
