-- Migration: Department-scoped approval flows
-- Adds department_id, is_default, and updated_by columns to approval_flows.
-- Each approval flow can now be scoped to a specific department, or remain
-- as a company-wide default fallback.
--
-- Resolution priority (enforced by application logic):
--   1. Active flow with matching department_id (department-specific)
--   2. Active flow with is_default = true and department_id IS NULL (default)
--   3. Any active flow with department_id IS NULL (backward compat)
--   4. null — no flow configured

ALTER TABLE public.approval_flows
  ADD COLUMN IF NOT EXISTS department_id uuid
    REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Fast lookup index for department-scoped queries
CREATE INDEX IF NOT EXISTS idx_approval_flows_dept
  ON public.approval_flows (company_id, entity_type, department_id)
  WHERE department_id IS NOT NULL;

-- Enforce at most one active department-specific flow per (company, entity_type, department)
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_flows_dept_active
  ON public.approval_flows (company_id, entity_type, department_id)
  WHERE is_active = true AND department_id IS NOT NULL;

-- Enforce at most one active default flow per (company, entity_type)
-- Only applies to rows where is_default = true and department_id IS NULL.
-- Existing rows have is_default = false (the column default), so this constraint
-- is safe to add without touching existing data.
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_flows_default_active
  ON public.approval_flows (company_id, entity_type)
  WHERE is_active = true AND is_default = true AND department_id IS NULL;

COMMENT ON COLUMN public.approval_flows.department_id IS
  'Scopes this flow to a specific department. NULL = company-wide (default or fallback based on is_default).';

COMMENT ON COLUMN public.approval_flows.is_default IS
  'True = preferred fallback when no department-specific flow is found. '
  'At most one active default per (company_id, entity_type) is enforced by uq_approval_flows_default_active.';

COMMENT ON COLUMN public.approval_flows.updated_by IS
  'Profile ID of the last user to update this flow.';
