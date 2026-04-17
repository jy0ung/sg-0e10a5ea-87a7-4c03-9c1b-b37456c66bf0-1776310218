-- ============================================================
-- Migration: Fix RLS policies
-- 1. HRMS tables: add company_id scoping to SELECT
-- 2. can_access_row: fix branch_id→branch_code resolution
-- 3. Tickets: fix 'admin' → 'company_admin' role name
-- 4. Profiles: scope SELECT to same company
-- ============================================================

-- ─── 1. HRMS: Replace open SELECT policies with company-scoped ones ──────────

-- leave_types
DROP POLICY IF EXISTS "Auth read leave_types" ON public.leave_types;
CREATE POLICY "Company read leave_types" ON public.leave_types
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- leave_balances (no company_id column — scope via employee's profile)
DROP POLICY IF EXISTS "Auth read leave_balances" ON public.leave_balances;
CREATE POLICY "Company read leave_balances" ON public.leave_balances
  FOR SELECT TO authenticated
  USING (
    employee_id IN (
      SELECT p2.id FROM public.profiles p2
      WHERE p2.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- leave_requests
DROP POLICY IF EXISTS "Auth read leave_requests" ON public.leave_requests;
CREATE POLICY "Company read leave_requests" ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- attendance_records
DROP POLICY IF EXISTS "Auth read attendance" ON public.attendance_records;
CREATE POLICY "Company read attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- payroll_runs
DROP POLICY IF EXISTS "Auth read payroll_runs" ON public.payroll_runs;
CREATE POLICY "Company read payroll_runs" ON public.payroll_runs
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- payroll_items (no company_id — scope via payroll_run)
DROP POLICY IF EXISTS "Auth read payroll_items" ON public.payroll_items;
CREATE POLICY "Company read payroll_items" ON public.payroll_items
  FOR SELECT TO authenticated
  USING (
    payroll_run_id IN (
      SELECT pr.id FROM public.payroll_runs pr
      WHERE pr.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- appraisals
DROP POLICY IF EXISTS "Auth read appraisals" ON public.appraisals;
CREATE POLICY "Company read appraisals" ON public.appraisals
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- appraisal_items (no company_id — scope via appraisal)
DROP POLICY IF EXISTS "Auth read appraisal_items" ON public.appraisal_items;
CREATE POLICY "Company read appraisal_items" ON public.appraisal_items
  FOR SELECT TO authenticated
  USING (
    appraisal_id IN (
      SELECT a.id FROM public.appraisals a
      WHERE a.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- announcements
DROP POLICY IF EXISTS "Auth read announcements" ON public.announcements;
CREATE POLICY "Company read announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- ─── 2. Fix can_access_row: resolve branch_id through branches table ─────────

CREATE OR REPLACE FUNCTION public.can_access_row(
  row_company_id text,
  row_branch_code text DEFAULT NULL,
  row_assigned_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_company_id   text;
  v_access_scope text;
  v_branch_id    uuid;
  v_branch_code  text;
BEGIN
  SELECT company_id, access_scope, branch_id
    INTO v_company_id, v_access_scope, v_branch_id
    FROM public.profiles
   WHERE id = auth.uid();

  IF NOT FOUND THEN RETURN false; END IF;

  -- Global scope (super_admin) can see everything
  IF v_access_scope = 'global' THEN RETURN true; END IF;

  -- Company isolation: must match company
  IF row_company_id != v_company_id THEN RETURN false; END IF;

  -- Company scope: can see all in company
  IF v_access_scope = 'company' THEN RETURN true; END IF;

  -- Branch scope: resolve branch_id (UUID) to branch code, then compare
  IF v_access_scope = 'branch' THEN
    IF v_branch_id IS NULL OR row_branch_code IS NULL THEN RETURN false; END IF;
    SELECT code INTO v_branch_code FROM public.branches WHERE id = v_branch_id;
    IF NOT FOUND THEN RETURN false; END IF;
    RETURN row_branch_code = v_branch_code;
  END IF;

  -- Self scope: must be assigned to user
  IF v_access_scope = 'self' THEN
    RETURN row_assigned_user_id = auth.uid();
  END IF;

  RETURN false;
END;
$$;

-- ─── 3. Fix tickets: 'admin' → 'company_admin' ──────────────────────────────

DROP POLICY IF EXISTS "tickets_select_admin" ON public.tickets;
CREATE POLICY "tickets_select_admin" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND company_id = tickets.company_id
         AND role IN ('company_admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "tickets_update_admin" ON public.tickets;
CREATE POLICY "tickets_update_admin" ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND company_id = tickets.company_id
         AND role IN ('company_admin', 'super_admin')
    )
  );

-- ─── 4. Profiles: scope SELECT to same company ──────────────────────────────

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );
