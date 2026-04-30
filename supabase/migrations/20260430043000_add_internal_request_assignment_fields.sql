alter table public.tickets
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

alter table public.tickets
  add column if not exists assigned_at timestamptz;

alter table public.tickets
  add column if not exists resolved_at timestamptz;

alter table public.tickets
  add column if not exists resolution_note text;

comment on column public.tickets.assigned_to is 'Current request owner responsible for triage or completion.';
comment on column public.tickets.assigned_at is 'Timestamp when the current request owner was assigned.';
comment on column public.tickets.resolved_at is 'Timestamp when the request entered a resolved or closed state.';
comment on column public.tickets.resolution_note is 'Requester-facing note explaining the final outcome or next action.';

update public.tickets
   set resolved_at = coalesce(resolved_at, updated_at, created_at)
 where status in ('resolved', 'closed')
   and resolved_at is null;

create index if not exists idx_tickets_company_assigned_to on public.tickets (company_id, assigned_to);

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

  if new.status is distinct from old.status then
    if new.status in ('resolved', 'closed') then
      new.resolved_at = now();
    else
      new.resolved_at = null;
    end if;
  end if;

  return new;
end;
$$;