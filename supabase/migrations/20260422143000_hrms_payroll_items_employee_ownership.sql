-- ============================================================
-- HRMS payroll items employee ownership migration
-- ============================================================
-- Goal:
--   Move employee-owned payroll item rows from legacy `profiles.id`
--   ownership to workforce `employees.id` ownership.
--
-- Important:
--   Payroll run actors and approval requester / approver identities remain
--   account/profile IDs (`profiles.id`). Only employee-owned payroll rows
--   migrate in this step.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.company_id IS NOT NULL
      AND p.employee_id IS NULL
  ) THEN
    RAISE EXCEPTION 'profiles.employee_id must be backfilled before migrating payroll item ownership.';
  END IF;
END;
$$;

UPDATE public.payroll_items pi
SET employee_id = p.employee_id
FROM public.profiles p
WHERE p.id = pi.employee_id
  AND p.employee_id IS NOT NULL
  AND pi.employee_id IS DISTINCT FROM p.employee_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payroll_items pi
    LEFT JOIN public.employees e ON e.id = pi.employee_id
    WHERE e.id IS NULL
  ) THEN
    RAISE EXCEPTION 'payroll_items contains employee_id values that do not resolve to public.employees.';
  END IF;
END;
$$;

ALTER TABLE public.payroll_items
  DROP CONSTRAINT IF EXISTS payroll_items_employee_id_fkey;

ALTER TABLE public.payroll_items
  ADD CONSTRAINT payroll_items_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

-- Existing payroll item RLS remains valid because row visibility is scoped
-- through payroll_runs.company_id rather than payroll_items.employee_id.