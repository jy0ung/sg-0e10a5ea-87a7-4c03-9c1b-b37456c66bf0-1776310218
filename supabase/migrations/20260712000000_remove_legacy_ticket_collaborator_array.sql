-- ticket_collaborators is the canonical collaborator model. Remove the legacy
-- array and helper after all application callers have moved to the join table.

drop function if exists public.is_ticket_collaborator(uuid);

alter table public.tickets
  drop column if exists collaborator_ids;

