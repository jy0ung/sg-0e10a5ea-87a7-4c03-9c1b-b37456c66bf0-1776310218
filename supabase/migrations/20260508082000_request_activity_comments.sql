alter table public.ticket_activity
  drop constraint if exists ticket_activity_event_type_check;

alter table public.ticket_activity
  add constraint ticket_activity_event_type_check
  check (event_type in ('status_changed', 'owner_changed', 'resolution_note_updated', 'priority_changed', 'comment_added'));

drop policy if exists "ticket_activity_insert_admin" on public.ticket_activity;
drop policy if exists "ticket_activity_insert_scoped" on public.ticket_activity;

create policy "ticket_activity_insert_scoped" on public.ticket_activity
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (
      select 1
        from public.tickets t
        join public.profiles p on p.id = auth.uid()
       where t.id = public.ticket_activity.ticket_id
         and t.company_id = public.ticket_activity.company_id
         and (
           t.submitted_by = auth.uid()
           or t.assigned_to = auth.uid()
           or (
             p.company_id = t.company_id
             and p.role in ('super_admin', 'company_admin')
           )
         )
    )
  );

comment on policy "ticket_activity_insert_scoped" on public.ticket_activity is
  'Allows requesters, assigned owners, and company admins to append request activity/comments within their company scope.';