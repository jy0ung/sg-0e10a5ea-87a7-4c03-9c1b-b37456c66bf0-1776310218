-- HRMS role definitions are organisational roles used by HRMS workflows.
-- They are separate from global app/module permission roles.

CREATE TABLE IF NOT EXISTS public.hrms_roles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  text NOT NULL,
  code                        text NOT NULL,
  name                        text NOT NULL,
  category                    text NOT NULL DEFAULT 'custom'
                                CHECK (category IN ('executive','hr','department','line_management','employee','payroll','attendance','custom')),
  scope                       text NOT NULL DEFAULT 'company'
                                CHECK (scope IN ('company','branch','department','self')),
  authority_level             int NOT NULL DEFAULT 50 CHECK (authority_level BETWEEN 1 AND 999),
  description                 text,
  can_approve_requests        boolean NOT NULL DEFAULT false,
  can_manage_employee_records boolean NOT NULL DEFAULT false,
  can_view_hrms_reports       boolean NOT NULL DEFAULT false,
  is_active                   boolean NOT NULL DEFAULT true,
  is_system_default           boolean NOT NULL DEFAULT false,
  created_by                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_hrms_roles_company ON public.hrms_roles (company_id);
CREATE INDEX IF NOT EXISTS idx_hrms_roles_company_active ON public.hrms_roles (company_id, is_active);

ALTER TABLE public.hrms_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hrms_roles_select ON public.hrms_roles;
DROP POLICY IF EXISTS hrms_roles_manage ON public.hrms_roles;

CREATE POLICY hrms_roles_select ON public.hrms_roles
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));

CREATE POLICY hrms_roles_manage ON public.hrms_roles
  FOR ALL TO authenticated
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin', 'company_admin')
  );

CREATE TABLE IF NOT EXISTS public.employee_hrms_role_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     text NOT NULL,
  hrms_role_id   uuid NOT NULL REFERENCES public.hrms_roles(id) ON DELETE CASCADE,
  employee_id    uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  profile_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_primary     boolean NOT NULL DEFAULT false,
  assigned_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (employee_id IS NOT NULL OR profile_id IS NOT NULL),
  UNIQUE (company_id, hrms_role_id, employee_id),
  UNIQUE (company_id, hrms_role_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_hrms_roles_company ON public.employee_hrms_role_assignments (company_id);
CREATE INDEX IF NOT EXISTS idx_employee_hrms_roles_role ON public.employee_hrms_role_assignments (hrms_role_id);
CREATE INDEX IF NOT EXISTS idx_employee_hrms_roles_employee ON public.employee_hrms_role_assignments (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_hrms_roles_profile ON public.employee_hrms_role_assignments (profile_id);

ALTER TABLE public.employee_hrms_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_hrms_roles_select ON public.employee_hrms_role_assignments;
DROP POLICY IF EXISTS employee_hrms_roles_manage ON public.employee_hrms_role_assignments;

CREATE POLICY employee_hrms_roles_select ON public.employee_hrms_role_assignments
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));

CREATE POLICY employee_hrms_roles_manage ON public.employee_hrms_role_assignments
  FOR ALL TO authenticated
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin', 'company_admin')
  );

ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS fallback_approver_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalation_rule text,
  ADD COLUMN IF NOT EXISTS condition_rule text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_approval_steps_approver_role ON public.approval_steps (approver_role);

WITH defaults(code, name, category, scope, authority_level, description, can_approve, can_manage, can_report) AS (
  VALUES
    ('director', 'Director', 'executive', 'company', 10, 'Executive HRMS authority for company-wide approvals and reporting.', true, false, true),
    ('general_manager', 'General Manager', 'executive', 'company', 20, 'Senior operational approver for cross-department HRMS workflows.', true, false, true),
    ('hr_manager', 'HR Manager', 'hr', 'company', 30, 'Owns HRMS policies, role setup, workflows, and employee record governance.', true, true, true),
    ('hr_officer', 'HR Officer', 'hr', 'company', 40, 'Handles HRMS administration and employee record maintenance.', false, true, true),
    ('department_manager', 'Department Manager', 'department', 'department', 50, 'Approves requests and manages HRMS visibility for a department.', true, false, true),
    ('line_manager', 'Line Manager', 'line_management', 'department', 60, 'First-line approver for employee HRMS requests.', true, false, false),
    ('employee', 'Employee', 'employee', 'self', 90, 'Standard HRMS self-service user.', false, false, false),
    ('payroll_officer', 'Payroll Officer', 'payroll', 'company', 45, 'Runs payroll operations and participates in payroll approval workflows.', true, false, true),
    ('attendance_officer', 'Attendance Officer', 'attendance', 'company', 55, 'Maintains attendance records and attendance correction workflows.', true, false, true)
)
INSERT INTO public.hrms_roles (
  company_id, code, name, category, scope, authority_level, description,
  can_approve_requests, can_manage_employee_records, can_view_hrms_reports, is_system_default
)
SELECT
  c.id,
  d.code,
  d.name,
  d.category,
  d.scope,
  d.authority_level,
  d.description,
  d.can_approve,
  d.can_manage,
  d.can_report,
  true
FROM public.companies c
CROSS JOIN defaults d
ON CONFLICT (company_id, code) DO NOTHING;

WITH role_mapping(app_role, hrms_code) AS (
  VALUES
    ('director', 'director'),
    ('general_manager', 'general_manager'),
    ('manager', 'department_manager'),
    ('accounts', 'payroll_officer'),
    ('super_admin', 'hr_manager'),
    ('company_admin', 'hr_manager'),
    ('sales', 'employee'),
    ('analyst', 'employee'),
    ('creator_updater', 'employee')
)
INSERT INTO public.employee_hrms_role_assignments (company_id, hrms_role_id, employee_id, profile_id, is_primary)
SELECT
  e.company_id,
  r.id,
  e.id,
  p.id,
  true
FROM public.employees e
JOIN role_mapping m ON m.app_role = e.primary_role
JOIN public.hrms_roles r ON r.company_id = e.company_id AND r.code = m.hrms_code
LEFT JOIN public.profiles p ON p.employee_id = e.id
ON CONFLICT DO NOTHING;

WITH role_mapping(app_role, hrms_code) AS (
  VALUES
    ('director', 'director'),
    ('general_manager', 'general_manager'),
    ('manager', 'department_manager'),
    ('accounts', 'payroll_officer'),
    ('super_admin', 'hr_manager'),
    ('company_admin', 'hr_manager'),
    ('sales', 'employee'),
    ('analyst', 'employee'),
    ('creator_updater', 'employee')
)
UPDATE public.approval_steps s
SET approver_role = r.id::text
FROM public.approval_flows f
JOIN role_mapping m ON true
JOIN public.hrms_roles r ON r.company_id = f.company_id AND r.code = m.hrms_code
WHERE s.flow_id = f.id
  AND s.approver_role = m.app_role;

COMMENT ON TABLE public.hrms_roles IS
  'Company-scoped HRMS organisational roles used by HRMS workflows and operational rules. This does not control global app/module permissions.';

COMMENT ON COLUMN public.approval_steps.approver_role IS
  'For HRMS workflows this stores hrms_roles.id as text. Legacy global role keys are migrated to HRMS roles.';
