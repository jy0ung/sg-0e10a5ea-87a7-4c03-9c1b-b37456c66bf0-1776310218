alter table public.branches
  add column if not exists or_series text,
  add column if not exists vdo_series text;

drop policy if exists "Authenticated users can read branches" on public.branches;
drop policy if exists "branches_select_all" on public.branches;
drop policy if exists "branches_tenant_select" on public.branches;
drop policy if exists "Admins can manage branches" on public.branches;
drop policy if exists "branches_admin_write" on public.branches;

create policy "branches_tenant_select" on public.branches
  for select to authenticated
  using (public.is_same_company(company_id));

create policy "branches_admin_write" on public.branches
  for all to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );