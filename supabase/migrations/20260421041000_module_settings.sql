create table if not exists public.module_settings (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  module_id text not null,
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint module_settings_company_id_module_id_key unique (company_id, module_id)
);

create index if not exists idx_module_settings_company_id
  on public.module_settings (company_id);

alter table public.module_settings enable row level security;

drop policy if exists "Company members can read module settings" on public.module_settings;
create policy "Company members can read module settings"
on public.module_settings
for select
to authenticated
using (
  company_id = (
    select profiles.company_id
    from public.profiles
    where profiles.id = auth.uid()
  )
);

drop policy if exists "Company admins can insert module settings" on public.module_settings;
create policy "Company admins can insert module settings"
on public.module_settings
for insert
to authenticated
with check (
  company_id = (
    select profiles.company_id
    from public.profiles
    where profiles.id = auth.uid()
  )
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('super_admin', 'company_admin')
  )
);

drop policy if exists "Company admins can update module settings" on public.module_settings;
create policy "Company admins can update module settings"
on public.module_settings
for update
to authenticated
using (
  company_id = (
    select profiles.company_id
    from public.profiles
    where profiles.id = auth.uid()
  )
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('super_admin', 'company_admin')
  )
)
with check (
  company_id = (
    select profiles.company_id
    from public.profiles
    where profiles.id = auth.uid()
  )
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('super_admin', 'company_admin')
  )
);

drop policy if exists "Company admins can delete module settings" on public.module_settings;
create policy "Company admins can delete module settings"
on public.module_settings
for delete
to authenticated
using (
  company_id = (
    select profiles.company_id
    from public.profiles
    where profiles.id = auth.uid()
  )
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('super_admin', 'company_admin')
  )
);