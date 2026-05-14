ALTER TABLE public.hrms_roles
  DROP CONSTRAINT IF EXISTS hrms_roles_category_check;

ALTER TABLE public.hrms_roles
  ADD CONSTRAINT hrms_roles_category_check
  CHECK (category IN ('executive','hr','department','line_management','staff','employee','payroll','attendance','custom'));

WITH duplicate_staff_roles AS (
  SELECT legacy.id AS legacy_role_id, canonical.id AS canonical_role_id
  FROM public.hrms_roles AS legacy
  JOIN public.hrms_roles AS canonical
    ON canonical.company_id = legacy.company_id
   AND canonical.code = 'staff'
  WHERE legacy.code = 'employee'
)
UPDATE public.employee_hrms_role_assignments AS assignment
SET hrms_role_id = duplicate_staff_roles.canonical_role_id,
    updated_at = now()
FROM duplicate_staff_roles
WHERE assignment.hrms_role_id = duplicate_staff_roles.legacy_role_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.employee_hrms_role_assignments AS existing
    WHERE existing.company_id = assignment.company_id
      AND existing.hrms_role_id = duplicate_staff_roles.canonical_role_id
      AND existing.employee_id IS NOT DISTINCT FROM assignment.employee_id
      AND existing.profile_id IS NOT DISTINCT FROM assignment.profile_id
  );

WITH duplicate_staff_roles AS (
  SELECT legacy.id AS legacy_role_id, canonical.id AS canonical_role_id
  FROM public.hrms_roles AS legacy
  JOIN public.hrms_roles AS canonical
    ON canonical.company_id = legacy.company_id
   AND canonical.code = 'staff'
  WHERE legacy.code = 'employee'
)
UPDATE public.approval_steps AS step
SET approver_role = duplicate_staff_roles.canonical_role_id
FROM duplicate_staff_roles
WHERE step.approver_role = duplicate_staff_roles.legacy_role_id::text;

WITH duplicate_staff_roles AS (
  SELECT legacy.id AS legacy_role_id, canonical.id AS canonical_role_id
  FROM public.hrms_roles AS legacy
  JOIN public.hrms_roles AS canonical
    ON canonical.company_id = legacy.company_id
   AND canonical.code = 'staff'
  WHERE legacy.code = 'employee'
)
UPDATE public.approval_instances AS instance
SET current_approver_role = duplicate_staff_roles.canonical_role_id::text,
    updated_at = now()
FROM duplicate_staff_roles
WHERE instance.current_approver_role = duplicate_staff_roles.legacy_role_id::text;

DELETE FROM public.employee_hrms_role_assignments AS assignment
USING public.hrms_roles AS role
WHERE assignment.hrms_role_id = role.id
  AND role.code = 'employee'
  AND EXISTS (
    SELECT 1
    FROM public.hrms_roles AS canonical
    WHERE canonical.company_id = role.company_id
      AND canonical.code = 'staff'
  );

DELETE FROM public.hrms_roles AS role
WHERE role.code = 'employee'
  AND EXISTS (
    SELECT 1
    FROM public.hrms_roles AS canonical
    WHERE canonical.company_id = role.company_id
      AND canonical.code = 'staff'
  );

UPDATE public.hrms_roles
SET code = 'staff',
    name = 'Staff',
    category = 'staff',
    scope = 'self',
    authority_level = 90,
    description = 'Standard HRMS self-service user.',
    can_approve_requests = false,
    can_manage_employee_records = false,
    can_view_hrms_reports = false,
    is_active = true,
    is_system_default = true,
    updated_at = now()
WHERE code = 'employee';

UPDATE public.hrms_roles
SET category = 'staff',
    updated_at = now()
WHERE category = 'employee';

INSERT INTO public.hrms_roles (
  company_id,
  code,
  name,
  category,
  scope,
  authority_level,
  description,
  can_approve_requests,
  can_manage_employee_records,
  can_view_hrms_reports,
  is_active,
  is_system_default
)
SELECT company.id,
       'staff',
       'Staff',
       'staff',
       'self',
       90,
       'Standard HRMS self-service user.',
       false,
       false,
       false,
       true,
       true
FROM public.companies AS company
WHERE NOT EXISTS (
  SELECT 1
  FROM public.hrms_roles AS role
  WHERE role.company_id = company.id
    AND role.code = 'staff'
);

COMMENT ON COLUMN public.profiles.role IS
  'Main-app role. Analyst is legacy and should not be used to determine HRMS access.';