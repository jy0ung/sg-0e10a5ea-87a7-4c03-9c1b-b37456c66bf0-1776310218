do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'approval_flows'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%entity_type%'
  loop
    execute format('alter table public.approval_flows drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.approval_flows
  add constraint approval_flows_entity_type_check
  check (entity_type in ('leave_request','payroll_run','appraisal','internal_request','general'));

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.approval_instances') is null then
    return;
  end if;

  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'approval_instances'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%entity_type%'
  loop
    execute format('alter table public.approval_instances drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.approval_instances
  add constraint approval_instances_entity_type_check
  check (entity_type in ('leave_request','payroll_run','appraisal','internal_request','general'));

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.approval_requests') is null then
    return;
  end if;

  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'approval_requests'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%entity_type%'
  loop
    execute format('alter table public.approval_requests drop constraint %I', constraint_name);
  end loop;

  alter table public.approval_requests
    add constraint approval_requests_entity_type_check
    check (entity_type in ('leave_request','payroll_run','appraisal','internal_request','general'));
end $$;

comment on constraint approval_flows_entity_type_check on public.approval_flows is
  'Allows HRMS and Internal Request entities to use the shared approval flow configuration.';

comment on constraint approval_instances_entity_type_check on public.approval_instances is
  'Allows Internal Requests to run through the shared approval execution engine.';