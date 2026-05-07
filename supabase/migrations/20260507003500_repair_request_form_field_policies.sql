drop policy if exists request_form_fields_insert_admin on public.request_form_fields;
create policy request_form_fields_insert_admin on public.request_form_fields
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

drop policy if exists request_form_fields_update_admin on public.request_form_fields;
create policy request_form_fields_update_admin on public.request_form_fields
  for update to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );

drop policy if exists request_form_fields_delete_admin on public.request_form_fields;
create policy request_form_fields_delete_admin on public.request_form_fields
  for delete to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin')
  );
