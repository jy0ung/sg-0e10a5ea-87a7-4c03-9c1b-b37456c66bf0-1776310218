-- HRMS leave workflow enhancements: half-day metadata and leave attachments.

alter table public.leave_requests
  add column if not exists day_part text not null default 'full_day'
    check (day_part in ('full_day', 'half_day_morning', 'half_day_afternoon')),
  add column if not exists attachment_file_name text,
  add column if not exists attachment_file_path text,
  add column if not exists attachment_file_size integer,
  add column if not exists attachment_mime_type text;

create index if not exists idx_leave_requests_day_part
  on public.leave_requests (day_part);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leave-attachments',
  'leave-attachments',
  false,
  3145728,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can upload leave attachments" on storage.objects;
create policy "Authenticated users can upload leave attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'leave-attachments'
    and (storage.foldername(name))[1] = (
      select company_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Company members can read leave attachment objects" on storage.objects;
create policy "Company members can read leave attachment objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'leave-attachments'
    and (
      (storage.foldername(name))[1] = (
        select company_id from public.profiles where id = auth.uid()
      )
      or exists (
        select 1 from public.profiles
        where id = auth.uid()
          and access_scope = 'global'
      )
    )
  );

drop policy if exists "Uploader can delete leave attachment objects" on storage.objects;
create policy "Uploader can delete leave attachment objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'leave-attachments'
    and (storage.foldername(name))[1] = (
      select company_id from public.profiles where id = auth.uid()
    )
  );
