-- Allow custom request form fields to be scoped to a specific subcategory.
-- A NULL subcategory_key means the field applies to every subcategory of the
-- parent category (category-level field). A non-NULL value scopes the field to
-- that single subcategory.

alter table public.request_form_fields
  add column if not exists subcategory_key text;

-- Replace the (company, category, field_key) uniqueness with one that also keys
-- on subcategory so the same field key can exist for different subcategories.
-- `nulls not distinct` keeps category-level fields (NULL subcategory_key) unique
-- per field key as well.
alter table public.request_form_fields
  drop constraint if exists request_form_fields_company_category_key_key;

alter table public.request_form_fields
  add constraint request_form_fields_company_category_subcategory_field_key_key
  unique nulls not distinct (company_id, category_key, subcategory_key, field_key);

-- Composite FK to request_subcategories. With MATCH SIMPLE (the default), rows
-- whose subcategory_key is NULL skip this check, so category-level fields remain
-- valid while subcategory-scoped fields must reference an existing subcategory.
alter table public.request_form_fields
  drop constraint if exists request_form_fields_subcategory_fkey;

alter table public.request_form_fields
  add constraint request_form_fields_subcategory_fkey
  foreign key (company_id, category_key, subcategory_key)
  references public.request_subcategories (company_id, category_key, subcategory_key)
  on delete cascade;

create index if not exists request_form_fields_company_subcategory_idx
  on public.request_form_fields (company_id, category_key, subcategory_key, sort_order, label);

comment on column public.request_form_fields.subcategory_key is
  'Optional subcategory scope. NULL = applies to all subcategories of the category; otherwise references request_subcategories.subcategory_key.';
