-- ============================================================
-- P0 Fixes: leave_types columns, manager_id, payroll RLS,
--           approval execution tables
-- ============================================================

-- ─── 1. Add missing columns to leave_types ───────────────────────────────────
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS default_days   NUMERIC(5,1) NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS carry_forward  BOOLEAN      NOT NULL DEFAULT true;

COMMENT ON COLUMN public.leave_types.default_days  IS 'Entitled days per year used as the base when rolling over balances.';
COMMENT ON COLUMN public.leave_types.carry_forward IS 'Whether unused days carry over to the next year.';

-- Back-fill: copy days_per_year → default_days for existing rows
UPDATE public.leave_types SET default_days = days_per_year WHERE default_days = 14;

-- ─── 2. Add manager_id to profiles ───────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.manager_id IS 'Direct line manager of this employee (used to resolve direct_manager approval steps).';

CREATE INDEX IF NOT EXISTS profiles_manager_id_idx ON public.profiles (manager_id);

-- ─── 3. Fix payroll RLS — restrict read to own records + payroll roles ────────
-- payroll_runs: only payroll roles
DROP POLICY IF EXISTS "Auth read payroll_runs"  ON public.payroll_runs;
CREATE POLICY "Payroll roles read payroll_runs"
  ON public.payroll_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin','company_admin','general_manager')
    )
  );

-- payroll_items: each employee can read their own row; payroll roles see all
DROP POLICY IF EXISTS "Auth read payroll_items" ON public.payroll_items;
CREATE POLICY "Employees read own payroll_items"
  ON public.payroll_items FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin','company_admin','general_manager')
    )
  );

-- ─── 4. Approval execution tables ────────────────────────────────────────────

-- approval_requests: one row per entity instance going through a flow
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        text        NOT NULL,
  entity_type       text        NOT NULL CHECK (entity_type IN ('leave_request','payroll_run','appraisal','general')),
  entity_id         uuid        NOT NULL,
  flow_id           uuid        NOT NULL REFERENCES public.approval_flows (id) ON DELETE RESTRICT,
  requester_id      uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  current_step_order int        NOT NULL DEFAULT 1,
  status            text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Only one active request per entity at a time
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_entity_active_key
  ON public.approval_requests (entity_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS approval_requests_company_status_idx
  ON public.approval_requests (company_id, status);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read approval_requests"
  ON public.approval_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert approval_requests"
  ON public.approval_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Managers update approval_requests"
  ON public.approval_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin','company_admin','director','general_manager','manager')
    )
  );

-- approval_decisions: one row per step decision
CREATE TABLE IF NOT EXISTS public.approval_decisions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id   uuid        NOT NULL REFERENCES public.approval_requests (id) ON DELETE CASCADE,
  step_id               uuid        NOT NULL REFERENCES public.approval_steps (id) ON DELETE RESTRICT,
  approver_id           uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  decision              text        NOT NULL CHECK (decision IN ('approved','rejected')),
  note                  text,
  decided_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_decisions_request_idx
  ON public.approval_decisions (approval_request_id);

ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read approval_decisions"
  ON public.approval_decisions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers insert approval_decisions"
  ON public.approval_decisions FOR INSERT TO authenticated
  WITH CHECK (approver_id = auth.uid());

-- ─── 5. Auto-update updated_at on approval_requests ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_touch_approval_request()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_approval_request ON public.approval_requests;
CREATE TRIGGER trg_touch_approval_request
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_approval_request();
