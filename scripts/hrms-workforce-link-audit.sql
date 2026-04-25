-- ─────────────────────────────────────────────────────────────────────────────
-- HRMS Workforce Link Audit
--
-- WHAT THIS CHECKS
--   • employees without a linked profile
--   • employees linked to multiple profiles
--   • profiles with missing, broken, or cross-company employee_id links
--   • employees with broken, self, or cross-company manager_employee_id links
--   • employees whose resolved manager does not have exactly one linked profile
--
-- HOW TO USE
--   • Run in the Supabase SQL editor or via psql with admin credentials.
--   • Replace __COMPANY_ID__ to scope the audit to one tenant.
--   • Leave __COMPANY_ID__ unchanged to audit all companies.
--
-- NOTE
--   This audit expects the migrated workforce schema used by the current HRMS
--   services. It will fail fast if public.employees or profiles.employee_id is
--   missing so unmigrated environments do not produce misleading results.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.employees') IS NULL THEN
    RAISE EXCEPTION
      'Missing public.employees. This environment is not on the workforce schema required by the current HRMS services.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'employee_id'
  ) THEN
    RAISE EXCEPTION
      'Missing public.profiles.employee_id. This environment is not on the workforce schema required by the current HRMS services.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'manager_employee_id'
  ) THEN
    RAISE EXCEPTION
      'Missing public.employees.manager_employee_id. This environment is not on the workforce schema required by the current HRMS services.';
  END IF;
END $$;

-- Replace __COMPANY_ID__ to scope to one tenant. Leave unchanged to audit all.
WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
),
scoped_employees AS (
  SELECT e.*
  FROM public.employees e
  CROSS JOIN params p
  WHERE p.company_id IS NULL OR e.company_id = p.company_id
),
scoped_profiles AS (
  SELECT p.*
  FROM public.profiles p
  CROSS JOIN params scope
  WHERE scope.company_id IS NULL OR p.company_id = scope.company_id
)
SELECT issue, affected_rows
FROM (
  SELECT 'employees_total'::text AS issue, COUNT(*)::bigint AS affected_rows
  FROM scoped_employees

  UNION ALL

  SELECT 'profiles_total', COUNT(*)::bigint
  FROM scoped_profiles

  UNION ALL

  SELECT 'employees_without_profile', COUNT(*)::bigint
  FROM (
    SELECT e.id
    FROM scoped_employees e
    WHERE NOT EXISTS (
      SELECT 1
      FROM scoped_profiles p
      WHERE p.employee_id = e.id
    )
  ) issues

  UNION ALL

  SELECT 'employees_with_duplicate_profiles', COUNT(*)::bigint
  FROM (
    SELECT p.employee_id
    FROM scoped_profiles p
    WHERE p.employee_id IS NOT NULL
    GROUP BY p.employee_id
    HAVING COUNT(*) > 1
  ) issues

  UNION ALL

  SELECT 'profiles_missing_employee_id', COUNT(*)::bigint
  FROM scoped_profiles p
  WHERE p.employee_id IS NULL

  UNION ALL

  SELECT 'profiles_with_broken_employee_id', COUNT(*)::bigint
  FROM scoped_profiles p
  LEFT JOIN public.employees e ON e.id = p.employee_id
  WHERE p.employee_id IS NOT NULL
    AND e.id IS NULL

  UNION ALL

  SELECT 'profiles_with_cross_company_employee_link', COUNT(*)::bigint
  FROM scoped_profiles p
  JOIN public.employees e ON e.id = p.employee_id
  WHERE p.company_id IS NOT NULL
    AND e.company_id <> p.company_id

  UNION ALL

  SELECT 'employees_with_self_manager', COUNT(*)::bigint
  FROM scoped_employees e
  WHERE e.manager_employee_id = e.id

  UNION ALL

  SELECT 'employees_with_broken_manager', COUNT(*)::bigint
  FROM scoped_employees e
  LEFT JOIN public.employees manager_row ON manager_row.id = e.manager_employee_id
  WHERE e.manager_employee_id IS NOT NULL
    AND manager_row.id IS NULL

  UNION ALL

  SELECT 'employees_with_cross_company_manager', COUNT(*)::bigint
  FROM scoped_employees e
  JOIN public.employees manager_row ON manager_row.id = e.manager_employee_id
  WHERE e.manager_employee_id IS NOT NULL
    AND manager_row.company_id <> e.company_id

  UNION ALL

  SELECT 'employees_with_manager_profile_issue', COUNT(*)::bigint
  FROM (
    SELECT e.id
    FROM scoped_employees e
    JOIN public.employees manager_row ON manager_row.id = e.manager_employee_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS linked_profile_count
      FROM public.profiles manager_profile
      WHERE manager_profile.employee_id = manager_row.id
    ) manager_profiles ON TRUE
    WHERE e.manager_employee_id IS NOT NULL
      AND COALESCE(manager_profiles.linked_profile_count, 0) <> 1
  ) issues
) summary
ORDER BY issue;

WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
),
scoped_employees AS (
  SELECT e.*
  FROM public.employees e
  CROSS JOIN params p
  WHERE p.company_id IS NULL OR e.company_id = p.company_id
),
scoped_profiles AS (
  SELECT p.*
  FROM public.profiles p
  CROSS JOIN params scope
  WHERE scope.company_id IS NULL OR p.company_id = scope.company_id
)
SELECT
  e.company_id,
  e.id AS employee_id,
  e.staff_code,
  e.name AS employee_name,
  e.status AS employee_status,
  e.primary_role,
  e.manager_employee_id
FROM scoped_employees e
WHERE NOT EXISTS (
  SELECT 1
  FROM scoped_profiles p
  WHERE p.employee_id = e.id
)
ORDER BY e.company_id, e.name, e.id;

WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
),
scoped_employees AS (
  SELECT e.*
  FROM public.employees e
  CROSS JOIN params p
  WHERE p.company_id IS NULL OR e.company_id = p.company_id
),
scoped_profiles AS (
  SELECT p.*
  FROM public.profiles p
  CROSS JOIN params scope
  WHERE scope.company_id IS NULL OR p.company_id = scope.company_id
)
SELECT
  e.company_id,
  e.id AS employee_id,
  e.staff_code,
  e.name AS employee_name,
  e.status AS employee_status,
  COUNT(p.id)::int AS linked_profile_count,
  ARRAY_AGG(p.id ORDER BY p.created_at NULLS LAST, p.id) AS linked_profile_ids
FROM scoped_employees e
JOIN scoped_profiles p ON p.employee_id = e.id
GROUP BY e.company_id, e.id, e.staff_code, e.name, e.status
HAVING COUNT(p.id) > 1
ORDER BY e.company_id, e.name, e.id;

WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
),
scoped_profiles AS (
  SELECT p.*
  FROM public.profiles p
  CROSS JOIN params scope
  WHERE scope.company_id IS NULL OR p.company_id = scope.company_id
)
SELECT
  CASE
    WHEN p.employee_id IS NULL THEN 'missing_employee_id'
    WHEN e.id IS NULL THEN 'broken_employee_id'
    WHEN p.company_id IS NOT NULL AND e.company_id <> p.company_id THEN 'cross_company_employee_link'
  END AS issue,
  p.company_id AS profile_company_id,
  p.id AS profile_id,
  p.email,
  p.name AS profile_name,
  p.role,
  p.status,
  p.employee_id,
  e.company_id AS employee_company_id,
  e.name AS employee_name
FROM scoped_profiles p
LEFT JOIN public.employees e ON e.id = p.employee_id
WHERE p.employee_id IS NULL
   OR e.id IS NULL
   OR (p.company_id IS NOT NULL AND e.id IS NOT NULL AND e.company_id <> p.company_id)
ORDER BY issue, profile_company_id, profile_name NULLS LAST, p.id;

WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
),
scoped_employees AS (
  SELECT e.*
  FROM public.employees e
  CROSS JOIN params p
  WHERE p.company_id IS NULL OR e.company_id = p.company_id
)
SELECT
  CASE
    WHEN e.manager_employee_id = e.id THEN 'self_manager'
    WHEN manager_row.id IS NULL THEN 'broken_manager_employee_id'
    WHEN manager_row.company_id <> e.company_id THEN 'cross_company_manager'
  END AS issue,
  e.company_id,
  e.id AS employee_id,
  e.staff_code,
  e.name AS employee_name,
  e.status AS employee_status,
  e.manager_employee_id,
  manager_row.company_id AS manager_company_id,
  manager_row.name AS manager_name,
  manager_row.status AS manager_status
FROM scoped_employees e
LEFT JOIN public.employees manager_row ON manager_row.id = e.manager_employee_id
WHERE e.manager_employee_id IS NOT NULL
  AND (
    e.manager_employee_id = e.id
    OR manager_row.id IS NULL
    OR manager_row.company_id <> e.company_id
  )
ORDER BY issue, e.company_id, e.name, e.id;

WITH params AS (
  SELECT NULLIF('__COMPANY_ID__', '__COMPANY_ID__')::text AS company_id
),
scoped_employees AS (
  SELECT e.*
  FROM public.employees e
  CROSS JOIN params p
  WHERE p.company_id IS NULL OR e.company_id = p.company_id
),
manager_profile_counts AS (
  SELECT
    p.employee_id,
    COUNT(*)::int AS linked_profile_count,
    ARRAY_AGG(p.id ORDER BY p.created_at NULLS LAST, p.id) AS linked_profile_ids
  FROM public.profiles p
  WHERE p.employee_id IS NOT NULL
  GROUP BY p.employee_id
)
SELECT
  CASE
    WHEN COALESCE(manager_profiles.linked_profile_count, 0) = 0 THEN 'manager_missing_profile'
    ELSE 'manager_has_duplicate_profiles'
  END AS issue,
  e.company_id,
  e.id AS employee_id,
  e.staff_code,
  e.name AS employee_name,
  e.status AS employee_status,
  manager_row.id AS manager_employee_id,
  manager_row.name AS manager_name,
  manager_row.status AS manager_status,
  COALESCE(manager_profiles.linked_profile_count, 0) AS manager_profile_count,
  manager_profiles.linked_profile_ids
FROM scoped_employees e
JOIN public.employees manager_row ON manager_row.id = e.manager_employee_id
LEFT JOIN manager_profile_counts manager_profiles ON manager_profiles.employee_id = manager_row.id
WHERE e.manager_employee_id IS NOT NULL
  AND COALESCE(manager_profiles.linked_profile_count, 0) <> 1
ORDER BY issue, e.company_id, e.name, e.id;