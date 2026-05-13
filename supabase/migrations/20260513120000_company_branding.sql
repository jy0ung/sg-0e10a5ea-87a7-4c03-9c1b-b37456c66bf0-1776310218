-- Migration: company_branding
-- Adds a structured branding/settings table per company.
-- Admins can read/write; all company members can read.
-- A "company-assets" storage bucket is created for logo/favicon uploads.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.company_branding (
  id                    uuid        not null default gen_random_uuid(),
  company_id            text        not null,
  -- Identity
  company_name          text,           -- "Fook Loi Group"
  legal_name            text,           -- "Fook Loi Corp (Sabah) Sdn. Bhd."
  company_reg_no        text,           -- "1234567-A"
  -- App / system
  app_name              text,           -- "Fook Loi Group UBS"
  app_short_name        text,           -- "FLC"
  -- Logos (storage paths, resolved to signed URLs at read time)
  logo_path             text,           -- "company-assets/{cid}/logo.png"
  login_logo_path       text,           -- "company-assets/{cid}/login-logo.png"
  favicon_path          text,           -- "company-assets/{cid}/favicon.png"
  -- Contact / web
  address               text,
  support_email         text,
  support_phone         text,
  website               text,
  -- Locale
  default_timezone      text,
  default_locale        text,
  -- Appearance
  accent_color          text,           -- CSS hex e.g. "#6366f1"
  -- Misc
  copyright_text        text,           -- "© 2025 Fook Loi Group. All rights reserved."
  -- Audit
  updated_by            uuid        references public.profiles(id) on delete set null,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),

  constraint company_branding_pkey primary key (id),
  constraint company_branding_company_id_key unique (company_id),
  constraint company_branding_company_id_fkey
    foreign key (company_id) references public.companies(id) on delete cascade
);

create index if not exists idx_company_branding_company_id
  on public.company_branding (company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.company_branding enable row level security;

-- All authenticated company members can read their company's branding.
drop policy if exists "Company members can read branding" on public.company_branding;
create policy "Company members can read branding"
  on public.company_branding
  for select
  to authenticated
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

-- Only super_admin / company_admin may insert.
drop policy if exists "Admins can insert branding" on public.company_branding;
create policy "Admins can insert branding"
  on public.company_branding
  for insert
  to authenticated
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('super_admin', 'company_admin')
    )
  );

-- Only super_admin / company_admin may update.
drop policy if exists "Admins can update branding" on public.company_branding;
create policy "Admins can update branding"
  on public.company_branding
  for update
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('super_admin', 'company_admin')
    )
  )
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('super_admin', 'company_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Seed: create a default row for every existing company so reads never
--    return null (they'll fall back to static defaults in the frontend).
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.company_branding (company_id)
select id from public.companies
on conflict (company_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger: auto-create a branding row for new companies.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.seed_company_branding_for_new_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.company_branding (company_id)
  values (new.id)
  on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_seed_company_branding on public.companies;
create trigger trg_seed_company_branding
  after insert on public.companies
  for each row
  execute function public.seed_company_branding_for_new_company();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Storage bucket: company-assets
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  false,                        -- private: served via signed URLs
  2097152,                      -- 2 MB max per file
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
)
on conflict (id) do nothing;

-- Storage RLS: company members can read their own company's assets.
drop policy if exists "Company members can read company assets" on storage.objects;
create policy "Company members can read company assets"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = (
      select company_id from public.profiles where id = auth.uid()
    )
  );

-- Only admins may upload.
drop policy if exists "Admins can upload company assets" on storage.objects;
create policy "Admins can upload company assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = (
      select company_id from public.profiles where id = auth.uid()
    )
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('super_admin', 'company_admin')
    )
  );

-- Only admins may update (replace) assets.
drop policy if exists "Admins can update company assets" on storage.objects;
create policy "Admins can update company assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = (
      select company_id from public.profiles where id = auth.uid()
    )
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('super_admin', 'company_admin')
    )
  );

-- Only admins may delete assets.
drop policy if exists "Admins can delete company assets" on storage.objects;
create policy "Admins can delete company assets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = (
      select company_id from public.profiles where id = auth.uid()
    )
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('super_admin', 'company_admin')
    )
  );
