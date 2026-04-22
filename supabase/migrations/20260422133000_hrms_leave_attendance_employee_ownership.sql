-- ============================================================
-- HRMS leave / attendance employee ownership migration
-- ============================================================
-- Goal:
--   Move employee-owned leave and attendance rows from legacy
--   `profiles.id` ownership to workforce `employees.id` ownership.
--
-- Important:
--   Approval actors and workflow requester / approver identities remain
--   account/profile IDs (`profiles.id`). Only employee-owned business rows
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
    RAISE EXCEPTION 'profiles.employee_id must be backfilled before migrating leave/attendance ownership.';
  END IF;
END;
$$;

UPDATE public.leave_balances lb
SET employee_id = p.employee_id
FROM public.profiles p
WHERE p.id = lb.employee_id
  AND p.employee_id IS NOT NULL
  AND lb.employee_id IS DISTINCT FROM p.employee_id;

UPDATE public.leave_requests lr
SET employee_id = p.employee_id
FROM public.profiles p
WHERE p.id = lr.employee_id
  AND p.employee_id IS NOT NULL
  AND lr.employee_id IS DISTINCT FROM p.employee_id;

UPDATE public.attendance_records ar
SET employee_id = p.employee_id
FROM public.profiles p
WHERE p.id = ar.employee_id
  AND p.employee_id IS NOT NULL
  AND ar.employee_id IS DISTINCT FROM p.employee_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.leave_balances lb
    LEFT JOIN public.employees e ON e.id = lb.employee_id
    WHERE e.id IS NULL
  ) THEN
    RAISE EXCEPTION 'leave_balances contains employee_id values that do not resolve to public.employees.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.leave_requests lr
    LEFT JOIN public.employees e ON e.id = lr.employee_id
    WHERE e.id IS NULL
  ) THEN
    RAISE EXCEPTION 'leave_requests contains employee_id values that do not resolve to public.employees.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.attendance_records ar
    LEFT JOIN public.employees e ON e.id = ar.employee_id
    WHERE e.id IS NULL
  ) THEN
    RAISE EXCEPTION 'attendance_records contains employee_id values that do not resolve to public.employees.';
  END IF;
END;
$$;

ALTER TABLE public.leave_balances
  DROP CONSTRAINT IF EXISTS leave_balances_employee_id_fkey;

ALTER TABLE public.leave_balances
  ADD CONSTRAINT leave_balances_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_employee_id_fkey;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_employee_id_fkey;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Company read leave_balances" ON public.leave_balances;
CREATE POLICY "Company read leave_balances" ON public.leave_balances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = leave_balances.employee_id
        AND e.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

DROP POLICY IF EXISTS "Employee insert leave_requests" ON public.leave_requests;
CREATE POLICY "Employee insert leave_requests" ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Employee cancel leave_requests" ON public.leave_requests;
CREATE POLICY "Employee cancel leave_requests" ON public.leave_requests
  FOR DELETE TO authenticated
  USING (
    employee_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid())
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Manager update leave_requests" ON public.leave_requests;
CREATE POLICY "Manager update leave_requests" ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','company_admin','general_manager','manager')
    )
    AND employee_id IS DISTINCT FROM (SELECT employee_id FROM public.profiles WHERE id = auth.uid())
  );