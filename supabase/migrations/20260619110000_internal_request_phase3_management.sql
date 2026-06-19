-- Internal Request Module Phase 3: management, reporting, admin control

alter table public.request_module_settings
  add column if not exists status_labels jsonb not null default '{}'::jsonb,
  add column if not exists notification_templates jsonb not null default '{}'::jsonb,
  add column if not exists closure_rules jsonb not null default '{}'::jsonb,
  add column if not exists priority_matrix jsonb not null default '{}'::jsonb,
  add column if not exists role_permissions jsonb not null default '{}'::jsonb,
  add column if not exists allowed_file_types jsonb not null default '[]'::jsonb;

create table if not exists public.request_saved_filters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  scope text not null default 'queue',
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_saved_filters_scope_check check (scope in ('queue', 'reports')),
  constraint request_saved_filters_name_check check (length(trim(name)) between 2 and 80)
);

create unique index if not exists request_saved_filters_company_user_scope_name_idx
  on public.request_saved_filters(company_id, user_id, scope, lower(name));

alter table public.request_saved_filters enable row level security;

drop policy if exists "Users manage own request saved filters" on public.request_saved_filters;
create policy "Users manage own request saved filters"
  on public.request_saved_filters
  for all
  using (auth.uid() = user_id and public.is_user_in_company(company_id))
  with check (auth.uid() = user_id and public.is_user_in_company(company_id));

create or replace function public.set_request_saved_filters_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists request_saved_filters_updated_at on public.request_saved_filters;
create trigger request_saved_filters_updated_at
  before update on public.request_saved_filters
  for each row execute function public.set_request_saved_filters_updated_at();

alter table public.ticket_activity
  drop constraint if exists ticket_activity_event_type_check;

alter table public.ticket_activity
  add constraint ticket_activity_event_type_check check (
    event_type in (
      'status_changed',
      'owner_changed',
      'resolution_note_updated',
      'priority_changed',
      'comment_added',
      'request_created',
      'category_changed',
      'subcategory_changed',
      'sla_paused',
      'sla_resumed',
      'sla_breached',
      'requester_update_submitted',
      'owner_requested_more_information',
      'owner_completed_request',
      'requester_closed_request',
      'attachment_added',
      'escalation_triggered',
      'admin_manual_override',
      'internal_note_added',
      'duplicate_linked',
      'request_reopened',
      'closure_feedback_submitted',
      'bulk_action_performed',
      'report_exported',
      'saved_filter_changed',
      'configuration_changed'
    )
  );
