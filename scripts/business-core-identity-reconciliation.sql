-- Business Core Identity Reconciliation Pack
-- Issue: #90
--
-- READ-ONLY ONLY.
-- This file is intended for Supabase SQL Editor or psql with an authorized
-- read-capable operator account. It produces counts and exception rows only.
--
-- Scope:
--   1. Profile <-> Employee links and workforce-copy drift
--   2. Employee organisation references
--   3. Deal canonical salesperson identity
--   4. Legacy sales_advisors compatibility mapping
--   5. Vehicle salesperson compatibility mapping
--
-- Company scope:
--   Replace __COMPANY_ID__ with one company id to scope results.
--   Leave the token unchanged to audit all companies.
--
-- Safety:
--   - no writes;
--   - no DDL;
--   - no name/email/NRIC/phone based automatic identity matching;
--   - legacy Sales Advisor deterministic candidate uses company + staff code;
--   - Vehicle canonical candidate uses existing salesman_id -> Profile -> Employee.

-- ============================================================================
-- 1. SUMMARY COUNTS
-- ============================================================================

WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
),
scoped_profiles AS (
  SELECT p.*
  FROM public.profiles p
  CROSS JOIN params scope
  WHERE scope.company_id IS NULL OR p.company_id = scope.company_id
),
scoped_employees AS (
  SELECT e.*
  FROM public.employees e
  CROSS JOIN params scope
  WHERE scope.company_id IS NULL OR e.company_id = scope.company_id
),
profile_employee AS (
  SELECT
    p.id AS profile_id,
    p.company_id AS profile_company_id,
    p.employee_id,
    e.company_id AS employee_company_id,
    p.branch_id AS profile_branch_id,
    e.branch_id AS employee_branch_id,
    p.department_id AS profile_department_id,
    e.department_id AS employee_department_id,
    p.job_title_id AS profile_job_title_id,
    e.job_title_id AS employee_job_title_id,
    p.manager_id AS profile_manager_profile_id,
    manager_profile.employee_id AS profile_manager_employee_id,
    e.manager_employee_id,
    p.staff_code AS profile_staff_code,
    e.staff_code AS employee_staff_code
  FROM scoped_profiles p
  LEFT JOIN public.employees e ON e.id = p.employee_id
  LEFT JOIN public.profiles manager_profile ON manager_profile.id = p.manager_id
),
employee_org AS (
  SELECT
    e.id AS employee_id,
    e.company_id,
    e.branch_id,
    b.id AS branch_match_id,
    b.company_id AS branch_company_id,
    e.manager_employee_id,
    manager_e.id AS manager_match_id,
    manager_e.company_id AS manager_company_id,
    e.department_id,
    d.id AS department_match_id,
    d.company_id AS department_company_id,
    e.job_title_id,
    jt.id AS job_title_match_id,
    jt.company_id AS job_title_company_id
  FROM scoped_employees e
  LEFT JOIN public.branches b ON b.id::text = e.branch_id
  LEFT JOIN public.employees manager_e ON manager_e.id = e.manager_employee_id
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.job_titles jt ON jt.id = e.job_title_id
),
scoped_deals AS (
  SELECT d.*
  FROM public.deals d
  CROSS JOIN params scope
  WHERE scope.company_id IS NULL OR d.company_id = scope.company_id
),
deal_identity AS (
  SELECT
    d.id AS deal_id,
    d.company_id,
    d.sales_advisor_id,
    d.sales_advisor_employee_id,
    p.id AS profile_id,
    p.company_id AS profile_company_id,
    p.employee_id AS profile_employee_id,
    canonical_e.id AS canonical_employee_id,
    canonical_e.company_id AS canonical_employee_company_id
  FROM scoped_deals d
  LEFT JOIN public.profiles p ON p.id = d.sales_advisor_id
  LEFT JOIN public.employees canonical_e ON canonical_e.id = d.sales_advisor_employee_id
),
scoped_legacy_advisors AS (
  SELECT sa.*
  FROM public.sales_advisors sa
  CROSS JOIN params scope
  WHERE scope.company_id IS NULL OR sa.company_id = scope.company_id
),
legacy_advisor_candidates AS (
  SELECT
    sa.id AS legacy_sales_advisor_id,
    sa.company_id,
    sa.code,
    e.id AS employee_id,
    ema.id AS assignment_id,
    ema.active AS assignment_active
  FROM scoped_legacy_advisors sa
  LEFT JOIN public.employees e
    ON e.company_id = sa.company_id
   AND e.staff_code IS NOT NULL
   AND sa.code IS NOT NULL
   AND upper(btrim(sa.code)) = e.staff_code
  LEFT JOIN public.employee_module_assignments ema
    ON ema.company_id = sa.company_id
   AND ema.employee_id = e.id
   AND ema.module_key = 'sales'
   AND ema.assignment_role = 'sales_advisor'
),
scoped_vehicles AS (
  SELECT v.*
  FROM public.vehicles v
  CROSS JOIN params scope
  WHERE scope.company_id IS NULL OR v.company_id = scope.company_id
),
vehicle_identity AS (
  SELECT
    v.id AS vehicle_id,
    v.company_id,
    v.salesman_id,
    v.salesman_name,
    p.id AS profile_id,
    p.company_id AS profile_company_id,
    p.employee_id,
    e.id AS employee_match_id,
    e.company_id AS employee_company_id
  FROM scoped_vehicles v
  LEFT JOIN public.profiles p ON p.id = v.salesman_id
  LEFT JOIN public.employees e ON e.id = p.employee_id
)
SELECT issue, affected_rows
FROM (
  SELECT 'profiles_without_employee_link'::text AS issue, COUNT(*)::bigint AS affected_rows
  FROM profile_employee
  WHERE employee_id IS NULL

  UNION ALL
  SELECT 'profiles_with_broken_employee_link', COUNT(*)::bigint
  FROM profile_employee
  WHERE employee_id IS NOT NULL
    AND employee_company_id IS NULL

  UNION ALL
  SELECT 'profiles_with_cross_company_employee_link', COUNT(*)::bigint
  FROM profile_employee
  WHERE employee_id IS NOT NULL
    AND employee_company_id IS NOT NULL
    AND profile_company_id IS NOT NULL
    AND employee_company_id <> profile_company_id

  UNION ALL
  SELECT 'profile_employee_workforce_copy_mismatches', COUNT(*)::bigint
  FROM profile_employee
  WHERE employee_id IS NOT NULL
    AND employee_company_id IS NOT NULL
    AND (
      profile_branch_id IS DISTINCT FROM employee_branch_id
      OR profile_department_id IS DISTINCT FROM employee_department_id
      OR profile_job_title_id IS DISTINCT FROM employee_job_title_id
      OR profile_manager_employee_id IS DISTINCT FROM manager_employee_id
      OR upper(btrim(COALESCE(profile_staff_code, ''))) IS DISTINCT FROM upper(btrim(COALESCE(employee_staff_code, '')))
    )

  UNION ALL
  SELECT 'employees_with_invalid_branch_reference', COUNT(*)::bigint
  FROM employee_org
  WHERE branch_id IS NOT NULL
    AND (branch_match_id IS NULL OR branch_company_id <> company_id)

  UNION ALL
  SELECT 'employees_with_invalid_manager_reference', COUNT(*)::bigint
  FROM employee_org
  WHERE manager_employee_id IS NOT NULL
    AND (manager_match_id IS NULL OR manager_company_id <> company_id OR manager_employee_id = employee_id)

  UNION ALL
  SELECT 'employees_with_invalid_department_reference', COUNT(*)::bigint
  FROM employee_org
  WHERE department_id IS NOT NULL
    AND (department_match_id IS NULL OR department_company_id <> company_id)

  UNION ALL
  SELECT 'employees_with_invalid_job_title_reference', COUNT(*)::bigint
  FROM employee_org
  WHERE job_title_id IS NOT NULL
    AND (job_title_match_id IS NULL OR job_title_company_id <> company_id)

  UNION ALL
  SELECT 'deals_missing_canonical_sales_employee', COUNT(*)::bigint
  FROM deal_identity
  WHERE sales_advisor_employee_id IS NULL

  UNION ALL
  SELECT 'deals_with_broken_or_cross_company_canonical_employee', COUNT(*)::bigint
  FROM deal_identity
  WHERE sales_advisor_employee_id IS NOT NULL
    AND (
      canonical_employee_id IS NULL
      OR canonical_employee_company_id <> company_id
    )

  UNION ALL
  SELECT 'deals_with_profile_employee_disagreement', COUNT(*)::bigint
  FROM deal_identity
  WHERE sales_advisor_id IS NOT NULL
    AND sales_advisor_employee_id IS NOT NULL
    AND (
      profile_id IS NULL
      OR profile_company_id IS DISTINCT FROM company_id
      OR profile_employee_id IS DISTINCT FROM sales_advisor_employee_id
    )

  UNION ALL
  SELECT 'legacy_sales_advisors_without_staff_code_employee_match', COUNT(*)::bigint
  FROM legacy_advisor_candidates
  WHERE employee_id IS NULL

  UNION ALL
  SELECT 'legacy_sales_advisors_without_active_canonical_assignment', COUNT(*)::bigint
  FROM legacy_advisor_candidates
  WHERE employee_id IS NOT NULL
    AND (assignment_id IS NULL OR assignment_active IS DISTINCT FROM true)

  UNION ALL
  SELECT 'vehicles_with_name_only_salesperson_compatibility', COUNT(*)::bigint
  FROM vehicle_identity
  WHERE salesman_id IS NULL
    AND NULLIF(btrim(salesman_name), '') IS NOT NULL

  UNION ALL
  SELECT 'vehicles_with_broken_salesman_profile', COUNT(*)::bigint
  FROM vehicle_identity
  WHERE salesman_id IS NOT NULL
    AND profile_id IS NULL

  UNION ALL
  SELECT 'vehicles_with_salesman_profile_without_employee', COUNT(*)::bigint
  FROM vehicle_identity
  WHERE salesman_id IS NOT NULL
    AND profile_id IS NOT NULL
    AND employee_id IS NULL

  UNION ALL
  SELECT 'vehicles_with_cross_company_salesman_employee', COUNT(*)::bigint
  FROM vehicle_identity
  WHERE employee_id IS NOT NULL
    AND employee_match_id IS NOT NULL
    AND employee_company_id <> company_id
) summary
ORDER BY issue;

-- ============================================================================
-- 2. PROFILE <-> EMPLOYEE EXCEPTIONS
-- ============================================================================

WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
)
SELECT
  CASE
    WHEN p.employee_id IS NULL THEN 'profile_without_employee_link'
    WHEN e.id IS NULL THEN 'broken_employee_link'
    WHEN p.company_id IS NOT NULL AND e.company_id <> p.company_id THEN 'cross_company_employee_link'
    ELSE 'workforce_copy_mismatch'
  END AS issue,
  p.company_id AS profile_company_id,
  p.id AS profile_id,
  p.employee_id,
  e.company_id AS employee_company_id,
  p.branch_id AS profile_branch_id,
  e.branch_id AS employee_branch_id,
  p.department_id AS profile_department_id,
  e.department_id AS employee_department_id,
  p.job_title_id AS profile_job_title_id,
  e.job_title_id AS employee_job_title_id,
  p.manager_id AS profile_manager_profile_id,
  manager_profile.employee_id AS profile_manager_employee_id,
  e.manager_employee_id,
  p.staff_code AS profile_staff_code,
  e.staff_code AS employee_staff_code
FROM public.profiles p
CROSS JOIN params scope
LEFT JOIN public.employees e ON e.id = p.employee_id
LEFT JOIN public.profiles manager_profile ON manager_profile.id = p.manager_id
WHERE (scope.company_id IS NULL OR p.company_id = scope.company_id)
  AND (
    p.employee_id IS NULL
    OR e.id IS NULL
    OR (p.company_id IS NOT NULL AND e.company_id <> p.company_id)
    OR (
      e.id IS NOT NULL
      AND (
        p.branch_id IS DISTINCT FROM e.branch_id
        OR p.department_id IS DISTINCT FROM e.department_id
        OR p.job_title_id IS DISTINCT FROM e.job_title_id
        OR manager_profile.employee_id IS DISTINCT FROM e.manager_employee_id
        OR upper(btrim(COALESCE(p.staff_code, ''))) IS DISTINCT FROM upper(btrim(COALESCE(e.staff_code, '')))
      )
    )
  )
ORDER BY issue, p.company_id, p.id;

-- ============================================================================
-- 3. EMPLOYEE ORGANISATION EXCEPTIONS
-- ============================================================================

WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
)
SELECT
  e.company_id,
  e.id AS employee_id,
  e.branch_id,
  e.manager_employee_id,
  e.department_id,
  e.job_title_id,
  CASE
    WHEN e.branch_id IS NOT NULL
      AND (b.id IS NULL OR b.company_id <> e.company_id)
      THEN 'invalid_branch_reference'
    WHEN e.manager_employee_id IS NOT NULL
      AND (
        manager_e.id IS NULL
        OR manager_e.company_id <> e.company_id
        OR e.manager_employee_id = e.id
      )
      THEN 'invalid_manager_reference'
    WHEN e.department_id IS NOT NULL
      AND (d.id IS NULL OR d.company_id <> e.company_id)
      THEN 'invalid_department_reference'
    WHEN e.job_title_id IS NOT NULL
      AND (jt.id IS NULL OR jt.company_id <> e.company_id)
      THEN 'invalid_job_title_reference'
  END AS issue
FROM public.employees e
CROSS JOIN params scope
LEFT JOIN public.branches b ON b.id::text = e.branch_id
LEFT JOIN public.employees manager_e ON manager_e.id = e.manager_employee_id
LEFT JOIN public.departments d ON d.id = e.department_id
LEFT JOIN public.job_titles jt ON jt.id = e.job_title_id
WHERE (scope.company_id IS NULL OR e.company_id = scope.company_id)
  AND (
    (e.branch_id IS NOT NULL AND (b.id IS NULL OR b.company_id <> e.company_id))
    OR (
      e.manager_employee_id IS NOT NULL
      AND (
        manager_e.id IS NULL
        OR manager_e.company_id <> e.company_id
        OR e.manager_employee_id = e.id
      )
    )
    OR (e.department_id IS NOT NULL AND (d.id IS NULL OR d.company_id <> e.company_id))
    OR (e.job_title_id IS NOT NULL AND (jt.id IS NULL OR jt.company_id <> e.company_id))
  )
ORDER BY e.company_id, issue, e.id;

-- ============================================================================
-- 4. DEAL SALESPERSON EXCEPTIONS
-- ============================================================================

WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
)
SELECT
  d.company_id,
  d.id AS deal_id,
  d.deal_no,
  d.sales_advisor_id AS compatibility_profile_id,
  d.sales_advisor_employee_id AS canonical_employee_id,
  p.company_id AS profile_company_id,
  p.employee_id AS profile_employee_id,
  e.company_id AS canonical_employee_company_id,
  CASE
    WHEN d.sales_advisor_employee_id IS NULL THEN 'missing_canonical_employee'
    WHEN e.id IS NULL THEN 'canonical_employee_not_found'
    WHEN e.company_id <> d.company_id THEN 'canonical_employee_company_mismatch'
    WHEN d.sales_advisor_id IS NOT NULL AND p.id IS NULL THEN 'compatibility_profile_not_found'
    WHEN d.sales_advisor_id IS NOT NULL AND p.company_id IS DISTINCT FROM d.company_id THEN 'compatibility_profile_company_mismatch'
    WHEN d.sales_advisor_id IS NOT NULL AND p.employee_id IS DISTINCT FROM d.sales_advisor_employee_id THEN 'compatibility_profile_employee_disagreement'
  END AS issue
FROM public.deals d
CROSS JOIN params scope
LEFT JOIN public.profiles p ON p.id = d.sales_advisor_id
LEFT JOIN public.employees e ON e.id = d.sales_advisor_employee_id
WHERE (scope.company_id IS NULL OR d.company_id = scope.company_id)
  AND (
    d.sales_advisor_employee_id IS NULL
    OR e.id IS NULL
    OR e.company_id <> d.company_id
    OR (
      d.sales_advisor_id IS NOT NULL
      AND (
        p.id IS NULL
        OR p.company_id IS DISTINCT FROM d.company_id
        OR p.employee_id IS DISTINCT FROM d.sales_advisor_employee_id
      )
    )
  )
ORDER BY d.company_id, issue, d.deal_no;

-- ============================================================================
-- 5. LEGACY SALES ADVISOR COMPATIBILITY
-- ============================================================================
-- Deterministic candidate: same company + normalized staff code only.
-- The report deliberately does not match by name, email, IC, or phone.

WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
)
SELECT
  sa.company_id,
  sa.id AS legacy_sales_advisor_id,
  sa.code AS legacy_staff_code,
  e.id AS candidate_employee_id,
  e.staff_code AS employee_staff_code,
  ema.id AS canonical_assignment_id,
  ema.active AS canonical_assignment_active,
  CASE
    WHEN sa.code IS NULL OR NULLIF(btrim(sa.code), '') IS NULL THEN 'legacy_staff_code_missing'
    WHEN e.id IS NULL THEN 'no_same_company_staff_code_employee_match'
    WHEN ema.id IS NULL THEN 'employee_missing_sales_advisor_assignment'
    WHEN ema.active IS DISTINCT FROM true THEN 'sales_advisor_assignment_inactive'
    ELSE 'deterministic_canonical_match'
  END AS reconciliation_status
FROM public.sales_advisors sa
CROSS JOIN params scope
LEFT JOIN public.employees e
  ON e.company_id = sa.company_id
 AND e.staff_code IS NOT NULL
 AND sa.code IS NOT NULL
 AND upper(btrim(sa.code)) = e.staff_code
LEFT JOIN public.employee_module_assignments ema
  ON ema.company_id = sa.company_id
 AND ema.employee_id = e.id
 AND ema.module_key = 'sales'
 AND ema.assignment_role = 'sales_advisor'
WHERE scope.company_id IS NULL OR sa.company_id = scope.company_id
ORDER BY sa.company_id, reconciliation_status, sa.code NULLS LAST, sa.id;

-- ============================================================================
-- 6. VEHICLE SALESPERSON COMPATIBILITY
-- ============================================================================
-- vehicles.salesman_id is an existing Profile FK. The only canonical candidate
-- reported here is the linked Profile.employee_id. salesman_name is display/
-- source evidence only and is never used to manufacture an Employee link.

WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
)
SELECT
  v.company_id,
  v.id AS vehicle_id,
  v.chassis_no,
  v.salesman_id AS compatibility_profile_id,
  v.salesman_name AS salesperson_display_snapshot,
  p.company_id AS profile_company_id,
  p.employee_id AS canonical_employee_candidate_id,
  e.company_id AS employee_company_id,
  CASE
    WHEN v.salesman_id IS NULL AND NULLIF(btrim(v.salesman_name), '') IS NOT NULL
      THEN 'name_only_compatibility'
    WHEN v.salesman_id IS NULL
      THEN 'no_salesperson_identity'
    WHEN p.id IS NULL
      THEN 'salesman_profile_not_found'
    WHEN p.employee_id IS NULL
      THEN 'salesman_profile_not_linked_to_employee'
    WHEN e.id IS NULL
      THEN 'linked_employee_not_found'
    WHEN e.company_id <> v.company_id
      THEN 'linked_employee_company_mismatch'
    ELSE 'deterministic_profile_employee_candidate'
  END AS reconciliation_status
FROM public.vehicles v
CROSS JOIN params scope
LEFT JOIN public.profiles p ON p.id = v.salesman_id
LEFT JOIN public.employees e ON e.id = p.employee_id
WHERE scope.company_id IS NULL OR v.company_id = scope.company_id
ORDER BY v.company_id, reconciliation_status, v.chassis_no, v.id;
