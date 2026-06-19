-- Internal Request Phase 2: collaboration, request quality, closure control,
-- duplicate links, internal notes, read receipts, and reopen metadata.

alter table public.request_form_fields
  add column if not exists options jsonb not null default '[]'::jsonb,
  add column if not exists default_value text not null default '',
  add column if not exists validation_rules jsonb not null default '{}'::jsonb,
  add column if not exists conditional_logic jsonb not null default '{}'::jsonb;

alter table public.request_form_fields
  drop constraint if exists request_form_fields_field_type_check;

alter table public.request_form_fields
  add constraint request_form_fields_field_type_check
    check (field_type in (
      'text',
      'textarea',
      'number',
      'date',
      'database_select',
      'select',
      'multiselect',
      'checkbox',
      'radio',
      'file'
    ));

alter table public.tickets
  add column if not exists completion_category text,
  add column if not exists completion_checklist_confirmed boolean not null default false,
  add column if not exists completion_attachment_required boolean not null default false,
  add column if not exists closure_confirmed boolean not null default false,
  add column if not exists satisfaction_rating integer,
  add column if not exists closure_feedback text,
  add column if not exists closed_at timestamptz,
  add column if not exists reopen_count integer not null default 0,
  add column if not exists reopened_at timestamptz,
  add column if not exists last_reopen_reason text,
  add column if not exists previous_owner_id uuid references public.profiles(id) on delete set null;

alter table public.tickets
  drop constraint if exists tickets_completion_category_check,
  drop constraint if exists tickets_satisfaction_rating_check;

alter table public.tickets
  add constraint tickets_completion_category_check
    check (completion_category is null or completion_category in ('resolved', 'rejected', 'duplicate', 'cancelled', 'not_applicable')),
  add constraint tickets_satisfaction_rating_check
    check (satisfaction_rating is null or satisfaction_rating between 1 and 5);

create table if not exists public.ticket_chat_reads (
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  company_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

alter table public.ticket_chat_reads enable row level security;

drop policy if exists "ticket_chat_reads_select_own" on public.ticket_chat_reads;
create policy "ticket_chat_reads_select_own" on public.ticket_chat_reads
  for select to authenticated
  using (user_id = auth.uid() and public.is_same_company(company_id));

drop policy if exists "ticket_chat_reads_upsert_own" on public.ticket_chat_reads;
create policy "ticket_chat_reads_upsert_own" on public.ticket_chat_reads
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_same_company(company_id));

drop policy if exists "ticket_chat_reads_update_own" on public.ticket_chat_reads;
create policy "ticket_chat_reads_update_own" on public.ticket_chat_reads
  for update to authenticated
  using (user_id = auth.uid() and public.is_same_company(company_id))
  with check (user_id = auth.uid() and public.is_same_company(company_id));

create table if not exists public.ticket_internal_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  company_id text not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  note text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ticket_internal_notes_ticket_created_idx
  on public.ticket_internal_notes (ticket_id, created_at desc);

alter table public.ticket_internal_notes enable row level security;

drop policy if exists "ticket_internal_notes_select_internal" on public.ticket_internal_notes;
create policy "ticket_internal_notes_select_internal" on public.ticket_internal_notes
  for select to authenticated
  using (
    public.is_same_company(company_id)
    and (
      public.current_role() in ('super_admin', 'company_admin', 'portal_admin', 'portal_manager')
      or exists (
        select 1 from public.tickets t
         where t.id = ticket_internal_notes.ticket_id
           and t.company_id = ticket_internal_notes.company_id
           and (
             t.assigned_to = auth.uid()
             or t.backup_owner_id = auth.uid()
             or t.escalation_owner_id = auth.uid()
           )
      )
    )
  );

drop policy if exists "ticket_internal_notes_insert_internal" on public.ticket_internal_notes;
create policy "ticket_internal_notes_insert_internal" on public.ticket_internal_notes
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and (
      public.current_role() in ('super_admin', 'company_admin', 'portal_admin', 'portal_manager')
      or exists (
        select 1 from public.tickets t
         where t.id = ticket_internal_notes.ticket_id
           and t.company_id = ticket_internal_notes.company_id
           and (
             t.assigned_to = auth.uid()
             or t.backup_owner_id = auth.uid()
             or t.escalation_owner_id = auth.uid()
           )
      )
    )
  );

create table if not exists public.ticket_closure_feedback (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  company_id text not null,
  requester_id uuid not null references auth.users(id) on delete cascade,
  confirmed_resolved boolean not null,
  satisfaction_rating integer not null check (satisfaction_rating between 1 and 5),
  feedback_comment text,
  created_at timestamptz not null default now()
);

alter table public.ticket_closure_feedback enable row level security;

drop policy if exists "ticket_closure_feedback_select_scoped" on public.ticket_closure_feedback;
create policy "ticket_closure_feedback_select_scoped" on public.ticket_closure_feedback
  for select to authenticated
  using (
    public.is_same_company(company_id)
    and (
      requester_id = auth.uid()
      or public.current_role() in ('super_admin', 'company_admin', 'portal_admin', 'portal_manager')
    )
  );

drop policy if exists "ticket_closure_feedback_insert_requester" on public.ticket_closure_feedback;
create policy "ticket_closure_feedback_insert_requester" on public.ticket_closure_feedback
  for insert to authenticated
  with check (requester_id = auth.uid() and public.is_same_company(company_id));

create table if not exists public.ticket_duplicate_links (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  duplicate_of_ticket_id uuid not null references public.tickets(id) on delete cascade,
  linked_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint ticket_duplicate_links_no_self check (ticket_id <> duplicate_of_ticket_id)
);

create index if not exists ticket_duplicate_links_ticket_idx
  on public.ticket_duplicate_links (ticket_id);

alter table public.ticket_duplicate_links enable row level security;

drop policy if exists "ticket_duplicate_links_select_scoped" on public.ticket_duplicate_links;
create policy "ticket_duplicate_links_select_scoped" on public.ticket_duplicate_links
  for select to authenticated
  using (public.is_same_company(company_id));

drop policy if exists "ticket_duplicate_links_insert_scoped" on public.ticket_duplicate_links;
create policy "ticket_duplicate_links_insert_scoped" on public.ticket_duplicate_links
  for insert to authenticated
  with check (linked_by = auth.uid() and public.is_same_company(company_id));

alter table public.request_module_settings
  add column if not exists reopen_window_days integer not null default 7,
  add column if not exists chat_attachment_max_files integer not null default 5;

alter table public.request_module_settings
  drop constraint if exists request_module_settings_reopen_window_days_check,
  drop constraint if exists request_module_settings_chat_attachment_max_files_check;

alter table public.request_module_settings
  add constraint request_module_settings_reopen_window_days_check
    check (reopen_window_days between 0 and 90),
  add constraint request_module_settings_chat_attachment_max_files_check
    check (chat_attachment_max_files between 1 and 20);

alter table public.ticket_activity
  drop constraint if exists ticket_activity_event_type_check;

alter table public.ticket_activity
  add constraint ticket_activity_event_type_check
    check (event_type in (
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
      'closure_feedback_submitted'
    ));

create or replace function public.set_ticket_internal_notes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ticket_internal_notes_updated_at on public.ticket_internal_notes;
create trigger ticket_internal_notes_updated_at
  before update on public.ticket_internal_notes
  for each row execute function public.set_ticket_internal_notes_updated_at();
