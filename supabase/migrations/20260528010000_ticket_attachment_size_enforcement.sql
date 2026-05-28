-- ──────────────────────────────────────────────────────────────────────────────
-- Server-side enforcement of the per-company attachment caps
--
-- request_attachment_settings stores two per-company knobs:
--   max_file_size_mb       (1..50,  default 3)
--   max_files_per_ticket   (1..10,  default 3)
--
-- Until now both were enforced only in the React upload form (useAttachmentSettings
-- + validateAndAddFiles in NewTicket.tsx). A crafted client or a future second
-- client could insert oversized files or unlimited attachments because the only
-- DB-side guard was the storage bucket's hard 50 MB ceiling.
--
-- This migration adds a BEFORE INSERT trigger on ticket_attachments that:
--   1) reads the inserting company's settings (defaulting to 3 MB / 3 files when
--      no row exists yet — same defaults the React hook ships)
--   2) raises if NEW.file_size exceeds the per-company size cap
--   3) raises if inserting this row would push the ticket past the file-count cap
--
-- The trigger is `security definer` so it can read request_attachment_settings
-- regardless of the caller's RLS visibility (the existing read policy already
-- allows it, but security definer makes the contract explicit and survives
-- future policy changes).
-- ──────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_ticket_attachment_caps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_bytes        bigint;
  v_max_files        integer;
  v_existing_count   integer;
begin
  -- Read per-company caps (fall back to the same defaults the React hook uses
  -- when a company has never opened the settings page).
  select
    coalesce(s.max_file_size_mb, 3)::bigint * 1024 * 1024,
    coalesce(s.max_files_per_ticket, 3)
  into v_max_bytes, v_max_files
  from public.request_attachment_settings s
  where s.company_id = new.company_id;

  if v_max_bytes is null then
    v_max_bytes := 3::bigint * 1024 * 1024;  -- default 3 MB
    v_max_files := 3;
  end if;

  if new.file_size > v_max_bytes then
    raise exception 'Attachment % exceeds the % MB per-file limit configured for this company.',
      new.file_name, (v_max_bytes / (1024 * 1024))
      using errcode = 'check_violation';
  end if;

  select count(*) into v_existing_count
  from public.ticket_attachments
  where ticket_id = new.ticket_id;

  if v_existing_count >= v_max_files then
    raise exception 'This request already has the maximum % attachments allowed.',
      v_max_files
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_ticket_attachment_caps() is
  'BEFORE INSERT trigger that enforces request_attachment_settings caps on '
  'ticket_attachments rows. Mirrors the client-side checks in useAttachmentSettings.';

drop trigger if exists trg_enforce_ticket_attachment_caps on public.ticket_attachments;
create trigger trg_enforce_ticket_attachment_caps
  before insert on public.ticket_attachments
  for each row
  execute function public.enforce_ticket_attachment_caps();
