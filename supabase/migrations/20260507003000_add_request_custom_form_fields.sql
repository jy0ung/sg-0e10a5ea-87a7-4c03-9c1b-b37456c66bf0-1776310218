alter table public.tickets
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create table if not exists public.request_form_fields (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  category_key text not null,
  field_key text not null,
  label text not null,
  field_type text not null default 'text',
  data_source text,
  placeholder text not null default '',
  help_text text not null default '',
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_form_fields_type_check
    check (field_type in ('text', 'textarea', 'number', 'date', 'database_select')),
  constraint request_form_fields_source_check
    check (data_source is null or data_source in ('branches', 'employees', 'vehicles')),
  constraint request_form_fields_company_category_key_key unique (company_id, category_key, field_key),
  constraint request_form_fields_category_fkey
    foreign key (company_id, category_key)
    references public.request_categories (company_id, category_key)
    on delete cascade
);

create index if not exists request_form_fields_company_category_sort_idx
  on public.request_form_fields (company_id, category_key, sort_order, label);

create or replace function public.request_form_fields_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists request_form_fields_updated_at on public.request_form_fields;
create trigger request_form_fields_updated_at
  before update on public.request_form_fields
  for each row execute function public.request_form_fields_set_updated_at();

alter table public.request_form_fields enable row level security;

drop policy if exists request_form_fields_select_scoped on public.request_form_fields;
create policy request_form_fields_select_scoped on public.request_form_fields
  for select to authenticated
  using (public.is_same_company(company_id));

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

comment on table public.request_form_fields is
  'Company-scoped custom field definitions for the Internal Requests form builder.';

comment on column public.tickets.custom_fields is
  'Submitted values for company-defined Internal Requests custom fields, keyed by request_form_fields.field_key.';
