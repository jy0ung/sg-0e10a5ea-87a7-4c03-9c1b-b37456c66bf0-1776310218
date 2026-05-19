-- Sales Advisors table
-- Stores sales advisor / salesman records extracted from legacy fookloi.net system.
-- Scoped to company_id for multi-tenant isolation.

CREATE TABLE IF NOT EXISTS public.sales_advisors (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   text        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  legacy_id    text,                         -- original ID from fookloi
  code         text,                         -- e.g. KUSD01
  name         text        NOT NULL,
  ic_no        text,
  email        text,
  contact_no   text,
  join_date    date,
  resign_date  date,
  description  text,
  status       text        NOT NULL DEFAULT 'Active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sales_advisors_code_company_uq UNIQUE (code, company_id)
);

ALTER TABLE public.sales_advisors ENABLE ROW LEVEL SECURITY;

-- Company-scoped read access for authenticated users
CREATE POLICY "sales_advisors_select" ON public.sales_advisors
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Managers and above can insert/update/delete
CREATE POLICY "sales_advisors_write" ON public.sales_advisors
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','manager','finance_manager','accountant')
    )
  );

-- Updated-at trigger
CREATE TRIGGER sales_advisors_updated_at
  BEFORE UPDATE ON public.sales_advisors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
