alter table public.request_categories
  add column if not exists response_sla_hours integer,
  add column if not exists resolution_sla_hours integer;

alter table public.request_categories
  drop constraint if exists request_categories_response_sla_hours_check,
  drop constraint if exists request_categories_resolution_sla_hours_check;

alter table public.request_categories
  add constraint request_categories_response_sla_hours_check
    check (response_sla_hours is null or response_sla_hours between 1 and 720),
  add constraint request_categories_resolution_sla_hours_check
    check (resolution_sla_hours is null or resolution_sla_hours between 1 and 2160);

comment on column public.request_categories.response_sla_hours is
  'Optional first-response SLA target in calendar hours for new requests in this category.';
comment on column public.request_categories.resolution_sla_hours is
  'Optional resolution SLA target in calendar hours for new requests in this category.';

alter table public.tickets
  add column if not exists first_response_due_at timestamptz,
  add column if not exists resolution_due_at timestamptz,
  add column if not exists first_responded_at timestamptz;

alter table public.tickets
  drop constraint if exists tickets_status_check;

alter table public.tickets
  add constraint tickets_status_check
    check (status in ('open', 'in_progress', 'awaiting_requester', 'resolved', 'closed', 'cancelled'));

comment on column public.tickets.first_response_due_at is
  'Computed first-response SLA deadline copied from the request category when the request is created.';
comment on column public.tickets.resolution_due_at is
  'Computed resolution SLA deadline copied from the request category when the request is created.';
comment on column public.tickets.first_responded_at is
  'Timestamp of the first owner/admin response or operational action on the request.';

create index if not exists tickets_company_first_response_due_idx
  on public.tickets (company_id, first_response_due_at)
  where first_response_due_at is not null and first_responded_at is null;

create index if not exists tickets_company_resolution_due_idx
  on public.tickets (company_id, resolution_due_at)
  where resolution_due_at is not null and status not in ('resolved', 'closed', 'cancelled');

create or replace function public.tickets_apply_request_sla_targets()
returns trigger
language plpgsql
as $$
declare
  category_response_hours integer;
  category_resolution_hours integer;
  base_time timestamptz;
begin
  if tg_op = 'UPDATE' then
    if new.category is not distinct from old.category and new.company_id is not distinct from old.company_id then
      return new;
    end if;
  end if;

  select response_sla_hours, resolution_sla_hours
    into category_response_hours, category_resolution_hours
    from public.request_categories
   where company_id = new.company_id
     and category_key = new.category;

  base_time := coalesce(new.created_at, now());

  new.first_response_due_at := case
    when category_response_hours is null then null
    else base_time + make_interval(hours => category_response_hours)
  end;

  new.resolution_due_at := case
    when category_resolution_hours is null then null
    else base_time + make_interval(hours => category_resolution_hours)
  end;

  return new;
end;
$$;

drop trigger if exists tickets_apply_request_sla_targets on public.tickets;
create trigger tickets_apply_request_sla_targets
  before insert or update of company_id, category on public.tickets
  for each row execute function public.tickets_apply_request_sla_targets();

create or replace function public.tickets_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();

  if new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is null then
      new.assigned_at = null;
    else
      new.assigned_at = now();
    end if;
  end if;

  if new.first_responded_at is null then
    if new.assigned_to is not null and old.assigned_to is null then
      new.first_responded_at = now();
    elsif old.status = 'open' and new.status in ('in_progress', 'awaiting_requester', 'resolved', 'closed') then
      new.first_responded_at = now();
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('resolved', 'closed', 'cancelled') then
      new.resolved_at = now();
    else
      new.resolved_at = null;
    end if;
  end if;

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
         resolution_note = coalesce(nullif(btrim(p_cancellation_note), ''), 'Cancelled by requester.')
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

revoke all on function public.cancel_own_ticket(uuid, text) from public;
grant execute on function public.cancel_own_ticket(uuid, text) to authenticated;