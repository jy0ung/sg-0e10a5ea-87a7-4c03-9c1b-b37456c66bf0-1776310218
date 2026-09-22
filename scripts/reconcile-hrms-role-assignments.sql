-- Read-only reconciliation for canonical HRMS role-assignment integrity.
-- This query intentionally does not modify or guess identity links.

SELECT
  a.id AS assignment_id,
  a.company_id AS assignment_company_id,
  a.hrms_role_id,
  r.company_id AS role_company_id,
  a.employee_id,
  e.company_id AS employee_company_id,
  a.profile_id,
  p.company_id AS profile_company_id,
  p.access_scope AS profile_access_scope,
  p.employee_id AS profile_employee_id,
  CASE
    WHEN r.id IS NULL THEN 'role_not_found'
    WHEN r.company_id IS DISTINCT FROM a.company_id THEN 'role_company_mismatch'
    WHEN a.employee_id IS NOT NULL AND e.id IS NULL THEN 'employee_not_found'
    WHEN a.employee_id IS NOT NULL AND e.company_id IS DISTINCT FROM a.company_id THEN 'employee_company_mismatch'
    WHEN a.profile_id IS NOT NULL AND p.id IS NULL THEN 'profile_not_found'
    WHEN a.profile_id IS NOT NULL
      AND p.company_id IS DISTINCT FROM a.company_id
      AND COALESCE(p.access_scope, '') <> 'global'
      THEN 'profile_company_mismatch'
    WHEN a.employee_id IS NOT NULL
      AND a.profile_id IS NOT NULL
      AND p.employee_id IS DISTINCT FROM a.employee_id
      THEN 'profile_employee_mismatch'
    ELSE 'requires_manual_review'
  END AS exception_reason
FROM public.employee_hrms_role_assignments a
LEFT JOIN public.hrms_roles r
  ON r.id = a.hrms_role_id
LEFT JOIN public.employees e
  ON e.id = a.employee_id
LEFT JOIN public.profiles p
  ON p.id = a.profile_id
WHERE
  r.id IS NULL
  OR r.company_id IS DISTINCT FROM a.company_id
  OR (a.employee_id IS NOT NULL AND e.id IS NULL)
  OR (a.employee_id IS NOT NULL AND e.company_id IS DISTINCT FROM a.company_id)
  OR (a.profile_id IS NOT NULL AND p.id IS NULL)
  OR (
    a.profile_id IS NOT NULL
    AND p.company_id IS DISTINCT FROM a.company_id
    AND COALESCE(p.access_scope, '') <> 'global'
  )
  OR (
    a.employee_id IS NOT NULL
    AND a.profile_id IS NOT NULL
    AND p.employee_id IS DISTINCT FROM a.employee_id
  )
ORDER BY a.company_id, a.hrms_role_id, a.created_at;
