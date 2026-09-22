import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const describeIfLive = process.env.RLS_E2E === '1' ? describe : describe.skip;

function clientOptions(storageKey: string): Parameters<typeof createClient>[2] {
  return {
    auth: { persistSession: false, storageKey },
    realtime: { transport: WebSocket as never },
  };
}

type ReviewResponse = {
  data: unknown;
  error: { message: string } | null;
};

async function callReview(
  client: SupabaseClient,
  args: {
    companyId: string;
    ticketId: string;
    expectedStepId: string;
    decision: 'approved' | 'rejected';
    note?: string | null;
  },
): Promise<ReviewResponse> {
  const rpc = client.rpc as unknown as (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<ReviewResponse>;

  return rpc('review_internal_request_approval', {
    p_company_id: args.companyId,
    p_ticket_id: args.ticketId,
    p_expected_step_id: args.expectedStepId,
    p_decision: args.decision,
    p_note: args.note ?? null,
  });
}

describeIfLive('Internal Request atomic approval review', () => {
  let admin: SupabaseClient;
  let requester: SupabaseClient;
  let approver: SupabaseClient;
  let requesterId = '';
  let approverId = '';
  let companyId = '';
  let requesterEmployeeId = '';
  let approverEmployeeId = '';
  let assignedRoleId = '';
  let fallbackRoleId = '';
  let assignmentId = '';
  let flowId = '';
  let step1Id = '';
  let step2Id = '';
  let step3Id = '';
  let approvalTicketId = '';
  let approvalInstanceId = '';
  let rejectionTicketId = '';
  let rejectionInstanceId = '';
  const approverEmail = `atomic-approval-${crypto.randomUUID()}@rls.test`;
  const approverPassword = 'Test1234!';

  beforeAll(async () => {
    const url = process.env.VITE_SUPABASE_URL ?? '';
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!url || !anonKey || !serviceKey) {
      throw new Error('Live Supabase credentials are required');
    }

    admin = createClient(url, serviceKey, clientOptions('atomic-review-admin'));
    requester = createClient(url, anonKey, clientOptions('atomic-review-requester'));
    approver = createClient(url, anonKey, clientOptions('atomic-review-approver'));

    const requesterSignIn = await requester.auth.signInWithPassword({
      email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      password: process.env.RLS_USER_A_PASSWORD ?? 'Test1234!',
    });
    if (requesterSignIn.error || !requesterSignIn.data.user) {
      throw new Error(requesterSignIn.error?.message);
    }
    requesterId = requesterSignIn.data.user.id;

    const requesterProfile = await admin
      .from('profiles')
      .select('company_id')
      .eq('id', requesterId)
      .single();
    if (requesterProfile.error || !requesterProfile.data?.company_id) {
      throw new Error(requesterProfile.error?.message);
    }
    companyId = String(requesterProfile.data.company_id);

    const approverUser = await admin.auth.admin.createUser({
      email: approverEmail,
      password: approverPassword,
      email_confirm: true,
    });
    if (approverUser.error || !approverUser.data.user) {
      throw new Error(approverUser.error?.message);
    }
    approverId = approverUser.data.user.id;

    const approverEmployee = await admin
      .from('employees')
      .insert({
        company_id: companyId,
        name: 'Atomic Approval Manager',
        work_email: approverEmail,
        primary_role: 'manager',
        staff_code: `ATM-${crypto.randomUUID()}`,
      })
      .select('id')
      .single();
    if (approverEmployee.error || !approverEmployee.data) {
      throw new Error(approverEmployee.error?.message);
    }
    approverEmployeeId = String(approverEmployee.data.id);

    const requesterEmployee = await admin
      .from('employees')
      .insert({
        company_id: companyId,
        name: 'Atomic Approval Requester',
        work_email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
        primary_role: 'creator_updater',
        manager_employee_id: approverEmployeeId,
        staff_code: `ATR-${crypto.randomUUID()}`,
      })
      .select('id')
      .single();
    if (requesterEmployee.error || !requesterEmployee.data) {
      throw new Error(requesterEmployee.error?.message);
    }
    requesterEmployeeId = String(requesterEmployee.data.id);

    const requesterLink = await admin
      .from('profiles')
      .update({ employee_id: requesterEmployeeId })
      .eq('id', requesterId);
    if (requesterLink.error) throw new Error(requesterLink.error.message);

    const approverProfile = await admin.from('profiles').upsert({
      id: approverId,
      email: approverEmail,
      name: 'Atomic Approval Manager',
      role: 'manager',
      access_scope: 'company',
      company_id: companyId,
      employee_id: approverEmployeeId,
      status: 'active',
    });
    if (approverProfile.error) throw new Error(approverProfile.error.message);

    const approverSignIn = await approver.auth.signInWithPassword({
      email: approverEmail,
      password: approverPassword,
    });
    if (approverSignIn.error) throw new Error(approverSignIn.error.message);

    const assignedRole = await admin
      .from('hrms_roles')
      .insert({
        company_id: companyId,
        code: `atomic_assigned_${crypto.randomUUID().slice(0, 8)}`,
        name: 'Atomic Assigned Approver',
        category: 'custom',
        scope: 'company',
        authority_level: 50,
        can_approve_requests: true,
        is_active: true,
        is_system_default: false,
        created_by: approverId,
        updated_by: approverId,
      })
      .select('id')
      .single();
    if (assignedRole.error || !assignedRole.data) {
      throw new Error(assignedRole.error?.message);
    }
    assignedRoleId = String(assignedRole.data.id);

    const fallbackRole = await admin
      .from('hrms_roles')
      .insert({
        company_id: companyId,
        code: `atomic_fallback_${crypto.randomUUID().slice(0, 8)}`,
        name: 'Atomic Empty Approver',
        category: 'custom',
        scope: 'company',
        authority_level: 55,
        can_approve_requests: true,
        is_active: true,
        is_system_default: false,
        created_by: approverId,
        updated_by: approverId,
      })
      .select('id')
      .single();
    if (fallbackRole.error || !fallbackRole.data) {
      throw new Error(fallbackRole.error?.message);
    }
    fallbackRoleId = String(fallbackRole.data.id);

    const assignment = await admin
      .from('employee_hrms_role_assignments')
      .insert({
        company_id: companyId,
        hrms_role_id: assignedRoleId,
        employee_id: approverEmployeeId,
        profile_id: approverId,
        is_primary: true,
        assigned_by: approverId,
      })
      .select('id')
      .single();
    if (assignment.error || !assignment.data) {
      throw new Error(assignment.error?.message);
    }
    assignmentId = String(assignment.data.id);

    const flow = await admin
      .from('approval_flows')
      .insert({
        company_id: companyId,
        entity_type: 'internal_request',
        name: `Atomic review flow ${crypto.randomUUID()}`,
        is_active: true,
        is_default: false,
        created_by: approverId,
        updated_by: approverId,
      })
      .select('id')
      .single();
    if (flow.error || !flow.data) throw new Error(flow.error?.message);
    flowId = String(flow.data.id);

    const steps = await admin
      .from('approval_steps')
      .insert([
        {
          flow_id: flowId,
          step_order: 1,
          name: 'Role approval',
          approver_type: 'role',
          approver_role: assignedRoleId,
          allow_self_approval: false,
        },
        {
          flow_id: flowId,
          step_order: 2,
          name: 'Fallback approval',
          approver_type: 'role',
          approver_role: fallbackRoleId,
          fallback_approver_user_id: approverId,
          allow_self_approval: false,
        },
        {
          flow_id: flowId,
          step_order: 3,
          name: 'Direct manager approval',
          approver_type: 'direct_manager',
          allow_self_approval: false,
        },
      ])
      .select('id, step_order');
    if (steps.error || !steps.data) throw new Error(steps.error?.message);
    const stepByOrder = new Map(
      steps.data.map((step) => [Number(step.step_order), String(step.id)]),
    );
    step1Id = stepByOrder.get(1) ?? '';
    step2Id = stepByOrder.get(2) ?? '';
    step3Id = stepByOrder.get(3) ?? '';
    if (!step1Id || !step2Id || !step3Id) {
      throw new Error('Atomic review fixture steps were not created');
    }

    const createTicketAndInstance = async (subject: string) => {
      const ticket = await admin
        .from('tickets')
        .insert({
          company_id: companyId,
          subject,
          description: 'Atomic approval review qualification.',
          category: 'operations_support',
          priority: 'medium',
          submitted_by: requesterId,
          status: 'open',
        })
        .select('id')
        .single();
      if (ticket.error || !ticket.data) throw new Error(ticket.error?.message);

      const ticketId = String(ticket.data.id);
      const instance = await admin
        .from('approval_instances')
        .insert({
          company_id: companyId,
          flow_id: flowId,
          entity_type: 'internal_request',
          entity_id: ticketId,
          requester_id: requesterId,
          current_step_id: step1Id,
          current_step_order: 1,
          current_step_name: 'Role approval',
          current_approver_role: assignedRoleId,
          current_approver_user_id: null,
          status: 'pending',
        })
        .select('id')
        .single();
      if (instance.error || !instance.data) throw new Error(instance.error?.message);

      return {
        ticketId,
        instanceId: String(instance.data.id),
      };
    };

    const approvalFixture = await createTicketAndInstance('Atomic approval success');
    approvalTicketId = approvalFixture.ticketId;
    approvalInstanceId = approvalFixture.instanceId;

    const rejectionFixture = await createTicketAndInstance('Atomic approval rejection');
    rejectionTicketId = rejectionFixture.ticketId;
    rejectionInstanceId = rejectionFixture.instanceId;
  });

  afterAll(async () => {
    const cleanupErrors: string[] = [];
    const record = (label: string, error: { message: string } | null) => {
      if (error) cleanupErrors.push(`${label}: ${error.message}`);
    };

    const instanceIds = [approvalInstanceId, rejectionInstanceId].filter(Boolean);
    const ticketIds = [approvalTicketId, rejectionTicketId].filter(Boolean);

    if (instanceIds.length > 0) {
      record(
        'approval decisions',
        (await admin.from('approval_decisions').delete().in('instance_id', instanceIds)).error,
      );
      record(
        'approval instances',
        (await admin.from('approval_instances').delete().in('id', instanceIds)).error,
      );
    }

    if (ticketIds.length > 0) {
      record(
        'ticket activity',
        (await admin.from('ticket_activity').delete().in('ticket_id', ticketIds)).error,
      );
      record(
        'tickets',
        (await admin.from('tickets').delete().in('id', ticketIds)).error,
      );
    }

    if (step1Id || step2Id || step3Id) {
      record(
        'approval steps',
        (await admin.from('approval_steps').delete().in(
          'id',
          [step1Id, step2Id, step3Id].filter(Boolean),
        )).error,
      );
    }
    if (flowId) {
      record('approval flow', (await admin.from('approval_flows').delete().eq('id', flowId)).error);
    }
    if (assignmentId) {
      record(
        'role assignment',
        (await admin.from('employee_hrms_role_assignments').delete().eq('id', assignmentId)).error,
      );
    }
    if (assignedRoleId || fallbackRoleId) {
      record(
        'HRMS roles',
        (await admin.from('hrms_roles').delete().in(
          'id',
          [assignedRoleId, fallbackRoleId].filter(Boolean),
        )).error,
      );
    }

    record(
      'requester profile unlink',
      (await admin.from('profiles').update({ employee_id: null }).eq('id', requesterId)).error,
    );
    if (requesterEmployeeId || approverEmployeeId) {
      record(
        'employees',
        (await admin.from('employees').delete().in(
          'id',
          [requesterEmployeeId, approverEmployeeId].filter(Boolean),
        )).error,
      );
    }
    if (approverId) {
      record('approver auth user', (await admin.auth.admin.deleteUser(approverId)).error);
    }

    if (cleanupErrors.length > 0) {
      throw new Error(`Atomic approval cleanup failed: ${cleanupErrors.join('; ')}`);
    }
  });

  it('serializes one observed step and advances through role, fallback, and direct-manager routing', async () => {
    const unauthorized = await callReview(requester, {
      companyId,
      ticketId: approvalTicketId,
      expectedStepId: step1Id,
      decision: 'approved',
    });
    expect(unauthorized.error?.message).toMatch(/not the assigned approver/i);

    const concurrent = await Promise.all([
      callReview(approver, {
        companyId,
        ticketId: approvalTicketId,
        expectedStepId: step1Id,
        decision: 'approved',
        note: 'Concurrent role approval A',
      }),
      callReview(approver, {
        companyId,
        ticketId: approvalTicketId,
        expectedStepId: step1Id,
        decision: 'approved',
        note: 'Concurrent role approval B',
      }),
    ]);

    const successes = concurrent.filter((result) => result.error === null);
    const failures = concurrent.filter((result) => result.error !== null);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].error?.message).toMatch(/step changed/i);

    const afterRole = await admin
      .from('approval_instances')
      .select('status, current_step_id, current_approver_role, current_approver_user_id')
      .eq('id', approvalInstanceId)
      .single();
    expect(afterRole.error).toBeNull();
    expect(afterRole.data).toMatchObject({
      status: 'pending',
      current_step_id: step2Id,
      current_approver_role: null,
      current_approver_user_id: approverId,
    });

    const fallbackApproval = await callReview(approver, {
      companyId,
      ticketId: approvalTicketId,
      expectedStepId: step2Id,
      decision: 'approved',
      note: 'Fallback reviewer accepted',
    });
    expect(fallbackApproval.error).toBeNull();

    const afterFallback = await admin
      .from('approval_instances')
      .select('status, current_step_id, current_approver_role, current_approver_user_id')
      .eq('id', approvalInstanceId)
      .single();
    expect(afterFallback.error).toBeNull();
    expect(afterFallback.data).toMatchObject({
      status: 'pending',
      current_step_id: step3Id,
      current_approver_role: null,
      current_approver_user_id: approverId,
    });

    const finalApproval = await callReview(approver, {
      companyId,
      ticketId: approvalTicketId,
      expectedStepId: step3Id,
      decision: 'approved',
      note: 'Manager final approval',
    });
    expect(finalApproval.error).toBeNull();

    const [instance, decisions, activity] = await Promise.all([
      admin
        .from('approval_instances')
        .select('status, current_step_id, current_approver_role, current_approver_user_id')
        .eq('id', approvalInstanceId)
        .single(),
      admin
        .from('approval_decisions')
        .select('step_id, approver_id, decision')
        .eq('instance_id', approvalInstanceId)
        .order('decided_at'),
      admin
        .from('ticket_activity')
        .select('event_type, message')
        .eq('ticket_id', approvalTicketId)
        .eq('message', 'Request approval completed.'),
    ]);

    expect(instance.data).toMatchObject({
      status: 'approved',
      current_step_id: null,
      current_approver_role: null,
      current_approver_user_id: null,
    });
    expect(decisions.data).toHaveLength(3);
    expect(decisions.data?.map((row) => row.step_id)).toEqual([
      step1Id,
      step2Id,
      step3Id,
    ]);
    expect(decisions.data?.every((row) => row.approver_id === approverId)).toBe(true);
    expect(decisions.data?.every((row) => row.decision === 'approved')).toBe(true);
    expect(activity.data).toEqual([
      {
        event_type: 'comment_added',
        message: 'Request approval completed.',
      },
    ]);
  });

  it('rejects a request atomically across Decision, Instance, Ticket, and Activity', async () => {
    const rejected = await callReview(approver, {
      companyId,
      ticketId: rejectionTicketId,
      expectedStepId: step1Id,
      decision: 'rejected',
      note: 'Supporting document is invalid',
    });
    expect(rejected.error).toBeNull();

    const [instance, ticket, decisions, activity] = await Promise.all([
      admin
        .from('approval_instances')
        .select('status, current_step_id, current_approver_role, current_approver_user_id')
        .eq('id', rejectionInstanceId)
        .single(),
      admin
        .from('tickets')
        .select('status, resolution_note, resolved_at, last_action_by')
        .eq('id', rejectionTicketId)
        .single(),
      admin
        .from('approval_decisions')
        .select('step_id, approver_id, decision, note')
        .eq('instance_id', rejectionInstanceId),
      admin
        .from('ticket_activity')
        .select('event_type, message, metadata')
        .eq('ticket_id', rejectionTicketId)
        .eq('message', 'Request rejected during approval.'),
    ]);

    expect(instance.data).toMatchObject({
      status: 'rejected',
      current_step_id: null,
      current_approver_role: null,
      current_approver_user_id: null,
    });
    expect(ticket.data).toMatchObject({
      status: 'cancelled',
      resolution_note: 'Supporting document is invalid',
      last_action_by: approverId,
    });
    expect(ticket.data?.resolved_at).toBeTruthy();
    expect(decisions.data).toEqual([
      {
        step_id: step1Id,
        approver_id: approverId,
        decision: 'rejected',
        note: 'Supporting document is invalid',
      },
    ]);
    expect(activity.data).toHaveLength(1);
    expect(activity.data?.[0]).toMatchObject({
      event_type: 'status_changed',
      message: 'Request rejected during approval.',
    });
  });
});
