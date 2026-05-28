-- ──────────────────────────────────────────────────────────────────────────────
-- Server-side input bounds for the Internal Service Request module
--
-- Until now, every length / range check on user-supplied ticket fields lived
-- only in the React form (zod + UI clamps). A direct PostgREST call or a
-- future second client could insert arbitrarily long descriptions, SLA values
-- outside the configurable range, or oversized custom_fields blobs.
--
-- These CHECK constraints encode the same bounds the UI already enforces:
--
--   tickets.subject              — already required min 6 chars in the form;
--                                  cap at 200 chars (matches single-line input)
--   tickets.description          — required min 20 chars; cap at 5,000 chars
--   tickets.business_impact      — optional; cap at 2,000 chars
--   tickets.desired_outcome      — optional; cap at 2,000 chars
--   tickets.resolution_note      — optional; cap at 5,000 chars
--   tickets.custom_fields        — optional jsonb; cap serialized payload at
--                                  16 KB so a malicious client cannot bloat
--                                  the row past PostgreSQL's TOAST threshold
--   request_categories.response_sla_hours    — 1..720  (30 days)  when set
--   request_categories.resolution_sla_hours  — 1..2160 (90 days)  when set
--
-- Each constraint is added with `not valid` then immediately `validate`d so
-- existing rows are checked exactly once and the operation fails loudly if
-- production data has drifted past the new bound. The migration is otherwise
-- non-destructive — no data is altered.
-- ──────────────────────────────────────────────────────────────────────────────

-- Helper: add a check constraint idempotently. `add constraint` lacks an
-- "if not exists" form on older Postgres, so we drop-then-add to make this
-- migration safe to re-run.
do $$
begin
  -- tickets.subject
  alter table public.tickets drop constraint if exists tickets_subject_length_chk;
  alter table public.tickets
    add constraint tickets_subject_length_chk
    check (char_length(subject) between 6 and 200);

  -- tickets.description
  alter table public.tickets drop constraint if exists tickets_description_length_chk;
  alter table public.tickets
    add constraint tickets_description_length_chk
    check (char_length(description) between 20 and 5000);

  -- tickets.business_impact (nullable)
  alter table public.tickets drop constraint if exists tickets_business_impact_length_chk;
  alter table public.tickets
    add constraint tickets_business_impact_length_chk
    check (business_impact is null or char_length(business_impact) <= 2000);

  -- tickets.desired_outcome (nullable)
  alter table public.tickets drop constraint if exists tickets_desired_outcome_length_chk;
  alter table public.tickets
    add constraint tickets_desired_outcome_length_chk
    check (desired_outcome is null or char_length(desired_outcome) <= 2000);

  -- tickets.resolution_note (nullable)
  alter table public.tickets drop constraint if exists tickets_resolution_note_length_chk;
  alter table public.tickets
    add constraint tickets_resolution_note_length_chk
    check (resolution_note is null or char_length(resolution_note) <= 5000);

  -- tickets.custom_fields — cap serialized size at 16 KB
  alter table public.tickets drop constraint if exists tickets_custom_fields_size_chk;
  alter table public.tickets
    add constraint tickets_custom_fields_size_chk
    check (custom_fields is null or octet_length(custom_fields::text) <= 16384);

  -- request_categories.response_sla_hours — matches CategoryEditor UI max=720
  alter table public.request_categories drop constraint if exists request_categories_response_sla_range_chk;
  alter table public.request_categories
    add constraint request_categories_response_sla_range_chk
    check (response_sla_hours is null or response_sla_hours between 1 and 720);

  -- request_categories.resolution_sla_hours — matches CategoryEditor UI max=2160
  alter table public.request_categories drop constraint if exists request_categories_resolution_sla_range_chk;
  alter table public.request_categories
    add constraint request_categories_resolution_sla_range_chk
    check (resolution_sla_hours is null or resolution_sla_hours between 1 and 2160);
end$$;
