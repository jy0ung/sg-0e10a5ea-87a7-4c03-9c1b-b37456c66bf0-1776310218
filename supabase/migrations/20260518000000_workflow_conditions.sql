-- ====================================================================
-- Migration: Workflow Conditions — condition-based approval flow matching
-- ====================================================================
-- Transforms "Applies To" (one-flow-per-entity-type) into "Workflow Type"
-- with condition-based multi-flow matching.
--
-- Changes:
--   1. Add `conditions` JSONB column — stores the condition set for matching.
--   2. Add `match_priority` integer — admin tiebreaker when flows tie.
--   3. Drop `uq_approval_flows_dept_active` — department uniqueness now
--      enforced at the application layer (specificity scoring).
--   4. Keep `uq_approval_flows_default_active` — one default per entity type.
--   5. Migrate existing department_id values into conditions JSONB.
--   6. Add supporting indexes.
-- ====================================================================

-- 1. Add new columns
ALTER TABLE public.approval_flows
  ADD COLUMN IF NOT EXISTS conditions     jsonb,
  ADD COLUMN IF NOT EXISTS match_priority integer NOT NULL DEFAULT 0;

-- 2. Migrate existing department_id values into conditions
--    Existing rows with a department_id get conditions = {"departmentId": "<uuid>"}
UPDATE public.approval_flows
SET conditions = jsonb_build_object('departmentId', department_id::text)
WHERE department_id IS NOT NULL
  AND conditions IS NULL;

-- 3. Drop the one-per-(company, entity_type, department) unique constraint.
--    Enforcement moves to application-layer specificity scoring + ambiguity check.
DROP INDEX IF EXISTS uq_approval_flows_dept_active;

-- 4. uq_approval_flows_default_active is preserved unchanged:
--    only one active is_default=true flow per (company_id, entity_type).

-- 5. GIN index for condition-based queries
CREATE INDEX IF NOT EXISTS idx_approval_flows_conditions
  ON public.approval_flows USING GIN (conditions jsonb_path_ops)
  WHERE conditions IS NOT NULL;

-- 6. Index to speed up match_priority ordering on the hot resolution path
CREATE INDEX IF NOT EXISTS idx_approval_flows_match_priority
  ON public.approval_flows (company_id, entity_type, match_priority DESC)
  WHERE is_active = true;

-- 7. Column comments
COMMENT ON COLUMN public.approval_flows.conditions IS
  'JSONB condition set for flow matching. Supported keys: '
  'departmentId (uuid), branchId (uuid), requesterRole (text), '
  'categoryKey (text), subcategoryKey (text), '
  'amountMin (numeric), amountMax (numeric), priority (text). '
  'NULL = matches all contexts (combine with is_default=true for the fallback). '
  'The most specific matching flow wins; ties broken by match_priority DESC.';

COMMENT ON COLUMN public.approval_flows.match_priority IS
  'Admin-controlled tiebreaker. When two active flows match with equal '
  'specificity, the one with the higher match_priority value is selected. '
  'Range 0–100; default 0.';
