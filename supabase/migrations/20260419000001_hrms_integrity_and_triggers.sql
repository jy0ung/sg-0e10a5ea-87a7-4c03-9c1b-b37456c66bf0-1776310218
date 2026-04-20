-- ============================================================
-- HRMS Hardening: Integrity Constraints, Triggers, RLS Fixes
-- Covers:
--   1. Missing CHECK / UNIQUE constraints
--   2. leave_balances auto-deduction trigger
--   3. Self-approval prevention on leave_requests
--   4. payroll_runs totals auto-computation trigger
-- ============================================================

-- ─── 1. Integrity Constraints ────────────────────────────────────────────────

-- Unique staff code per company (partial — only when staff_code is not null)
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_staff_code
  ON public.profiles (company_id, staff_code)
  WHERE staff_code IS NOT NULL;

-- Leave request: end must be on or after start
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_leave_dates' AND conrelid = 'public.leave_requests'::regclass
  ) THEN
    ALTER TABLE public.leave_requests
      ADD CONSTRAINT chk_leave_dates CHECK (end_date >= start_date);
  END IF;
END;
$$;

-- Leave request: days must be positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_leave_days' AND conrelid = 'public.leave_requests'::regclass
  ) THEN
    ALTER TABLE public.leave_requests
      ADD CONSTRAINT chk_leave_days CHECK (days > 0);
  END IF;
END;
$$;

-- Attendance: hours_worked must be non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_hours_worked' AND conrelid = 'public.attendance_records'::regclass
  ) THEN
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT chk_hours_worked CHECK (hours_worked IS NULL OR hours_worked >= 0);
  END IF;
END;
$$;

-- Leave balance: used_days cannot go negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_leave_balance' AND conrelid = 'public.leave_balances'::regclass
  ) THEN
    ALTER TABLE public.leave_balances
      ADD CONSTRAINT chk_leave_balance CHECK (used_days >= 0);
  END IF;
END;
$$;

-- Payroll: period_year must be in a sensible range
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_payroll_year' AND conrelid = 'public.payroll_runs'::regclass
  ) THEN
    ALTER TABLE public.payroll_runs
      ADD CONSTRAINT chk_payroll_year CHECK (period_year BETWEEN 2000 AND 2100);
  END IF;
END;
$$;

-- ─── 2. Leave Balance Auto-Deduction Trigger ─────────────────────────────────
-- Fires AFTER UPDATE on leave_requests.
-- Approved  → deduct days from the matching leave_balances row.
-- Un-approved (cancelled/rejected after approval) → refund days.

CREATE OR REPLACE FUNCTION fn_sync_leave_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Transition INTO approved
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    UPDATE public.leave_balances
    SET    used_days  = used_days + NEW.days,
           updated_at = now()
    WHERE  employee_id   = NEW.employee_id
      AND  leave_type_id = NEW.leave_type_id
      AND  year          = EXTRACT(YEAR FROM NEW.start_date)::int;

  -- Transition OUT OF approved
  ELSIF OLD.status = 'approved' AND NEW.status IN ('cancelled', 'rejected') THEN
    UPDATE public.leave_balances
    SET    used_days  = GREATEST(used_days - OLD.days, 0),
           updated_at = now()
    WHERE  employee_id   = NEW.employee_id
      AND  leave_type_id = NEW.leave_type_id
      AND  year          = EXTRACT(YEAR FROM OLD.start_date)::int;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_balance ON public.leave_requests;
CREATE TRIGGER trg_leave_balance
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_leave_balance();

-- ─── 3. Self-Approval Prevention (RLS) ───────────────────────────────────────
-- Replace the generic manager-update policy with one that also prevents
-- a manager from approving their own leave requests.

DROP POLICY IF EXISTS "Manager update leave_requests" ON public.leave_requests;
CREATE POLICY "Manager update leave_requests" ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','company_admin','general_manager','manager')
    )
    AND employee_id != auth.uid()   -- cannot approve/reject your own request
  );

-- ─── 4. Payroll Runs Totals Auto-Computation Trigger ─────────────────────────
-- Recalculates total_headcount, total_gross, total_net on the parent
-- payroll_runs row whenever a payroll_items row is inserted, updated, or deleted.

CREATE OR REPLACE FUNCTION fn_update_payroll_run_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid := COALESCE(NEW.payroll_run_id, OLD.payroll_run_id);
BEGIN
  UPDATE public.payroll_runs
  SET
    total_headcount = (
      SELECT COUNT(*)
      FROM public.payroll_items
      WHERE payroll_run_id = v_run_id
    ),
    total_gross = (
      SELECT COALESCE(SUM(gross_pay), 0)
      FROM public.payroll_items
      WHERE payroll_run_id = v_run_id
    ),
    total_net = (
      SELECT COALESCE(SUM(net_pay), 0)
      FROM public.payroll_items
      WHERE payroll_run_id = v_run_id
    ),
    updated_at = now()
  WHERE id = v_run_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_totals ON public.payroll_items;
CREATE TRIGGER trg_payroll_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_items
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_payroll_run_totals();
