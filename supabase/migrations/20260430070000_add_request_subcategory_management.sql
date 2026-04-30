create table if not exists public.request_subcategories (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  category_key text not null,
  subcategory_key text not null,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_subcategories_company_category_subcategory_key_key unique (company_id, category_key, subcategory_key),
  constraint request_subcategories_category_fkey
    foreign key (company_id, category_key)
    references public.request_categories (company_id, category_key)
    on delete cascade
);

create index if not exists idx_request_subcategories_company_category_sort
  on public.request_subcategories (company_id, category_key, sort_order, label);

create or replace function public.request_subcategories_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists request_subcategories_updated_at on public.request_subcategories;
create trigger request_subcategories_updated_at
  before update on public.request_subcategories
  for each row execute function public.request_subcategories_set_updated_at();

alter table public.request_subcategories enable row level security;

drop policy if exists request_subcategories_select_scoped on public.request_subcategories;
create policy request_subcategories_select_scoped on public.request_subcategories
  for select to authenticated
  using (public.is_same_company(company_id));

drop policy if exists request_subcategories_insert_admin on public.request_subcategories;
create policy request_subcategories_insert_admin on public.request_subcategories
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

drop policy if exists request_subcategories_update_admin on public.request_subcategories;
create policy request_subcategories_update_admin on public.request_subcategories
  for update to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

drop policy if exists request_subcategories_delete_admin on public.request_subcategories;
create policy request_subcategories_delete_admin on public.request_subcategories
  for delete to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

alter table public.tickets
  add column if not exists subcategory text;

comment on column public.tickets.subcategory is 'Optional request subcategory chosen inside the selected request category.';

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

  if new.subcategory is not null and btrim(new.subcategory) = '' then
    new.subcategory = null;
  end if;

  if exists (
    select 1
    from public.request_subcategories
    where request_subcategories.company_id = new.company_id
      and request_subcategories.category_key = new.category
      and request_subcategories.is_active
  ) and new.subcategory is null then
    raise exception 'Ticket subcategory is required for category %', new.category;
  end if;

  if new.subcategory is not null and not exists (
    select 1
    from public.request_subcategories
    where request_subcategories.company_id = new.company_id
      and request_subcategories.category_key = new.category
      and request_subcategories.subcategory_key = new.subcategory
      and request_subcategories.is_active
  ) then
    raise exception 'Unknown request subcategory % for category % and company %', new.subcategory, new.category, new.company_id;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_validate_request_category on public.tickets;
create trigger tickets_validate_request_category
  before insert or update of company_id, category, subcategory on public.tickets
  for each row execute function public.validate_ticket_request_category();