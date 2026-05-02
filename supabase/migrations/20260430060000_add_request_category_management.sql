create table if not exists public.request_categories (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  category_key text not null,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_categories_company_category_key_key unique (company_id, category_key)
);

create index if not exists idx_request_categories_company_sort
  on public.request_categories (company_id, sort_order, label);

create or replace function public.request_categories_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists request_categories_updated_at on public.request_categories;
create trigger request_categories_updated_at
  before update on public.request_categories
  for each row execute function public.request_categories_set_updated_at();

alter table public.request_categories enable row level security;

drop policy if exists request_categories_select_scoped on public.request_categories;
create policy request_categories_select_scoped on public.request_categories
  for select to authenticated
  using (public.is_same_company(company_id));

drop policy if exists request_categories_insert_admin on public.request_categories;
create policy request_categories_insert_admin on public.request_categories
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

drop policy if exists request_categories_update_admin on public.request_categories;
create policy request_categories_update_admin on public.request_categories
  for update to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

drop policy if exists request_categories_delete_admin on public.request_categories;
create policy request_categories_delete_admin on public.request_categories
  for delete to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

alter table public.tickets
  drop constraint if exists tickets_category_check;

create or replace function public.validate_ticket_request_category()
returns trigger
language plpgsql
as $$
begin
  if new.category is null or btrim(new.category) = '' then
    raise exception 'Ticket category is required';
  end if;

  if not exists (
    select 1
    from public.request_categories
    where request_categories.company_id = new.company_id
      and request_categories.category_key = new.category
  ) then
    raise exception 'Unknown request category % for company %', new.category, new.company_id;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_validate_request_category on public.tickets;
create trigger tickets_validate_request_category
  before insert or update of company_id, category on public.tickets
  for each row execute function public.validate_ticket_request_category();