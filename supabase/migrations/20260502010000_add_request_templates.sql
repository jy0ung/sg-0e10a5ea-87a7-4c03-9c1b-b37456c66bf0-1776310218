-- Request templates allow admins to pre-build reusable starters for common
-- request types. Employees can apply a template in the New Request form to
-- pre-fill the subject, category, subcategory, priority, and description.

create table if not exists public.request_templates (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  category_key text not null,
  subcategory_key text,
  priority text not null default 'medium',
  subject text not null,
  body text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_templates_company_name_key unique (company_id, name)
);

create index if not exists idx_request_templates_company_sort
  on public.request_templates (company_id, sort_order, name);

create or replace function public.request_templates_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists request_templates_updated_at on public.request_templates;
create trigger request_templates_updated_at
  before update on public.request_templates
  for each row execute function public.request_templates_set_updated_at();

alter table public.request_templates enable row level security;

-- All authenticated users in the same company can read templates.
drop policy if exists request_templates_select_scoped on public.request_templates;
create policy request_templates_select_scoped on public.request_templates
  for select to authenticated
  using (public.is_same_company(company_id));

-- Only admins can create templates.
drop policy if exists request_templates_insert_admin on public.request_templates;
create policy request_templates_insert_admin on public.request_templates
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

-- Only admins can update templates.
drop policy if exists request_templates_update_admin on public.request_templates;
create policy request_templates_update_admin on public.request_templates
  for update to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

-- Only admins can delete templates.
drop policy if exists request_templates_delete_admin on public.request_templates;
create policy request_templates_delete_admin on public.request_templates
  for delete to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );
