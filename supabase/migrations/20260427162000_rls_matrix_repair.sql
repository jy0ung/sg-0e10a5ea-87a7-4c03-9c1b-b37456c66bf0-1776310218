-- ============================================================================
-- Phase 2 RLS matrix repair
-- ============================================================================
-- Forward-only repair for environments where older edited migrations were
-- already marked applied before the final Phase 0/2 table and trigger shape
-- landed. Keep this migration idempotent so it is safe on fresh databases too.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, company_id, access_scope, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'analyst',
    NULL,
    'self',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active','inactive','resigned','pending'));

ALTER TABLE public.profiles ALTER COLUMN company_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.role_sections (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  text        NOT NULL,
  role        text        NOT NULL,
  section     text        NOT NULL,
  allowed     boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, role, section)
);

CREATE INDEX IF NOT EXISTS idx_role_sections_company_role
  ON public.role_sections (company_id, role);

ALTER TABLE public.role_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_sections_select ON public.role_sections;
DROP POLICY IF EXISTS role_sections_manage ON public.role_sections;

CREATE POLICY role_sections_select ON public.role_sections
  FOR SELECT
  USING (public.is_same_company(company_id));

CREATE POLICY role_sections_manage ON public.role_sections
  FOR ALL
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin', 'company_admin', 'director', 'general_manager')
  )
  WITH CHECK (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin', 'company_admin', 'director', 'general_manager')
  );

CREATE OR REPLACE FUNCTION public.seed_role_sections_for_new_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mapping jsonb := jsonb_build_object(
    'super_admin', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'company_admin', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'director', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'general_manager', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'manager', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Reports','HRMS','Admin'),
    'sales', jsonb_build_array('Platform','Sales','Admin'),
    'accounts', jsonb_build_array('Platform','Sales','Purchasing','Reports','HRMS','Admin'),
    'analyst', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Reports','Admin'),
    'creator_updater', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Admin')
  );
  role_name text;
  section_name text;
BEGIN
  FOR role_name IN SELECT jsonb_object_keys(mapping) LOOP
    FOR section_name IN SELECT jsonb_array_elements_text(mapping -> role_name) LOOP
      INSERT INTO public.role_sections (company_id, role, section)
      VALUES (NEW.id, role_name, section_name)
      ON CONFLICT (company_id, role, section) DO NOTHING;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_role_sections ON public.companies;
CREATE TRIGGER trg_seed_role_sections
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_role_sections_for_new_company();

INSERT INTO public.role_sections (company_id, role, section)
SELECT c.id, defaults.role, defaults.section
FROM public.companies c
CROSS JOIN (VALUES
  ('super_admin', 'Platform'), ('super_admin', 'Auto Aging'), ('super_admin', 'Sales'), ('super_admin', 'Inventory'), ('super_admin', 'Purchasing'), ('super_admin', 'Reports'), ('super_admin', 'HRMS'), ('super_admin', 'Admin'),
  ('company_admin', 'Platform'), ('company_admin', 'Auto Aging'), ('company_admin', 'Sales'), ('company_admin', 'Inventory'), ('company_admin', 'Purchasing'), ('company_admin', 'Reports'), ('company_admin', 'HRMS'), ('company_admin', 'Admin'),
  ('director', 'Platform'), ('director', 'Auto Aging'), ('director', 'Sales'), ('director', 'Inventory'), ('director', 'Purchasing'), ('director', 'Reports'), ('director', 'HRMS'), ('director', 'Admin'),
  ('general_manager', 'Platform'), ('general_manager', 'Auto Aging'), ('general_manager', 'Sales'), ('general_manager', 'Inventory'), ('general_manager', 'Purchasing'), ('general_manager', 'Reports'), ('general_manager', 'HRMS'), ('general_manager', 'Admin'),
  ('manager', 'Platform'), ('manager', 'Auto Aging'), ('manager', 'Sales'), ('manager', 'Inventory'), ('manager', 'Reports'), ('manager', 'HRMS'), ('manager', 'Admin'),
  ('sales', 'Platform'), ('sales', 'Sales'), ('sales', 'Admin'),
  ('accounts', 'Platform'), ('accounts', 'Sales'), ('accounts', 'Purchasing'), ('accounts', 'Reports'), ('accounts', 'HRMS'), ('accounts', 'Admin'),
  ('analyst', 'Platform'), ('analyst', 'Auto Aging'), ('analyst', 'Sales'), ('analyst', 'Inventory'), ('analyst', 'Reports'), ('analyst', 'Admin'),
  ('creator_updater', 'Platform'), ('creator_updater', 'Auto Aging'), ('creator_updater', 'Sales'), ('creator_updater', 'Inventory'), ('creator_updater', 'Purchasing'), ('creator_updater', 'Admin')
) AS defaults(role, section)
ON CONFLICT (company_id, role, section) DO NOTHING;

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

CREATE INDEX IF NOT EXISTS idx_employees_company ON public.employees (company_id);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON public.employees (branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON public.employees (manager_employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON public.employees (department_id);
CREATE INDEX IF NOT EXISTS idx_employees_job_title ON public.employees (job_title_id);

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
    AND public.current_role() IN ('super_admin', 'company_admin', 'general_manager', 'manager')
  )
  WITH CHECK (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin', 'company_admin', 'general_manager', 'manager')
  );

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_id_unique
  ON public.profiles (employee_id)
  WHERE employee_id IS NOT NULL;
