-- ─── Leave Quota Rules ───────────────────────────────────────────────────────
--
-- Allows GM/Admin to define the maximum number of employees that may be on
-- leave simultaneously for a given leave type, branch, department, and period.
--
-- Design notes:
--   • Quota enforcement is applied in the service layer on createLeaveRequest().
--     True server-side enforcement would require a trigger or edge function;
--     the service layer check is defence-in-depth above RLS.
--   • Pending requests count toward the quota when count_pending = true.
--   • Half-day requests contribute half_day_weight slots (default 0.5).
--   • Rules with a more specific scope (branch + dept) take priority over
--     company-wide rules when multiple rules match the same employee.
--   • Rules are deactivated (is_active = false) rather than hard-deleted so
--     historical records are preserved for audit purposes.
--
-- Priority when multiple rules match an employee for a date:
--   1. branch_id + department_id  (most specific)
--   2. department_id only
--   3. branch_id only
--   4. company-wide (branch_id IS NULL AND department_id IS NULL)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leave_quota_rules (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      text          NOT NULL,
  rule_name       text          NOT NULL,
  leave_type_id   uuid          NOT NULL
                    REFERENCES public.leave_types(id) ON DELETE CASCADE,

  -- Scope: NULL means the rule applies to all branches / departments.
  branch_id       text,
  department_id   uuid          REFERENCES public.departments(id) ON DELETE SET NULL,

  -- How the quota window is calculated.
  period_type     text          NOT NULL DEFAULT 'daily'
                    CHECK (period_type IN ('daily', 'weekly', 'monthly', 'date_range')),

  -- Inclusive dates during which this rule is in effect.
  effective_from  date          NOT NULL,
  effective_to    date,         -- NULL = no expiry (open-ended); required for date_range

  -- Maximum concurrent leave slots allowed within the quota window.
  max_requests    integer       NOT NULL DEFAULT 3
                    CHECK (max_requests >= 1),

  -- Whether pending (not yet approved) requests count toward the quota.
  count_pending   boolean       NOT NULL DEFAULT true,

  -- Contribution of a half-day leave to the quota slot count.
  -- 0.5 = counts as half a slot; 1.0 = counts as a full slot.
  half_day_weight numeric(3,2)  NOT NULL DEFAULT 0.5
                    CHECK (half_day_weight IN (0.5, 1.0)),

  is_active       boolean       NOT NULL DEFAULT true,
  remarks         text,

  created_by      uuid          REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by      uuid          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_quota_rules ENABLE ROW LEVEL SECURITY;

-- Indexes for common query patterns
CREATE INDEX idx_leave_quota_rules_company
  ON public.leave_quota_rules (company_id);

CREATE INDEX idx_leave_quota_rules_lookup
  ON public.leave_quota_rules (company_id, leave_type_id, is_active);

CREATE INDEX idx_leave_quota_rules_dates
  ON public.leave_quota_rules (effective_from, effective_to);

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

-- All authenticated company members can read rules (required for submission
-- validation so employees see quota warnings before they submit).
CREATE POLICY "Company members can read leave_quota_rules"
  ON public.leave_quota_rules FOR SELECT
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND access_scope = 'global'
    )
  );

-- Only GM / Admin roles may create quota rules.
CREATE POLICY "GM can insert leave_quota_rules"
  ON public.leave_quota_rules FOR INSERT
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'company_admin', 'general_manager')
    )
  );

-- Only GM / Admin roles may update quota rules.
CREATE POLICY "GM can update leave_quota_rules"
  ON public.leave_quota_rules FOR UPDATE
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'company_admin', 'general_manager')
    )
  );

-- GM / Admin may hard-delete quota rules (e.g. to remove test rules).
-- Prefer deactivating (is_active = false) for production audit trails.
CREATE POLICY "GM can delete leave_quota_rules"
  ON public.leave_quota_rules FOR DELETE
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'company_admin', 'general_manager')
    )
  );
