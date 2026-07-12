-- Historical portal redesign migration retained so migration history can be
-- reproduced. The legacy array is removed by the later canonical collaborator
-- cleanup migration after ticket_collaborators became the source of truth.

alter table public.tickets
  add column if not exists collaborator_ids uuid[] default '{}'::uuid[];

create or replace function public.is_ticket_collaborator(ticket_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return auth.uid() in (
    select unnest(collaborator_ids)
    from public.tickets
    where id = ticket_id
  );
end;
$$;

