-- ============================================================
-- HRMS departments head employee ownership migration
-- ============================================================
-- Goal:
--   Move department head references from legacy `profiles.id` ownership to
--   workforce `employees.id` ownership.
--
-- Important:
--   This changes only the organisational reference on departments.
--   Account, reviewer, and approval actor identities remain on profiles.id.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.company_id IS NOT NULL
      AND p.employee_id IS NULL
  ) THEN
    RAISE EXCEPTION 'profiles.employee_id must be backfilled before migrating department head ownership.';
  END IF;
END;
$$;

UPDATE public.departments d
SET head_employee_id = p.employee_id
FROM public.profiles p
WHERE p.id = d.head_employee_id
  AND p.employee_id IS NOT NULL
  AND d.head_employee_id IS DISTINCT FROM p.employee_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.departments d
    LEFT JOIN public.employees e ON e.id = d.head_employee_id
    WHERE d.head_employee_id IS NOT NULL
      AND e.id IS NULL
  ) THEN
    RAISE EXCEPTION 'departments contains head_employee_id values that do not resolve to public.employees.';
  END IF;
END;
$$;

ALTER TABLE public.departments
  DROP CONSTRAINT IF EXISTS departments_head_employee_id_fkey;

ALTER TABLE public.departments
  ADD CONSTRAINT departments_head_employee_id_fkey
    FOREIGN KEY (head_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;

-- Existing department RLS remains valid because it scopes by company and role,
-- not by head_employee_id.