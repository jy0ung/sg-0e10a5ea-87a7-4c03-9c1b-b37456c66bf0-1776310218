-- ============================================================
-- HRMS Admin Structures: Departments, Job Titles, Public Holidays
-- + FK columns on profiles
-- ============================================================

-- ─── Departments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        text NOT NULL,
  name              text NOT NULL,
  description       text,
  head_employee_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cost_centre       text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read departments" ON public.departments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin write departments" ON public.departments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','general_manager','manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','general_manager','manager')
  ));

CREATE INDEX IF NOT EXISTS idx_departments_company ON public.departments (company_id);

-- ─── Job Titles ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_titles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      text NOT NULL,
  name            text NOT NULL,
  department_id   uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  level           text CHECK (level IN ('junior','mid','senior','lead','executive')),
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read job_titles" ON public.job_titles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin write job_titles" ON public.job_titles
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','general_manager','manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','general_manager','manager')
  ));

CREATE INDEX IF NOT EXISTS idx_job_titles_company    ON public.job_titles (company_id);
CREATE INDEX IF NOT EXISTS idx_job_titles_department ON public.job_titles (department_id);

-- ─── Public / Company Holidays ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.public_holidays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   text NOT NULL,
  name         text NOT NULL,
  date         date NOT NULL,
  holiday_type text NOT NULL DEFAULT 'public'
                 CHECK (holiday_type IN ('public','company')),
  is_recurring boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, date, name)
);
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read public_holidays" ON public.public_holidays
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin write public_holidays" ON public.public_holidays
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','general_manager','manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','general_manager','manager')
  ));

CREATE INDEX IF NOT EXISTS idx_public_holidays_company ON public.public_holidays (company_id);
CREATE INDEX IF NOT EXISTS idx_public_holidays_date    ON public.public_holidays (date);

-- ─── Profile FK columns ──────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_title_id  uuid REFERENCES public.job_titles(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_department ON public.profiles (department_id);
CREATE INDEX IF NOT EXISTS idx_profiles_job_title  ON public.profiles (job_title_id);
