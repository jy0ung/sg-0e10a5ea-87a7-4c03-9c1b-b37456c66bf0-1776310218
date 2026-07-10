-- Align ticket completion categories with the canonical ticket workflow model.
-- Keep legacy values valid during rollout so existing rows and older clients do not fail.

alter table public.tickets
  drop constraint if exists tickets_completion_category_check;

alter table public.tickets
  add constraint tickets_completion_category_check
    check (
      completion_category is null
      or completion_category in (
        'resolved',
        'partially_resolved',
        'escalated',
        'transferred',
        'no_action_needed',
        'other',
        -- legacy compatibility
        'rejected',
        'duplicate',
        'cancelled',
        'not_applicable'
      )
    );
