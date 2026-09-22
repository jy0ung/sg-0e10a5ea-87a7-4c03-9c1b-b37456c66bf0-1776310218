import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const shouldRun = process.env.RLS_E2E === '1';
const describeIfLive = shouldRun ? describe : describe.skip;
const companyId = process.env.RLS_COMPANY_A_ID ?? 'rls-a';
const password = 'Test1234!';
let clientSequence = 0;

function isolatedClientOptions(scope: string): Parameters<typeof createClient>[2] {
  clientSequence += 1;
  return {
    auth: {
      persistSession: false,
      storageKey: `atomic-review-${scope}-${clientSequence}`,
    },
    realtime: { transport: WebSocket as never },
  };
}

interface Actor {
  id: string;
  email: string;
  client: SupabaseClient;
  employeeId?: string;
}

interface StepInput {
  name: string;
  approverType: 'role' | 'specific_user' | 'direct_manager';
  approverRole?: string | null;
  approverUserId?: string | null;
  fallbackApproverUserId?: string | null;
  allowSelfApproval?: boolean;
}

interface Scenario {
  ticketId: string;
  instanceId: string;
  flowId: string;
  stepIds: string[];
}

const created = {
  userIds: [] as string[],
  employeeIds: [] as string[],
  roleIds: [] as string[],
  flowIds: [] as string[],
  ticketIds: [] as string[],
  categoryIds: [] as string[],
};

function url() {
  return process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
}

function adminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url() || !serviceKey) {
    throw new Error('Live atomic review tests require Supabase URL and service-role key.');
  }
  return createClient(url(), serviceKey, isolatedClientOptions('admin'));
}

function anonClient() {
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!url() || !anon) {
    throw new Error('Live atomic review tests require Supabase URL and anon key.');
  }
  return createClient(url(), anon, isolatedClientOptions('actor'));
}

async function createActor(label: string): Promise<Actor> {
  const admin = adminClient();
  const email = `atomic-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@rls.test`;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    throw new Error(`Failed to create ${label}: ${authError?.message}`);
  }

  const id = authData.user.id;
  created.userIds.push(id);

  const { error: profileError } = await admin.from('profiles').upsert({
    id,
    email,
    name: `Atomic ${label}`,
    role: 'creator_updater',
    access_scope: 'self',
    company_id: companyId,
    status: 'active',
  });
  if (profileError) throw new Error(`Failed to upsert ${label} profile: ${profileError.message}`);

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Failed to sign in ${label}: ${signInError.message}`);

  return { id, email, client };
}

async function createEmployee(actor: Actor, name: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.from('employees').insert({
    company_id: companyId,
    name,
    primary_role: 'analyst',
    status: 'active',
  }).select('id').single();
  if (error || !data?.id) throw new Error(`Failed to create Employee: ${error?.message}`);

  const employeeId = String(data.id);
  created.employeeIds.push(employeeId);
  actor.employeeId = employeeId;

  const { error: profileError } = await admin.from('profiles')
    .update({ employee_id: employeeId })
    .eq('id', actor.id);
  if (profileError) throw new Error(`Failed to link Profile to Employee: ${profileError.message}`);

  return employeeId;
}

async function createRole(code: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.from('hrms_roles').insert({
    company_id: companyId,
    code,
    name: code.replace(/_/g, ' '),
    category: 'custom',
    scope: 'company',
    authority_level: 70,
    can_approve_requests: true,
    is_active: true,
  }).select('id').single();
  if (error || !data?.id) throw new Error(`Failed to create HRMS Role: ${error?.message}`);
  const id = String(data.id);
  created.roleIds.push(id);
  return id;
}

async function assignRole(actor: Actor, roleId: string) {
  if (!actor.employeeId) throw new Error('Role actor must have an Employee.');
  const admin = adminClient();
  const { error } = await admin.from('employee_hrms_role_assignments').insert({
    company_id: companyId,
    hrms_role_id: roleId,
    employee_id: actor.employeeId,
    profile_id: actor.id,
    is_primary: true,
  });
  if (error) throw new Error(`Failed to assign HRMS Role: ${error.message}`);
}

async function createScenario(
  requester: Actor,
  steps: StepInput[],
): Promise<Scenario> {
  const admin = adminClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: flow, error: flowError } = await admin.from('approval_flows').insert({
    company_id: companyId,
    name: `Atomic Review ${suffix}`,
    entity_type: 'internal_request',
    is_active: true,
    is_default: false,
    match_priority: 0,
  }).select('id').single();
  if (flowError || !flow?.id) throw new Error(`Failed to create Flow: ${flowError?.message}`);
  const flowId = String(flow.id);
  created.flowIds.push(flowId);

  const stepRows = steps.map((step, index) => ({
    flow_id: flowId,
    step_order: index + 1,
    name: step.name,
    approver_type: step.approverType,
    approver_role: step.approverRole ?? null,
    approver_user_id: step.approverUserId ?? null,
    fallback_approver_user_id: step.fallbackApproverUserId ?? null,
    is_active: true,
    allow_self_approval: step.allowSelfApproval ?? false,
  }));
  const { data: createdSteps, error: stepError } = await admin
    .from('approval_steps')
    .insert(stepRows)
    .select('id, step_order, name, approver_type, approver_role, approver_user_id');
  if (stepError || !createdSteps?.length) {
    throw new Error(`Failed to create Approval Steps: ${stepError?.message}`);
  }
  const orderedSteps = [...createdSteps].sort((a, b) => a.step_order - b.step_order);
  const firstStep = orderedSteps[0];

  const categoryKey = 'atomic_review';
  const { data: category, error: categoryError } = await admin
    .from('request_categories')
    .upsert({
      company_id: companyId,
      category_key: categoryKey,
      label: 'Atomic Review',
      is_active: true,
      sort_order: 999,
    }, { onConflict: 'company_id,category_key' })
    .select('id')
    .single();
  if (categoryError) throw new Error(`Failed to create request category: ${categoryError.message}`);
  if (category?.id && !created.categoryIds.includes(String(category.id))) {
    created.categoryIds.push(String(category.id));
  }

  const { data: ticket, error: ticketError } = await admin.from('tickets').insert({
    company_id: companyId,
    subject: `Atomic request ${suffix}`,
    category: categoryKey,
    priority: 'medium',
    description: 'Atomic approval review integration fixture',
    status: 'open',
    submitted_by: requester.id,
  }).select('id').single();
  if (ticketError || !ticket?.id) throw new Error(`Failed to create Ticket: ${ticketError?.message}`);
  const ticketId = String(ticket.id);
  created.ticketIds.push(ticketId);

  const firstInput = steps[0];
  const currentRole = firstInput.approverType === 'role'
    ? firstInput.approverRole ?? null
    : null;
  const currentUser = firstInput.approverType === 'specific_user'
    ? firstInput.approverUserId ?? null
    : firstInput.approverType === 'direct_manager'
      ? null
      : null;

  const { data: instance, error: instanceError } = await admin.from('approval_instances').insert({
    company_id: companyId,
    flow_id: flowId,
    entity_type: 'internal_request',
    entity_id: ticketId,
    requester_id: requester.id,
    current_step_id: firstStep.id,
    current_step_order: firstStep.step_order,
    current_step_name: firstStep.name,
    current_approver_role: currentRole,
    current_approver_user_id: currentUser,
    status: 'pending',
  }).select('id').single();
  if (instanceError || !instance?.id) {
    throw new Error(`Failed to create Approval Instance: ${instanceError?.message}`);
  }

  return {
    ticketId,
    instanceId: String(instance.id),
    flowId,
    stepIds: orderedSteps.map(step => String(step.id)),
  };
}

async function review(
  actor: Actor,
  scenario: Scenario,
  decision: 'approved' | 'rejected',
  note: string | null = null,
  expectedStepId = scenario.stepIds[0],
) {
  return actor.client.rpc('review_internal_request_approval' as never, {
    p_company_id: companyId,
    p_ticket_id: scenario.ticketId,
    p_expected_step_id: expectedStepId,
    p_decision: decision,
    p_note: note,
  } as never);
}

describeIfLive('Internal Request atomic approval review', () => {
  let requester: Actor;
  let specificApprover: Actor;
  let roleApprover: Actor;
  let concurrentRoleApprover: Actor;
  let manager: Actor;
  let fallbackApprover: Actor;
  let otherActor: Actor;
  let assignedRoleId: string;
  let fallbackRoleId: string;

  beforeAll(async () => {
    requester = await createActor('requester');
    specificApprover = await createActor('specific');
    roleApprover = await createActor('role');
    concurrentRoleApprover = await createActor('role-concurrent');
    manager = await createActor('manager');
    fallbackApprover = await createActor('fallback');
    otherActor = await createActor('other');

    const requesterEmployee = await createEmployee(requester, 'Atomic Requester');
    const managerEmployee = await createEmployee(manager, 'Atomic Manager');
    await createEmployee(roleApprover, 'Atomic Role Approver');
    await createEmployee(concurrentRoleApprover, 'Atomic Concurrent Role Approver');

    const { error: managerError } = await adminClient().from('employees')
      .update({ manager_employee_id: managerEmployee })
      .eq('id', requesterEmployee);
    if (managerError) throw new Error(`Failed to link manager: ${managerError.message}`);

    assignedRoleId = await createRole(`atomic_reviewer_${Date.now()}`);
    fallbackRoleId = await createRole(`atomic_fallback_${Date.now()}`);
    await assignRole(roleApprover, assignedRoleId);
    await assignRole(concurrentRoleApprover, assignedRoleId);
  }, 60_000);

  afterAll(async () => {
    const admin = adminClient();

    if (created.ticketIds.length > 0) {
      await admin.from('approval_instances').delete().in('entity_id', created.ticketIds);
      await admin.from('tickets').delete().in('id', created.ticketIds);
    }
    if (created.flowIds.length > 0) {
      await admin.from('approval_flows').delete().in('id', created.flowIds);
    }
    if (created.roleIds.length > 0) {
      await admin.from('employee_hrms_role_assignments').delete().in('hrms_role_id', created.roleIds);
      await admin.from('hrms_roles').delete().in('id', created.roleIds);
    }
    if (created.employeeIds.length > 0) {
      await admin.from('employees').delete().in('id', created.employeeIds);
    }
    if (created.categoryIds.length > 0) {
      await admin.from('request_categories').delete().in('id', created.categoryIds);
    }
    if (created.userIds.length > 0) {
      await admin.from('profiles').delete().in('id', created.userIds);
      for (const userId of created.userIds) {
        await admin.auth.admin.deleteUser(userId);
      }
    }
  }, 60_000);

  it('allows the assigned specific-user approver and completes a final approval', async () => {
    const scenario = await createScenario(requester, [{
      name: 'Specific Approval',
      approverType: 'specific_user',
      approverUserId: specificApprover.id,
    }]);

    const { data, error } = await review(specificApprover, scenario, 'approved', 'Approved');
    expect(error).toBeNull();
    expect(data).toMatchObject({
      instanceId: scenario.instanceId,
      decision: 'approved',
      finalDecision: true,
      nextApprovalStep: null,
    });

    const admin = adminClient();
    const [{ data: instance }, { count: decisions }, { count: activity }] = await Promise.all([
      admin.from('approval_instances').select('status, current_step_id').eq('id', scenario.instanceId).single(),
      admin.from('approval_decisions').select('id', { count: 'exact', head: true }).eq('instance_id', scenario.instanceId),
      admin.from('ticket_activity').select('id', { count: 'exact', head: true })
        .eq('ticket_id', scenario.ticketId)
        .eq('message', 'Request approval completed.'),
    ]);

    expect(instance?.status).toBe('approved');
    expect(instance?.current_step_id).toBeNull();
    expect(decisions).toBe(1);
    expect(activity).toBe(1);

    const stale = await review(specificApprover, scenario, 'approved', null);
    expect(stale.error).not.toBeNull();
    expect(stale.error?.message).toMatch(/already approved|not pending/i);
  });

  it('allows an active HRMS Role assignee to approve', async () => {
    const scenario = await createScenario(requester, [{
      name: 'Role Approval',
      approverType: 'role',
      approverRole: assignedRoleId,
    }]);

    const { error } = await review(roleApprover, scenario, 'approved');
    expect(error).toBeNull();

    const { data: instance } = await adminClient().from('approval_instances')
      .select('status')
      .eq('id', scenario.instanceId)
      .single();
    expect(instance?.status).toBe('approved');
  });

  it('denies a same-company actor who is not the materialized approver', async () => {
    const scenario = await createScenario(requester, [{
      name: 'Assigned User Only',
      approverType: 'specific_user',
      approverUserId: specificApprover.id,
    }]);

    const { error } = await review(otherActor, scenario, 'approved');
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not the assigned approver/i);

    const admin = adminClient();
    const [{ data: instance }, { count: decisions }] = await Promise.all([
      admin.from('approval_instances').select('status').eq('id', scenario.instanceId).single(),
      admin.from('approval_decisions').select('id', { count: 'exact', head: true }).eq('instance_id', scenario.instanceId),
    ]);
    expect(instance?.status).toBe('pending');
    expect(decisions).toBe(0);
  });

  it('denies self approval when the current Step disallows it', async () => {
    const scenario = await createScenario(requester, [{
      name: 'No Self Approval',
      approverType: 'specific_user',
      approverUserId: requester.id,
      allowSelfApproval: false,
    }]);

    const { error } = await review(requester, scenario, 'approved');
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/cannot approve or reject your own request/i);

    const { count } = await adminClient().from('approval_decisions')
      .select('id', { count: 'exact', head: true })
      .eq('instance_id', scenario.instanceId);
    expect(count).toBe(0);
  });

  it('serializes two valid Role assignees and rejects the stale expected Step', async () => {
    const scenario = await createScenario(requester, [
      {
        name: 'Role Step 1',
        approverType: 'role',
        approverRole: assignedRoleId,
      },
      {
        name: 'Role Step 2',
        approverType: 'role',
        approverRole: assignedRoleId,
      },
    ]);

    const [first, second] = await Promise.all([
      review(roleApprover, scenario, 'approved'),
      review(concurrentRoleApprover, scenario, 'approved'),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter(result => result.error === null)).toHaveLength(1);
    expect(outcomes.filter(result => result.error !== null)).toHaveLength(1);
    expect(outcomes.find(result => result.error)?.error?.message).toMatch(/stale|current step has changed/i);

    const admin = adminClient();
    const [{ data: instance }, { count: decisions }] = await Promise.all([
      admin.from('approval_instances')
        .select('status, current_step_id, current_approver_role')
        .eq('id', scenario.instanceId)
        .single(),
      admin.from('approval_decisions').select('id', { count: 'exact', head: true }).eq('instance_id', scenario.instanceId),
    ]);

    expect(instance?.status).toBe('pending');
    expect(instance?.current_step_id).toBe(scenario.stepIds[1]);
    expect(instance?.current_approver_role).toBe(assignedRoleId);
    expect(decisions).toBe(1);
  }, 15_000);

  it('rejects atomically across Decision, Instance, Ticket, and Activity', async () => {
    const scenario = await createScenario(requester, [{
      name: 'Rejectable Approval',
      approverType: 'specific_user',
      approverUserId: specificApprover.id,
    }]);

    const { error } = await review(
      specificApprover,
      scenario,
      'rejected',
      'Budget not approved',
    );
    expect(error).toBeNull();

    const admin = adminClient();
    const [instanceResult, ticketResult, decisionResult, activityResult] = await Promise.all([
      admin.from('approval_instances')
        .select('status, current_step_id')
        .eq('id', scenario.instanceId)
        .single(),
      admin.from('tickets')
        .select('status, resolution_note, last_action_by')
        .eq('id', scenario.ticketId)
        .single(),
      admin.from('approval_decisions')
        .select('decision, note')
        .eq('instance_id', scenario.instanceId)
        .single(),
      admin.from('ticket_activity')
        .select('event_type, message, metadata')
        .eq('ticket_id', scenario.ticketId)
        .eq('message', 'Request rejected during approval.')
        .single(),
    ]);

    expect(instanceResult.data).toMatchObject({
      status: 'rejected',
      current_step_id: null,
    });
    expect(ticketResult.data).toMatchObject({
      status: 'cancelled',
      resolution_note: 'Budget not approved',
      last_action_by: specificApprover.id,
    });
    expect(decisionResult.data).toMatchObject({
      decision: 'rejected',
      note: 'Budget not approved',
    });
    expect(activityResult.data).toMatchObject({
      event_type: 'status_changed',
      message: 'Request rejected during approval.',
    });
  });

  it('advances an intermediate approval to the next specific-user Step', async () => {
    const scenario = await createScenario(requester, [
      {
        name: 'First Review',
        approverType: 'specific_user',
        approverUserId: specificApprover.id,
      },
      {
        name: 'Second Review',
        approverType: 'specific_user',
        approverUserId: fallbackApprover.id,
      },
    ]);

    const { data, error } = await review(specificApprover, scenario, 'approved');
    expect(error).toBeNull();
    expect(data).toMatchObject({
      finalDecision: false,
      nextApprovalStep: 'Second Review',
    });

    const { data: instance } = await adminClient().from('approval_instances')
      .select('status, current_step_id, current_approver_role, current_approver_user_id')
      .eq('id', scenario.instanceId)
      .single();

    expect(instance).toMatchObject({
      status: 'pending',
      current_step_id: scenario.stepIds[1],
      current_approver_role: null,
      current_approver_user_id: fallbackApprover.id,
    });
  });

  it('uses the configured fallback Profile when the next HRMS Role has no assignees', async () => {
    const scenario = await createScenario(requester, [
      {
        name: 'Initial Review',
        approverType: 'specific_user',
        approverUserId: specificApprover.id,
      },
      {
        name: 'Unstaffed Role',
        approverType: 'role',
        approverRole: fallbackRoleId,
        fallbackApproverUserId: fallbackApprover.id,
      },
    ]);

    const { error } = await review(specificApprover, scenario, 'approved');
    expect(error).toBeNull();

    const { data: instance } = await adminClient().from('approval_instances')
      .select('current_step_id, current_approver_role, current_approver_user_id')
      .eq('id', scenario.instanceId)
      .single();

    expect(instance).toMatchObject({
      current_step_id: scenario.stepIds[1],
      current_approver_role: null,
      current_approver_user_id: fallbackApprover.id,
    });
  });

  it('resolves the next direct-manager Step through canonical Employee manager identity', async () => {
    const scenario = await createScenario(requester, [
      {
        name: 'Initial Review',
        approverType: 'specific_user',
        approverUserId: specificApprover.id,
      },
      {
        name: 'Manager Review',
        approverType: 'direct_manager',
      },
    ]);

    const { error } = await review(specificApprover, scenario, 'approved');
    expect(error).toBeNull();

    const { data: instance } = await adminClient().from('approval_instances')
      .select('current_step_id, current_approver_role, current_approver_user_id')
      .eq('id', scenario.instanceId)
      .single();

    expect(instance).toMatchObject({
      current_step_id: scenario.stepIds[1],
      current_approver_role: null,
      current_approver_user_id: manager.id,
    });
  });
});
