-- Production-readiness security hardening.
--
-- This migration closes legacy permissive policies that survived later RLS
-- additions, enforces tenant and enabled-user checks as restrictive policies,
-- prevents profile privilege escalation, and removes anonymous execution from
-- SECURITY DEFINER functions.

create or replace function public.request_actor_is_enabled()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status in ('active', 'pending')
  );
$$;

create or replace function public.assert_request_actor_enabled()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() = 'service_role' then
    return;
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.request_actor_is_enabled() then
    raise exception 'User account is inactive or unavailable' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_company_access(target_company_id text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_request_actor_enabled();

  if auth.role() = 'service_role' then
    return;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status in ('active', 'pending')
      and (p.company_id = target_company_id or p.access_scope = 'global')
  ) then
    raise exception 'Company access denied' using errcode = '42501';
  end if;
end;
$$;

-- PostgREST calls this before every data/RPC request. It closes the stale-JWT
-- window after a profile is disabled while service-role jobs remain available.
alter role authenticator set pgrst.db_pre_request = 'public.assert_request_actor_enabled';
notify pgrst, 'reload config';

-- Restrictive policies are ANDed with every existing permissive policy. This
-- prevents an old broad policy from bypassing tenant or account-state checks.
do $$
declare
  table_name text;
begin
  for table_name in
    select t.tablename
    from pg_catalog.pg_tables t
    where t.schemaname = 'public'
      and t.rowsecurity
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      'enabled_actor_gate',
      table_name
    );
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.request_actor_is_enabled()) with check (public.request_actor_is_enabled())',
      'enabled_actor_gate',
      table_name
    );
  end loop;

  for table_name in
    select t.tablename
    from pg_catalog.pg_tables t
    join information_schema.columns c
      on c.table_schema = t.schemaname
     and c.table_name = t.tablename
     and c.column_name = 'company_id'
    where t.schemaname = 'public'
      and t.rowsecurity
      and t.tablename <> 'profiles'
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      'tenant_company_gate',
      table_name
    );
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.is_same_company(company_id)) with check (public.is_same_company(company_id))',
      'tenant_company_gate',
      table_name
    );
  end loop;
end;
$$;

-- Remove permissive legacy policies superseded by scoped policies.
drop policy if exists "allow_authenticated_select" on public.audit_logs;
drop policy if exists "allow_authenticated_insert" on public.audit_logs;
drop policy if exists "application_logs: authenticated read own company" on public.application_logs;
drop policy if exists "Authenticated read approval_requests" on public.approval_requests;
drop policy if exists "Managers update approval_requests" on public.approval_requests;
drop policy if exists "Authenticated insert approval_requests" on public.approval_requests;
drop policy if exists "Authenticated read approval_decisions" on public.approval_decisions;
drop policy if exists "Managers insert approval_decisions" on public.approval_decisions;

create policy "approval_requests: requester or company approver read"
  on public.approval_requests for select to authenticated
  using (
    requester_id = auth.uid()
    or exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid()
        and actor.company_id = approval_requests.company_id
        and actor.role in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
    )
  );

create policy "approval_requests: requester insert own company"
  on public.approval_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and public.is_same_company(company_id)
  );

create policy "approval_requests: company approver update"
  on public.approval_requests for update to authenticated
  using (
    exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid()
        and actor.company_id = approval_requests.company_id
        and actor.role in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
    )
  )
  with check (public.is_same_company(company_id));

create policy "approval_decisions: scoped request read"
  on public.approval_decisions for select to authenticated
  using (
    exists (
      select 1
      from public.approval_requests ar
      join public.profiles actor on actor.id = auth.uid()
      where ar.id = approval_decisions.approval_request_id
        and ar.company_id = actor.company_id
        and (
          ar.requester_id = auth.uid()
          or actor.role in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
        )
    )
  );

-- A user may edit personal presentation/contact details and activate a pending
-- invite, but cannot alter identity, tenant, role, scope, or access controls.
create or replace function public.guard_profile_privilege_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor public.profiles%rowtype;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  select * into actor from public.profiles p where p.id = auth.uid();
  if not found or actor.status not in ('active', 'pending') then
    raise exception 'Profile update denied' using errcode = '42501';
  end if;

  if auth.uid() = old.id then
    if new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.company_id is distinct from old.company_id
      or new.access_scope is distinct from old.access_scope
      or new.branch_id is distinct from old.branch_id
      or new.employee_id is distinct from old.employee_id
      or new.department_id is distinct from old.department_id
      or new.job_title_id is distinct from old.job_title_id
      or new.manager_id is distinct from old.manager_id
      or new.portal_access_only is distinct from old.portal_access_only
      or new.can_edit_vehicles is distinct from old.can_edit_vehicles
      or new.can_bulk_edit_vehicles is distinct from old.can_bulk_edit_vehicles
      or new.can_view_vehicle_details is distinct from old.can_view_vehicle_details
      or (
        new.status is distinct from old.status
        and not (old.status = 'pending' and new.status = 'active')
      )
    then
      raise exception 'Users cannot change their own authorization fields' using errcode = '42501';
    end if;
    return new;
  end if;

  if actor.role = 'super_admin' and actor.access_scope = 'global' then
    return new;
  end if;

  if actor.role <> 'company_admin'
    or actor.company_id is null
    or old.company_id is distinct from actor.company_id
    or new.company_id is distinct from actor.company_id
    or new.id is distinct from old.id
    or new.role = 'super_admin'
    or new.access_scope = 'global'
  then
    raise exception 'Administrative profile update denied' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privilege_changes on public.profiles;
create trigger trg_guard_profile_privilege_changes
  before update on public.profiles
  for each row execute function public.guard_profile_privilege_changes();

-- Fix the branch identifier type mismatch detected by plpgsql_check.
create or replace function public.can_access_row(
  row_company_id text,
  row_branch_code text default null,
  row_assigned_user_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_company_id text;
  actor_access_scope text;
  actor_branch_id text;
  actor_branch_code text;
begin
  select p.company_id, p.access_scope, p.branch_id
    into actor_company_id, actor_access_scope, actor_branch_id
  from public.profiles p
  where p.id = auth.uid()
    and p.status in ('active', 'pending');

  if not found then return false; end if;
  if actor_access_scope = 'global' then return true; end if;
  if row_company_id is distinct from actor_company_id then return false; end if;
  if actor_access_scope = 'company' then return true; end if;

  if actor_access_scope = 'branch' then
    if actor_branch_id is null or row_branch_code is null then return false; end if;
    select b.code into actor_branch_code from public.branches b where b.id = actor_branch_id;
    return found and row_branch_code = actor_branch_code;
  end if;

  if actor_access_scope = 'self' then
    return row_assigned_user_id = auth.uid();
  end if;

  return false;
end;
$$;

-- Harden deal-number generation and fix the ambiguous output/local name.
create or replace function public.generate_deal_no(p_company_id text, p_branch_id text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  selected_branch_code text;
  year_part text;
  month_part text;
  seq_num integer;
  generated_deal_no text;
begin
  perform public.assert_company_access(p_company_id);

  select b.code into selected_branch_code
  from public.branches b
  where b.id = p_branch_id and b.company_id = p_company_id;
  selected_branch_code := coalesce(selected_branch_code, 'GEN');
  year_part := to_char(now(), 'YY');
  month_part := to_char(now(), 'MM');

  select coalesce(max(cast(split_part(d.deal_no, '/', 5) as integer)), 0) + 1
    into seq_num
  from public.deals d
  where d.company_id = p_company_id
    and d.branch_id = p_branch_id
    and d.deal_no like 'DEAL/' || selected_branch_code || '/' || year_part || '/' || month_part || '/%';

  generated_deal_no := 'DEAL/' || selected_branch_code || '/' || year_part || '/' || month_part || '/' || lpad(seq_num::text, 3, '0');
  return generated_deal_no;
end;
$$;

-- These aggregate functions do not need elevated privileges. Running them as
-- the caller lets table RLS enforce tenant isolation even if a caller supplies
-- another company's identifier.
alter function public.get_ap_aging_summary(text) security invoker;
alter function public.get_ar_aging_summary(text) security invoker;
alter function public.get_sales_dashboard_summary(text, text) security invoker;
alter function public.get_sales_pipeline_summary(text, text, date, date) security invoker;
alter function public.transition_sales_order_stage(uuid, uuid, text, uuid) security invoker;

-- These two table-returning functions use an `id` output column. Qualify the
-- profile lookup in their stored definitions so PL/pgSQL does not confuse it
-- with the output variable. The migration fails if the expected source shape
-- is absent rather than silently leaving a broken function in place.
do $$
declare
  signature regprocedure;
  function_ddl text;
  repaired_ddl text;
begin
  foreach signature in array array[
    'public.get_reconciliation_queue(text,text,text,integer)'::regprocedure,
    'public.get_reconciliation_match_detail(text,uuid)'::regprocedure
  ]
  loop
    select pg_get_functiondef(signature::oid) into function_ddl;
    repaired_ddl := regexp_replace(
      function_ddl,
      'SELECT 1 FROM profiles[[:space:]]+WHERE id = auth\.uid\(\)',
      'SELECT 1 FROM public.profiles actor WHERE actor.id = auth.uid()',
      'g'
    );
    if repaired_ddl = function_ddl then
      raise exception 'Expected actor lookup was not found in %', signature;
    end if;
    execute repaired_ddl;
  end loop;
end;
$$;

-- Remove anonymous execution and make privileges explicit for every definer
-- function. Trigger/backend functions are service-role only.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('alter function %s set search_path = pg_catalog, public', fn);
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;

  for fn in
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (array[
        'auto_close_resolved_tickets', 'bump_rate_limit',
        'enforce_ticket_attachment_caps', 'fn_sync_leave_balance',
        'fn_update_payroll_run_totals', 'guard_approval_decision_integrity',
        'guard_profile_privilege_changes', 'handle_new_user',
        'normalize_dms_customer', 'normalize_dms_sales_order',
        'normalize_dms_vehicle_stock', 'recompute_invoice_paid_status',
        'recompute_pi_payment_status', 'record_sales_order_status_change',
        'seed_company_branding_for_new_company', 'seed_role_sections_for_new_company'
      ])
  loop
    execute format('revoke all on function %s from authenticated', fn);
  end loop;
end;
$$;

-- Supabase's default grants make newly-created functions callable by anon.
-- No application RPC is intentionally public, so revoke that default across
-- the public schema while preserving explicit authenticated grants.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_catalog.pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

grant execute on function public.request_actor_is_enabled() to authenticated;
grant execute on function public.assert_request_actor_enabled() to authenticator, authenticated, service_role;
grant execute on function public.assert_company_access(text) to authenticated, service_role;
