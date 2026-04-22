-- ============================================================
-- Workforce identity foundation
-- ============================================================
-- Goal:
--   1. Introduce a dedicated workforce master (`employees`)
--   2. Keep `profiles` as the auth/account-facing record
--   3. Add assignment-based module staffing so Sales Advisor and future
--      staff groups can be derived from HRMS instead of separate stores
--
-- This migration is additive. Existing code can keep reading `profiles`
-- until service-layer refactors are complete.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employees (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           text NOT NULL,
  branch_id            text,
  legacy_profile_id    uuid UNIQUE,
  manager_employee_id  uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  primary_role         text NOT NULL DEFAULT 'analyst',
  staff_code           text,
  name                 text NOT NULL,
  work_email           text,
  personal_email       text,
  ic_no                text,
  contact_no           text,
  join_date            date,
  resign_date          date,
  status               text NOT NULL DEFAULT 'active',
  department_id        uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  job_title_id         uuid REFERENCES public.job_titles(id) ON DELETE SET NULL,
  avatar_url           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_status_check
    CHECK (status IN ('active', 'inactive', 'resigned', 'pending')),
  CONSTRAINT employees_primary_role_check
    CHECK (primary_role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'sales', 'accounts', 'analyst', 'creator_updater')),
  CONSTRAINT employees_company_staff_code_key
    UNIQUE (company_id, staff_code)
);

CREATE INDEX IF NOT EXISTS idx_employees_company
  ON public.employees (company_id);

CREATE INDEX IF NOT EXISTS idx_employees_branch
  ON public.employees (branch_id);

CREATE INDEX IF NOT EXISTS idx_employees_manager
  ON public.employees (manager_employee_id);

CREATE INDEX IF NOT EXISTS idx_employees_department
  ON public.employees (department_id);

CREATE INDEX IF NOT EXISTS idx_employees_job_title
  ON public.employees (job_title_id);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_select ON public.employees;
DROP POLICY IF EXISTS employees_manage ON public.employees;

CREATE POLICY employees_select ON public.employees
  FOR SELECT
  USING (public.is_same_company(company_id));

CREATE POLICY employees_manage ON public.employees
  FOR ALL
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN (
      'super_admin', 'company_admin', 'general_manager', 'manager'
    )
  )
  WITH CHECK (
    public.is_same_company(company_id)
    AND public.current_role() IN (
      'super_admin', 'company_admin', 'general_manager', 'manager'
    )
  );

DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.employees IS
  'Canonical workforce master. Employee Directory should move here over time instead of storing workforce data directly on profiles.';

COMMENT ON COLUMN public.employees.primary_role IS
  'Transitional coarse role used by current UI surfaces while module-specific assignments are phased in.';

COMMENT ON COLUMN public.employees.legacy_profile_id IS
  'Temporary compatibility link used to backfill from the historical profiles-based employee model.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_id_unique
  ON public.profiles (employee_id)
  WHERE employee_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.employee_id IS
  'Optional link from a login/session account to the workforce master employee record.';

INSERT INTO public.employees (
  company_id,
  branch_id,
  legacy_profile_id,
  primary_role,
  staff_code,
  name,
  work_email,
  ic_no,
  contact_no,
  join_date,
  resign_date,
  status,
  department_id,
  job_title_id,
  avatar_url
)
SELECT
  p.company_id,
  p.branch_id,
  p.id,
  p.role,
  p.staff_code,
  p.name,
  p.email,
  p.ic_no,
  p.contact_no,
  p.join_date,
  p.resign_date,
  CASE
    WHEN p.status IN ('active', 'inactive', 'resigned', 'pending') THEN p.status
    ELSE 'active'
  END,
  p.department_id,
  p.job_title_id,
  p.avatar_url
FROM public.profiles p
WHERE p.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.legacy_profile_id = p.id
  );

UPDATE public.profiles p
SET employee_id = e.id
FROM public.employees e
WHERE e.legacy_profile_id = p.id
  AND p.employee_id IS DISTINCT FROM e.id;

UPDATE public.employees e
SET manager_employee_id = manager_e.id
FROM public.profiles p
LEFT JOIN public.employees manager_e
  ON manager_e.legacy_profile_id = p.manager_id
WHERE e.legacy_profile_id = p.id
  AND e.manager_employee_id IS DISTINCT FROM manager_e.id;

CREATE TABLE IF NOT EXISTS public.employee_module_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       text NOT NULL,
  employee_id      uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  module_key       text NOT NULL,
  assignment_role  text NOT NULL,
  is_primary       boolean NOT NULL DEFAULT false,
  active           boolean NOT NULL DEFAULT true,
  effective_from   date,
  effective_to     date,
  source           text NOT NULL DEFAULT 'manual',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_module_assignments_source_check
    CHECK (source IN ('manual', 'migration', 'sync')),
  CONSTRAINT employee_module_assignments_unique
    UNIQUE (employee_id, module_key, assignment_role)
);

CREATE INDEX IF NOT EXISTS idx_employee_module_assignments_company_module
  ON public.employee_module_assignments (company_id, module_key);

CREATE INDEX IF NOT EXISTS idx_employee_module_assignments_employee
  ON public.employee_module_assignments (employee_id);

ALTER TABLE public.employee_module_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_module_assignments_select ON public.employee_module_assignments;
DROP POLICY IF EXISTS employee_module_assignments_manage ON public.employee_module_assignments;

CREATE POLICY employee_module_assignments_select ON public.employee_module_assignments
  FOR SELECT
  USING (public.is_same_company(company_id));

CREATE POLICY employee_module_assignments_manage ON public.employee_module_assignments
  FOR ALL
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN (
      'super_admin', 'company_admin', 'general_manager', 'manager'
    )
  )
  WITH CHECK (
    public.is_same_company(company_id)
    AND public.current_role() IN (
      'super_admin', 'company_admin', 'general_manager', 'manager'
    )
  );

DROP TRIGGER IF EXISTS update_employee_module_assignments_updated_at ON public.employee_module_assignments;
CREATE TRIGGER update_employee_module_assignments_updated_at
  BEFORE UPDATE ON public.employee_module_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.employee_module_assignments IS
  'Assignment-based staffing model. Module-specific staff lists such as Sales Advisors should be derived from this table rather than separate user stores.';

INSERT INTO public.employee_module_assignments (
  company_id,
  employee_id,
  module_key,
  assignment_role,
  is_primary,
  source
)
SELECT
  e.company_id,
  e.id,
  'sales',
  'sales_advisor',
  true,
  'migration'
FROM public.employees e
JOIN public.profiles p
  ON p.id = e.legacy_profile_id
WHERE p.role = 'sales'
ON CONFLICT (employee_id, module_key, assignment_role) DO NOTHING;