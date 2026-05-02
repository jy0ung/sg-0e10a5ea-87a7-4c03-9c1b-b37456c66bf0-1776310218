-- ─────────────────────────────────────────────────────────────────────────────
-- Phase: Add VSO number + attachment support to internal requests
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. VSO number on tickets
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.tickets
  add column if not exists vso_number text;

-- 2. Ticket attachments table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ticket_attachments (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  company_id   text not null references public.companies(id) on delete cascade,
  file_name    text not null,
  file_path    text not null,
  file_size    bigint not null,
  mime_type    text not null default 'application/octet-stream',
  uploaded_by  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index if not exists idx_ticket_attachments_ticket_id
  on public.ticket_attachments (ticket_id);

create index if not exists idx_ticket_attachments_company_id
  on public.ticket_attachments (company_id);

alter table public.ticket_attachments enable row level security;

-- Members of the same company can read attachments on tickets they can see
drop policy if exists "Company members can read ticket attachments" on public.ticket_attachments;
create policy "Company members can read ticket attachments"
  on public.ticket_attachments for select to authenticated
  using (
    company_id = (
      select profiles.company_id from public.profiles where profiles.id = auth.uid()
    )
  );

-- Any authenticated member of the company can insert (uploader = caller)
drop policy if exists "Company members can insert ticket attachments" on public.ticket_attachments;
create policy "Company members can insert ticket attachments"
  on public.ticket_attachments for insert to authenticated
  with check (
    company_id = (
      select profiles.company_id from public.profiles where profiles.id = auth.uid()
    )
    and uploaded_by = auth.uid()
  );

-- Uploader can delete their own attachment (and admins can delete any)
drop policy if exists "Uploader or admin can delete ticket attachment" on public.ticket_attachments;
create policy "Uploader or admin can delete ticket attachment"
  on public.ticket_attachments for delete to authenticated
  using (
    company_id = (
      select profiles.company_id from public.profiles where profiles.id = auth.uid()
    )
    and (
      uploaded_by = auth.uid()
      or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role in ('super_admin', 'company_admin', 'manager', 'general_manager', 'director')
      )
    )
  );

-- 3. Request attachment settings (admin-adjustable per company)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.request_attachment_settings (
  id                    uuid primary key default gen_random_uuid(),
  company_id            text not null references public.companies(id) on delete cascade,
  max_file_size_mb      integer not null default 3 check (max_file_size_mb between 1 and 50),
  max_files_per_ticket  integer not null default 3 check (max_files_per_ticket between 1 and 10),
  updated_by            uuid references public.profiles(id) on delete set null,
  updated_at            timestamptz not null default now(),
  constraint request_attachment_settings_company_id_key unique (company_id)
);

alter table public.request_attachment_settings enable row level security;

-- Any company member can read settings (needed for the submission form)
drop policy if exists "Company members can read attachment settings" on public.request_attachment_settings;
create policy "Company members can read attachment settings"
  on public.request_attachment_settings for select to authenticated
  using (
    company_id = (
      select profiles.company_id from public.profiles where profiles.id = auth.uid()
    )
  );

-- Only admins can insert/update settings
drop policy if exists "Company admins can insert attachment settings" on public.request_attachment_settings;
create policy "Company admins can insert attachment settings"
  on public.request_attachment_settings for insert to authenticated
  with check (
    company_id = (
      select profiles.company_id from public.profiles where profiles.id = auth.uid()
    )
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'company_admin')
    )
  );

drop policy if exists "Company admins can update attachment settings" on public.request_attachment_settings;
create policy "Company admins can update attachment settings"
  on public.request_attachment_settings for update to authenticated
  using (
    company_id = (
      select profiles.company_id from public.profiles where profiles.id = auth.uid()
    )
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'company_admin')
    )
  );

-- 4. Storage bucket for ticket attachments
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-attachments',
  'ticket-attachments',
  false,
  52428800,  -- hard server cap 50 MB (per-company soft cap enforced in app)
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do nothing;

-- Storage RLS: authenticated users can upload to their own company folder
-- Path pattern: {company_id}/{ticket_id}/{filename}
drop policy if exists "Authenticated users can upload ticket attachments" on storage.objects;
create policy "Authenticated users can upload ticket attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = (
      select profiles.company_id from public.profiles where profiles.id = auth.uid()
    )
  );

drop policy if exists "Company members can read ticket attachment objects" on storage.objects;
create policy "Company members can read ticket attachment objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = (
      select profiles.company_id from public.profiles where profiles.id = auth.uid()
    )
  );

drop policy if exists "Company members can delete ticket attachment objects" on storage.objects;
create policy "Company members can delete ticket attachment objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = (
      select profiles.company_id from public.profiles where profiles.id = auth.uid()
    )
  );
