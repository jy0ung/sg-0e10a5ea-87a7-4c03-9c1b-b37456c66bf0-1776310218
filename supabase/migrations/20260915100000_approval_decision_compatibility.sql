-- Keep the legacy approval_requests engine and the current approval_instances
-- engine usable through one approval_decisions table. Each decision belongs to
-- exactly one engine, and database policy independently verifies the assigned
-- approver before accepting a direct API insert.

alter table public.approval_decisions
  alter column approval_request_id drop not null;

alter table public.approval_decisions
  drop constraint if exists approval_decisions_exactly_one_target;

alter table public.approval_decisions
  add constraint approval_decisions_exactly_one_target
  check ((approval_request_id is null) <> (instance_id is null)) not valid;

alter table public.approval_decisions
  validate constraint approval_decisions_exactly_one_target;

create unique index if not exists approval_decisions_request_step_approver_key
  on public.approval_decisions (approval_request_id, step_id, approver_id)
  where approval_request_id is not null;

create or replace function public.guard_approval_decision_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_step uuid;
  requester uuid;
  allow_self boolean;
  expected_step_order int;
  target_status text;
begin
  if new.instance_id is null then
    select s.id, ar.requester_id, s.allow_self_approval,
           ar.current_step_order, ar.status
      into current_step, requester, allow_self, expected_step_order, target_status
      from public.approval_requests ar
      join public.approval_steps s
        on s.flow_id = ar.flow_id
       and s.id = new.step_id
     where ar.id = new.approval_request_id;

    if not found then
      raise exception 'Approval decision must target the current configured step.';
    end if;
  else
    select ai.current_step_id, ai.requester_id, s.allow_self_approval,
           s.step_order, ai.status
      into current_step, requester, allow_self, expected_step_order, target_status
      from public.approval_instances ai
      left join public.approval_steps s on s.id = ai.current_step_id
     where ai.id = new.instance_id;

    if not found or current_step is null then
      raise exception 'Approval instance has no current step.';
    end if;

    if current_step <> new.step_id then
      raise exception 'Approval decision must target the current pending step.';
    end if;
  end if;

  if target_status <> 'pending' then
    raise exception 'Approval target is not pending.';
  end if;

  if new.step_order is null then
    new.step_order := expected_step_order;
  elsif expected_step_order is distinct from new.step_order then
    raise exception 'Approval decision step order does not match the configured step.';
  end if;

  if requester = new.approver_id and coalesce(allow_self, false) = false then
    raise exception 'Self approval is not allowed for this approval step.';
  end if;

  return new;
end;
$$;

drop policy if exists "approval_decisions: scoped request read" on public.approval_decisions;
drop policy if exists "Current approver insert approval_decisions" on public.approval_decisions;

create policy "approval_decisions: scoped target read"
  on public.approval_decisions for select to authenticated
  using (
    exists (
      select 1
        from public.approval_requests ar
        join public.profiles actor on actor.id = auth.uid()
        join public.approval_steps s on s.id = approval_decisions.step_id
       where ar.id = approval_decisions.approval_request_id
         and ar.company_id = actor.company_id
         and (
           ar.requester_id = auth.uid()
           or approval_decisions.approver_id = auth.uid()
           or actor.role in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
           or (s.approver_type = 'specific_user' and s.approver_user_id = auth.uid())
           or (s.approver_type = 'direct_manager' and exists (
             select 1 from public.profiles requester_profile
              where requester_profile.id = ar.requester_id
                and requester_profile.manager_id = auth.uid()
           ))
           or (s.approver_type = 'role' and exists (
             select 1
               from public.employee_hrms_role_assignments assignment
               join public.hrms_roles role on role.id = assignment.hrms_role_id
              where assignment.company_id = ar.company_id
                and role.is_active
                and assignment.hrms_role_id::text = s.approver_role
                and (
                  assignment.profile_id = auth.uid()
                  or assignment.employee_id = actor.employee_id
                )
           ))
         )
    )
    or exists (
      select 1
        from public.approval_instances ai
        join public.profiles actor on actor.id = auth.uid()
        join public.approval_steps s on s.id = approval_decisions.step_id
       where ai.id = approval_decisions.instance_id
         and ai.company_id = actor.company_id
         and (
           ai.requester_id = auth.uid()
           or approval_decisions.approver_id = auth.uid()
           or actor.role in ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
           or ai.current_approver_user_id = auth.uid()
           or (ai.current_approver_role is not null and exists (
             select 1
               from public.employee_hrms_role_assignments assignment
               join public.hrms_roles role on role.id = assignment.hrms_role_id
              where assignment.company_id = ai.company_id
                and role.is_active
                and assignment.hrms_role_id::text = ai.current_approver_role
                and (
                  assignment.profile_id = auth.uid()
                  or assignment.employee_id = actor.employee_id
                )
           ))
         )
    )
  );

create policy "approval_decisions: assigned approver insert"
  on public.approval_decisions for insert to authenticated
  with check (
    approver_id = auth.uid()
    and (
      exists (
        select 1
          from public.approval_requests ar
          join public.profiles actor on actor.id = auth.uid()
          join public.approval_steps s
            on s.flow_id = ar.flow_id
           and s.id = approval_decisions.step_id
         where ar.id = approval_decisions.approval_request_id
           and ar.company_id = actor.company_id
           and ar.status = 'pending'
           and ar.current_step_order = s.step_order
           and (ar.requester_id <> auth.uid() or s.allow_self_approval)
           and (
             (s.approver_type = 'specific_user' and s.approver_user_id = auth.uid())
             or (s.approver_type = 'direct_manager' and exists (
               select 1 from public.profiles requester_profile
                where requester_profile.id = ar.requester_id
                  and requester_profile.manager_id = auth.uid()
             ))
             or (s.approver_type = 'role' and exists (
               select 1
                 from public.employee_hrms_role_assignments assignment
                 join public.hrms_roles role on role.id = assignment.hrms_role_id
                where assignment.company_id = ar.company_id
                  and role.is_active
                  and assignment.hrms_role_id::text = s.approver_role
                  and (
                    assignment.profile_id = auth.uid()
                    or assignment.employee_id = actor.employee_id
                  )
             ))
           )
      )
      or exists (
        select 1
          from public.approval_instances ai
          join public.profiles actor on actor.id = auth.uid()
          join public.approval_steps s on s.id = ai.current_step_id
         where ai.id = approval_decisions.instance_id
           and ai.company_id = actor.company_id
           and ai.status = 'pending'
           and ai.current_step_id = approval_decisions.step_id
           and (ai.requester_id <> auth.uid() or s.allow_self_approval)
           and (
             ai.current_approver_user_id = auth.uid()
             or (ai.current_approver_role is not null and exists (
               select 1
                 from public.employee_hrms_role_assignments assignment
                 join public.hrms_roles role on role.id = assignment.hrms_role_id
                where assignment.company_id = ai.company_id
                  and role.is_active
                  and assignment.hrms_role_id::text = ai.current_approver_role
                  and (
                    assignment.profile_id = auth.uid()
                    or assignment.employee_id = actor.employee_id
                  )
             ))
           )
      )
    )
  );

revoke all on function public.guard_approval_decision_integrity() from public, anon, authenticated;
grant execute on function public.guard_approval_decision_integrity() to service_role;
