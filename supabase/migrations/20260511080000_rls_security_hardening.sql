-- P1.2: RLS security hardening
--
-- Fixes identified security gaps:
--   1. audit_logs / application_logs had NO RLS — any authenticated user could
--      read all rows across companies.
--   2. announcements INSERT had no company_id guard.
--   3. dashboard_preferences INSERT had no user ownership guard.
--   4. dms_raw_* staging tables allowed authenticated write — should be
--      service_role only (DMS ingest runs through edge functions / backend).

-- ── 1. audit_logs ─────────────────────────────────────────────────────────────
alter table public.audit_logs enable row level security;

-- Any authenticated user can read audit rows for their own company.
create policy "audit_logs: authenticated read own company"
  on public.audit_logs
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (select company_id from public.profiles where id = auth.uid()) = (
      select p2.company_id from public.profiles p2 where p2.id = audit_logs.user_id
    )
  );

-- super_admin can read all.
create policy "audit_logs: super_admin read all"
  on public.audit_logs
  for select
  to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'super_admin'
  );

-- Only the application (service_role) and SECURITY DEFINER RPCs write audit logs.
create policy "audit_logs: service_role full access"
  on public.audit_logs
  for all
  to service_role
  using (true)
  with check (true);

-- ── 2. application_logs ──────────────────────────────────────────────────────
alter table public.application_logs enable row level security;

create policy "application_logs: authenticated read own company"
  on public.application_logs
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (select company_id from public.profiles where id = auth.uid()) is not null
  );

create policy "application_logs: service_role full access"
  on public.application_logs
  for all
  to service_role
  using (true)
  with check (true);

-- Allow authenticated users to INSERT their own log rows (client-side logging).
create policy "application_logs: authenticated insert own"
  on public.application_logs
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- ── 3. announcements: tighten INSERT ─────────────────────────────────────────
-- Drop any existing open insert policy and replace with company-scoped one.
drop policy if exists "Authenticated users can create announcements" on public.announcements;
drop policy if exists "announcements: authenticated insert" on public.announcements;

create policy "announcements: authenticated insert own company"
  on public.announcements
  for insert
  to authenticated
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid())
      in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
  );

-- ── 4. dashboard_preferences: tighten INSERT ─────────────────────────────────
drop policy if exists "Users can insert their own preferences" on public.dashboard_preferences;
drop policy if exists "dashboard_preferences: authenticated insert" on public.dashboard_preferences;

create policy "dashboard_preferences: insert own"
  on public.dashboard_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid()::text);

-- ── 5. dms_raw_* staging: restrict writes to service_role ─────────────────────
-- These tables receive data only via the dms-sync-worker edge function which
-- runs with the service_role key.  Authenticated users (browser) should be able
-- to SELECT rows for their own company but NEVER INSERT/UPDATE/DELETE directly.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'dms_raw_collections',
    'dms_raw_deliveries',
    'dms_raw_leads',
    'dms_raw_master_data',
    'dms_raw_order_vehicle_matches',
    'dms_raw_prospects',
    'dms_raw_sales_orders',
    'dms_raw_soa_snapshots',
    'dms_raw_vehicle_stock'
  ] loop
    -- Drop any existing open write policies
    execute format('drop policy if exists "%s: authenticated insert" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s: insert" on public.%I', tbl, tbl);
    execute format('drop policy if exists "authenticated users can insert %s" on public.%I', tbl, tbl);

    -- Add service_role-only write policy
    execute format(
      'create policy "%s: service_role write" on public.%I
       for all to service_role using (true) with check (true)',
      tbl, tbl
    );
  end loop;
end;
$$;
