-- Migration: portal_admin_setup_write_access
-- Extends the INSERT / UPDATE / DELETE policies on every portal setup table
-- so that portal_admin (in addition to super_admin and company_admin) can
-- manage categories, subcategories, templates, routing rules, and form fields.
-- SELECT policies are unchanged (already readable by all authenticated users in
-- the same company).

-- ─── request_categories ──────────────────────────────────────────────────────

drop policy if exists request_categories_insert_admin on public.request_categories;
create policy request_categories_insert_admin on public.request_categories
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

drop policy if exists request_categories_update_admin on public.request_categories;
create policy request_categories_update_admin on public.request_categories
  for update to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

drop policy if exists request_categories_delete_admin on public.request_categories;
create policy request_categories_delete_admin on public.request_categories
  for delete to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

-- ─── request_subcategories ───────────────────────────────────────────────────

drop policy if exists request_subcategories_insert_admin on public.request_subcategories;
create policy request_subcategories_insert_admin on public.request_subcategories
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

drop policy if exists request_subcategories_update_admin on public.request_subcategories;
create policy request_subcategories_update_admin on public.request_subcategories
  for update to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

drop policy if exists request_subcategories_delete_admin on public.request_subcategories;
create policy request_subcategories_delete_admin on public.request_subcategories
  for delete to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

-- ─── request_templates ───────────────────────────────────────────────────────

drop policy if exists request_templates_insert_admin on public.request_templates;
create policy request_templates_insert_admin on public.request_templates
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

drop policy if exists request_templates_update_admin on public.request_templates;
create policy request_templates_update_admin on public.request_templates
  for update to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

drop policy if exists request_templates_delete_admin on public.request_templates;
create policy request_templates_delete_admin on public.request_templates
  for delete to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

-- ─── request_routing_rules ───────────────────────────────────────────────────

drop policy if exists "routing_rules_insert_admin" on public.request_routing_rules;
create policy "routing_rules_insert_admin" on public.request_routing_rules
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

drop policy if exists "routing_rules_update_admin" on public.request_routing_rules;
create policy "routing_rules_update_admin" on public.request_routing_rules
  for update to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

drop policy if exists "routing_rules_delete_admin" on public.request_routing_rules;
create policy "routing_rules_delete_admin" on public.request_routing_rules
  for delete to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

-- ─── request_form_fields ─────────────────────────────────────────────────────

drop policy if exists request_form_fields_insert_admin on public.request_form_fields;
create policy request_form_fields_insert_admin on public.request_form_fields
  for insert to authenticated
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

drop policy if exists request_form_fields_update_admin on public.request_form_fields;
create policy request_form_fields_update_admin on public.request_form_fields
  for update to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  )
  with check (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );

drop policy if exists request_form_fields_delete_admin on public.request_form_fields;
create policy request_form_fields_delete_admin on public.request_form_fields
  for delete to authenticated
  using (
    public.is_same_company(company_id)
    and public.current_role() in ('super_admin', 'company_admin', 'portal_admin')
  );
