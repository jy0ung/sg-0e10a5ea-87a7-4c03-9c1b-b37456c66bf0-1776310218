-- Internal Request Phase 1 workflow/accountability foundation.
-- Keeps the existing ticket table but standardizes statuses and adds columns
-- required for automated next-action, ownership, and SLA accountability.

alter table public.tickets
  drop constraint if exists tickets_status_check;

update public.tickets
   set status = case status
     when 'awaiting_requester' then 'pending_requester'
     when 'resolved' then 'completed_by_owner'
     else status
   end
 where status in ('awaiting_requester', 'resolved');

alter table public.tickets
  add constraint tickets_status_check
    check (status in (
      'open',
      'in_progress',
      'pending_requester',
      'pending_owner_review',
      'completed_by_owner',
      'closed',
      'reopened',
      'cancelled'
    ));

alter table public.tickets
  add column if not exists backup_owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists escalation_owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists responsible_queue text not null default 'Unassigned',
  add column if not exists current_responsible_party text not null default 'Owner',
  add column if not exists next_action text not null default 'Owner to review request',
  add column if not exists status_changed_at timestamptz not null default now(),
  add column if not exists last_action_by uuid references public.profiles(id) on delete set null,
  add column if not exists sla_status text not null default 'on_track',
  add column if not exists sla_paused_at timestamptz,
  add column if not exists sla_pause_duration_ms bigint not null default 0,
  add column if not exists sla_breach_reason text;

alter table public.tickets
  drop constraint if exists tickets_sla_status_check;

alter table public.tickets
  add constraint tickets_sla_status_check
    check (sla_status in ('on_track', 'at_risk', 'breached', 'paused'));

create index if not exists tickets_company_workflow_idx
  on public.tickets (company_id, status, current_responsible_party, updated_at desc);

create index if not exists tickets_company_sla_status_idx
  on public.tickets (company_id, sla_status, resolution_due_at);

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
      'admin_manual_override'
    ));

create table if not exists public.request_module_settings (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  request_title_placeholder text not null default 'Customer Name',
  sla_at_risk_threshold_hours integer not null default 4,
  pause_sla_on_pending_requester boolean not null default true,
  sla_start_event text not null default 'submitted',
  default_fallback_queue text not null default 'Unassigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint request_module_settings_company_key unique (company_id),
  constraint request_module_settings_sla_threshold_check check (sla_at_risk_threshold_hours between 1 and 240),
  constraint request_module_settings_sla_start_event_check check (sla_start_event in ('submitted', 'assigned'))
);

alter table public.request_module_settings enable row level security;

drop policy if exists "request_module_settings_select_scoped" on public.request_module_settings;
create policy "request_module_settings_select_scoped"
  on public.request_module_settings
  for select to authenticated
  using (public.is_same_company(company_id));

drop policy if exists "request_module_settings_insert_admin" on public.request_module_settings;
create policy "request_module_settings_insert_admin"
  on public.request_module_settings
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

drop policy if exists "request_module_settings_update_admin" on public.request_module_settings;
create policy "request_module_settings_update_admin"
  on public.request_module_settings
  for update to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

create or replace function public.set_request_module_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists request_module_settings_updated_at on public.request_module_settings;
create trigger request_module_settings_updated_at
  before update on public.request_module_settings
  for each row execute function public.set_request_module_settings_updated_at();

create or replace function public.tickets_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();

  if new.status is distinct from old.status then
    new.status_changed_at = now();
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is null then
      new.assigned_at = null;
      new.responsible_queue = coalesce(nullif(new.responsible_queue, ''), 'Unassigned');
    else
      new.assigned_at = now();
      new.responsible_queue = 'Owner';
    end if;
  end if;

  if new.first_responded_at is null then
    if new.assigned_to is not null and old.assigned_to is null then
      new.first_responded_at = now();
    elsif old.status = 'open' and new.status in ('in_progress', 'pending_requester', 'pending_owner_review', 'completed_by_owner', 'closed') then
      new.first_responded_at = now();
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'closed' then
      new.resolved_at = now();
    elsif old.status = 'closed' and new.status <> 'closed' then
      new.resolved_at = null;
    end if;
  end if;

  new.current_responsible_party = case new.status
    when 'open' then 'Owner'
    when 'in_progress' then 'Owner'
    when 'pending_requester' then 'Requester'
    when 'pending_owner_review' then 'Owner'
    when 'completed_by_owner' then 'Requester'
    when 'reopened' then 'Owner'
    when 'closed' then 'None'
    when 'cancelled' then 'None'
    else coalesce(nullif(new.current_responsible_party, ''), 'Owner')
  end;

  new.next_action = case new.status
    when 'open' then 'Owner to review request'
    when 'in_progress' then 'Owner to resolve request'
    when 'pending_requester' then 'Requester to provide information'
    when 'pending_owner_review' then 'Owner to review requester response'
    when 'completed_by_owner' then 'Requester to confirm and close'
    when 'reopened' then 'Owner to review reopened request'
    when 'closed' then 'No further action'
    when 'cancelled' then 'No further action'
    else coalesce(nullif(new.next_action, ''), 'Owner to review request')
  end;

  return new;
end;
$$;

create or replace function public.cancel_own_ticket(
  p_ticket_id uuid,
  p_cancellation_note text default null
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  cancelled_ticket public.tickets;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to cancel a request';
  end if;

  update public.tickets
     set status = 'cancelled',
         resolution_note = coalesce(nullif(btrim(p_cancellation_note), ''), 'Cancelled by requester.'),
         last_action_by = auth.uid()
   where id = p_ticket_id
     and submitted_by = auth.uid()
     and status = 'open'
     and assigned_to is null
   returning * into cancelled_ticket;

  if cancelled_ticket.id is null then
    raise exception 'Request can only be cancelled while open and unassigned';
  end if;

  return cancelled_ticket;
end;
$$;
