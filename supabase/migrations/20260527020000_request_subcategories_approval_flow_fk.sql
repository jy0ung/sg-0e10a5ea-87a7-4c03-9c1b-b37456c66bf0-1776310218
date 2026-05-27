-- ──────────────────────────────────────────────────────────────────────────────
-- Subcategory-level approval flow pinning
-- Adds an optional FK from request_subcategories → approval_flows so admins
-- can pin a specific flow to a single subcategory. When set, this takes
-- priority over the category-level pin and over the condition-based scorer.
--
-- Resolution order (most specific wins):
--   1. request_subcategories.approval_flow_id  (this migration)
--   2. request_categories.approval_flow_id     (migration 20260518030000)
--   3. resolveApprovalFlowId() condition scorer
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.request_subcategories
  add column if not exists approval_flow_id uuid
    references public.approval_flows (id) on delete set null;

comment on column public.request_subcategories.approval_flow_id is
  'When non-null, requests filed under this subcategory always use this '
  'approval flow, taking priority over the parent category pin and the '
  'condition-based flow scorer.';
