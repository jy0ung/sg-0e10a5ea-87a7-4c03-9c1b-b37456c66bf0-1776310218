create table if not exists public.ticket_activity (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  company_id text not null,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null
    check (event_type in ('status_changed', 'owner_changed', 'resolution_note_updated', 'priority_changed')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ticket_activity_ticket_created_at
  on public.ticket_activity (ticket_id, created_at desc);

alter table public.ticket_activity enable row level security;

drop policy if exists "ticket_activity_insert_admin" on public.ticket_activity;
drop policy if exists "ticket_activity_select_scoped" on public.ticket_activity;

create policy "ticket_activity_insert_admin" on public.ticket_activity
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (
      select 1
        from public.tickets t
        join public.profiles p on p.id = auth.uid()
       where t.id = public.ticket_activity.ticket_id
         and t.company_id = public.ticket_activity.company_id
         and p.company_id = t.company_id
         and p.role in ('super_admin', 'company_admin')
    )
  );

create policy "ticket_activity_select_scoped" on public.ticket_activity
  for select to authenticated
  using (
    exists (
      select 1
        from public.tickets t
       where t.id = public.ticket_activity.ticket_id
         and t.company_id = public.ticket_activity.company_id
         and (
           t.submitted_by = auth.uid()
           or exists (
             select 1
               from public.profiles p
              where p.id = auth.uid()
                and p.company_id = t.company_id
                and p.role in ('super_admin', 'company_admin')
           )
         )
    )
  );