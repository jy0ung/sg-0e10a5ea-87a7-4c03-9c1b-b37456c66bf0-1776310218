-- ──────────────────────────────────────────────────────────────────────────────
-- Category-level approval flow pinning
-- Adds an optional FK from request_categories → approval_flows so admins can
-- pin a specific flow to a category. When set, this takes priority over the
-- condition-based flow-resolution scorer.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.request_categories
  add column if not exists approval_flow_id uuid
    references public.approval_flows (id) on delete set null;

comment on column public.request_categories.approval_flow_id is
  'When non-null, requests in this category always use this approval flow, '
  'bypassing the condition-based flow scorer.';
