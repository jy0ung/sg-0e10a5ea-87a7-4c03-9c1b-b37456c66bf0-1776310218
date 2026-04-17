-- ============================================================
-- HRMS Full Module: Leave, Attendance, Payroll, Appraisals,
--                  Announcements
-- ============================================================

-- ─── Leave Types ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  text NOT NULL,
  name        text NOT NULL,                     -- e.g. "Annual Leave"
  code        text NOT NULL,                     -- e.g. "AL"
  days_per_year numeric(5,1) NOT NULL DEFAULT 14,
  is_paid     boolean NOT NULL DEFAULT true,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read leave_types"  ON public.leave_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager write leave_types" ON public.leave_types FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager')));

-- ─── Leave Balances ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type_id   uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year            int  NOT NULL,
  entitled_days   numeric(5,1) NOT NULL DEFAULT 0,
  used_days       numeric(5,1) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, leave_type_id, year)
);
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read leave_balances"  ON public.leave_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager write leave_balances" ON public.leave_balances FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager','manager')));

-- ─── Leave Requests ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      text NOT NULL,
  employee_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type_id   uuid NOT NULL REFERENCES public.leave_types(id),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  days            numeric(5,1) NOT NULL,
  reason          text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by     uuid REFERENCES public.profiles(id),
  reviewed_at     timestamptz,
  reviewer_note   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read leave_requests"  ON public.leave_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Employee insert leave_requests" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());
CREATE POLICY "Manager update leave_requests" ON public.leave_requests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager','manager')));
CREATE POLICY "Employee cancel leave_requests" ON public.leave_requests FOR DELETE TO authenticated
  USING (employee_id = auth.uid() AND status = 'pending');

CREATE INDEX IF NOT EXISTS idx_leave_requests_company   ON public.leave_requests (company_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee  ON public.leave_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status    ON public.leave_requests (status);

-- ─── Attendance Records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    text NOT NULL,
  employee_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date          date NOT NULL,
  clock_in      time,
  clock_out     time,
  hours_worked  numeric(4,2),
  status        text NOT NULL DEFAULT 'present'
                  CHECK (status IN ('present','absent','half_day','on_leave','public_holiday')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read attendance"   ON public.attendance_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager write attendance" ON public.attendance_records FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager','manager')));

CREATE INDEX IF NOT EXISTS idx_attendance_company  ON public.attendance_records (company_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON public.attendance_records (employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date     ON public.attendance_records (date);

-- ─── Payroll Runs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      text NOT NULL,
  period_year     int  NOT NULL,
  period_month    int  NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','finalised','paid')),
  total_headcount int  NOT NULL DEFAULT 0,
  total_gross     numeric(12,2) NOT NULL DEFAULT 0,
  total_net       numeric(12,2) NOT NULL DEFAULT 0,
  notes           text,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_year, period_month)
);
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read payroll_runs"  ON public.payroll_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager write payroll_runs" ON public.payroll_runs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager')));

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company ON public.payroll_runs (company_id);

-- ─── Payroll Items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id  uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  basic_salary    numeric(10,2) NOT NULL DEFAULT 0,
  allowances      numeric(10,2) NOT NULL DEFAULT 0,
  overtime        numeric(10,2) NOT NULL DEFAULT 0,
  gross_pay       numeric(10,2) GENERATED ALWAYS AS (basic_salary + allowances + overtime) STORED,
  epf_employee    numeric(10,2) NOT NULL DEFAULT 0,
  socso_employee  numeric(10,2) NOT NULL DEFAULT 0,
  income_tax      numeric(10,2) NOT NULL DEFAULT 0,
  other_deductions numeric(10,2) NOT NULL DEFAULT 0,
  total_deductions numeric(10,2) GENERATED ALWAYS AS (epf_employee + socso_employee + income_tax + other_deductions) STORED,
  net_pay         numeric(10,2) GENERATED ALWAYS AS (basic_salary + allowances + overtime - epf_employee - socso_employee - income_tax - other_deductions) STORED,
  epf_employer    numeric(10,2) NOT NULL DEFAULT 0,
  socso_employer  numeric(10,2) NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_id)
);
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read payroll_items"  ON public.payroll_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager write payroll_items" ON public.payroll_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager')));

CREATE INDEX IF NOT EXISTS idx_payroll_items_run      ON public.payroll_items (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee ON public.payroll_items (employee_id);

-- ─── Appraisals ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appraisals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  text NOT NULL,
  title       text NOT NULL,         -- e.g. "Annual Review 2025"
  cycle       text NOT NULL DEFAULT 'annual'
                CHECK (cycle IN ('annual','mid_year','quarterly','probation')),
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','in_progress','completed','archived')),
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.appraisals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read appraisals"  ON public.appraisals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager write appraisals" ON public.appraisals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager','manager')));

CREATE INDEX IF NOT EXISTS idx_appraisals_company ON public.appraisals (company_id);

-- ─── Appraisal Items ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appraisal_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appraisal_id    uuid NOT NULL REFERENCES public.appraisals(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_id     uuid REFERENCES public.profiles(id),
  rating          int CHECK (rating BETWEEN 1 AND 5),
  goals           text,
  achievements    text,
  areas_to_improve text,
  reviewer_comments text,
  employee_comments text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','self_reviewed','reviewed','acknowledged')),
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appraisal_id, employee_id)
);
ALTER TABLE public.appraisal_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read appraisal_items"  ON public.appraisal_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager write appraisal_items" ON public.appraisal_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager','manager')));

CREATE INDEX IF NOT EXISTS idx_appraisal_items_appraisal ON public.appraisal_items (appraisal_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_items_employee  ON public.appraisal_items (employee_id);

-- ─── Announcements ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  category    text NOT NULL DEFAULT 'general'
                CHECK (category IN ('general','policy','event','emergency','holiday')),
  priority    text NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low','normal','high','urgent')),
  pinned      boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  expires_at  timestamptz,
  author_id   uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read announcements"  ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager write announcements" ON public.announcements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','general_manager','manager')));

CREATE INDEX IF NOT EXISTS idx_announcements_company ON public.announcements (company_id);

-- Seed default leave types for existing company c1
INSERT INTO public.leave_types (id, company_id, name, code, days_per_year, is_paid) VALUES
  (gen_random_uuid(), 'c1', 'Annual Leave',        'AL',  14, true),
  (gen_random_uuid(), 'c1', 'Medical Leave',       'ML',  14, true),
  (gen_random_uuid(), 'c1', 'Emergency Leave',     'EL',   3, true),
  (gen_random_uuid(), 'c1', 'Maternity Leave',     'MAT', 60, true),
  (gen_random_uuid(), 'c1', 'Paternity Leave',     'PAT',  7, true),
  (gen_random_uuid(), 'c1', 'Unpaid Leave',        'UL',   0, false)
ON CONFLICT (company_id, code) DO NOTHING;
