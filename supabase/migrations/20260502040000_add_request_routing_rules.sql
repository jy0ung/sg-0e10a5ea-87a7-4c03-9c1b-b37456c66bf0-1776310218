-- ============================================================
-- request_routing_rules — per-company auto-assignment rules
-- ============================================================
-- Rules are evaluated in sort_order (ascending); first active matching rule wins.
-- All match_* columns are nullable — a null value is a wildcard (matches any).

create table if not exists public.request_routing_rules (
  id                   uuid         primary key default gen_random_uuid(),
  company_id           text         not null,
  name                 text         not null,
  is_active            boolean      not null default true,
  sort_order           integer      not null default 0,

  -- Conditions (null = matches any)
  match_category       text,
  match_subcategory    text,
  match_submitter_role text,
  match_priority       text,

  -- Action
  assign_to_user_id    uuid         not null references auth.users(id) on delete cascade,

  -- Metadata
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now(),
  created_by           uuid         references auth.users(id) on delete set null
);

-- updated_at auto-stamp
create or replace function public.set_routing_rule_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists routing_rules_updated_at on public.request_routing_rules;
create trigger routing_rules_updated_at
  before update on public.request_routing_rules
  for each row execute procedure public.set_routing_rule_updated_at();

alter table public.request_routing_rules enable row level security;

-- Company members can read rules (needed client-side for evaluation)
drop policy if exists "routing_rules_select_scoped" on public.request_routing_rules;
create policy "routing_rules_select_scoped" on public.request_routing_rules
  for select to authenticated
  using (public.is_same_company(company_id));

-- Admins can insert
drop policy if exists "routing_rules_insert_admin" on public.request_routing_rules;
create policy "routing_rules_insert_admin" on public.request_routing_rules
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

-- Admins can update
drop policy if exists "routing_rules_update_admin" on public.request_routing_rules;
create policy "routing_rules_update_admin" on public.request_routing_rules
  for update to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

-- Admins can delete
drop policy if exists "routing_rules_delete_admin" on public.request_routing_rules;
create policy "routing_rules_delete_admin" on public.request_routing_rules
  for delete to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

comment on table public.request_routing_rules is
  'Per-company rules that auto-assign a ticket to a specific user when submission criteria match. Rules are evaluated in sort_order; first active match wins.';
comment on column public.request_routing_rules.match_category       is 'Null = any category.';
comment on column public.request_routing_rules.match_subcategory    is 'Null = any subcategory (or no subcategory).';
comment on column public.request_routing_rules.match_submitter_role is 'Null = any submitter role.';
comment on column public.request_routing_rules.match_priority       is 'Null = any priority.';
