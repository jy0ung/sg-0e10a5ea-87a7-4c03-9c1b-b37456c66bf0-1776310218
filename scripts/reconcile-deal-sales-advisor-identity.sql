-- Read-only reconciliation for Employee-backed Deal ownership.
-- Run after migration 20260922090000_deal_employee_sales_advisor_identity.sql.
-- This query intentionally does not guess identity from names, emails, NRICs,
-- or other mutable attributes.

SELECT
  d.id AS deal_id,
  d.deal_no,
  d.company_id AS deal_company_id,
  d.sales_advisor_id AS legacy_profile_id,
  d.sales_advisor_employee_id,
  p.company_id AS profile_company_id,
  p.employee_id AS profile_employee_id,
  e.company_id AS employee_company_id,
  CASE
    WHEN d.sales_advisor_id IS NULL THEN 'legacy_profile_missing'
    WHEN p.id IS NULL THEN 'profile_not_found'
    WHEN p.employee_id IS NULL THEN 'profile_not_linked_to_employee'
    WHEN p.company_id IS DISTINCT FROM d.company_id THEN 'profile_company_mismatch'
    WHEN e.id IS NULL THEN 'employee_not_found'
    WHEN e.company_id IS DISTINCT FROM d.company_id THEN 'employee_company_mismatch'
    ELSE 'requires_manual_review'
  END AS exception_reason
FROM public.deals d
LEFT JOIN public.profiles p
  ON p.id = d.sales_advisor_id
LEFT JOIN public.employees e
  ON e.id = p.employee_id
WHERE d.sales_advisor_employee_id IS NULL
ORDER BY d.company_id, d.deal_no;
