-- Read-only reconciliation for Department head company integrity.
-- Run before/after migration 20260922101500_department_head_employee_company.sql.
-- This intentionally does not modify or guess Department head identity.

SELECT
  d.id AS department_id,
  d.name AS department_name,
  d.company_id AS department_company_id,
  d.head_employee_id,
  e.name AS head_employee_name,
  e.company_id AS employee_company_id,
  CASE
    WHEN e.id IS NULL THEN 'head_employee_not_found'
    WHEN e.company_id IS DISTINCT FROM d.company_id THEN 'employee_company_mismatch'
    ELSE 'requires_manual_review'
  END AS exception_reason
FROM public.departments d
LEFT JOIN public.employees e
  ON e.id = d.head_employee_id
WHERE d.head_employee_id IS NOT NULL
  AND (
    e.id IS NULL
    OR e.company_id IS DISTINCT FROM d.company_id
  )
ORDER BY d.company_id, d.name;
