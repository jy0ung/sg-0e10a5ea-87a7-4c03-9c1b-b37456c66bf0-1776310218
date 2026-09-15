import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { supabase as appClient } from '@flc/supabase';
import {
  createLeaveRequest,
  reviewLeaveRequest,
} from '../../packages/hrms-services/src/leave/leaveService';

const describeIfLive = process.env.RLS_E2E === '1' ? describe : describe.skip;

function clientOptions(storageKey: string): Parameters<typeof createClient>[2] {
  return {
    auth: { persistSession: false, storageKey },
    realtime: { transport: WebSocket as never },
  };
}

describeIfLive('release-critical approval workflows', () => {
  let admin: SupabaseClient;
  let requester: SupabaseClient;
  let approver: SupabaseClient;
  let otherTenant: SupabaseClient;
  let requesterId = '';
  let approverId = '';
  let otherTenantId = '';
  let companyId = '';
  let requesterEmployeeId = '';
  let approverEmployeeId = '';
  let leaveTypeId = '';
  let leaveFlowId = '';
  let leaveStepId = '';
  let leaveRequestId = '';
  let legacyFlowId = '';
  let legacyStepId = '';
  let legacyRequestId = '';
  const approverEmail = `release-approver-${crypto.randomUUID()}@rls.test`;
  const approverPassword = 'Test1234!';

  beforeAll(async () => {
    const url = process.env.VITE_SUPABASE_URL ?? '';
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!url || !anonKey || !serviceKey) throw new Error('Live Supabase credentials are required');

    admin = createClient(url, serviceKey, clientOptions('release-workflow-admin'));
    requester = createClient(url, anonKey, clientOptions('release-workflow-requester'));
    approver = createClient(url, anonKey, clientOptions('release-workflow-approver'));
    otherTenant = createClient(url, anonKey, clientOptions('release-workflow-other-tenant'));

    const requesterSignIn = await requester.auth.signInWithPassword({
      email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      password: process.env.RLS_USER_A_PASSWORD ?? 'Test1234!',
    });
    if (requesterSignIn.error || !requesterSignIn.data.user) throw new Error(requesterSignIn.error?.message);
    requesterId = requesterSignIn.data.user.id;

    const otherSignIn = await otherTenant.auth.signInWithPassword({
      email: process.env.RLS_USER_B_EMAIL ?? 'b@rls.test',
      password: process.env.RLS_USER_B_PASSWORD ?? 'Test1234!',
    });
    if (otherSignIn.error || !otherSignIn.data.user) throw new Error(otherSignIn.error?.message);
    otherTenantId = otherSignIn.data.user.id;

    const requesterProfile = await admin.from('profiles').select('company_id').eq('id', requesterId).single();
    if (requesterProfile.error || !requesterProfile.data?.company_id) throw new Error(requesterProfile.error?.message);
    companyId = String(requesterProfile.data.company_id);

    const approverUser = await admin.auth.admin.createUser({
      email: approverEmail,
      password: approverPassword,
      email_confirm: true,
    });
    if (approverUser.error || !approverUser.data.user) throw new Error(approverUser.error?.message);
    approverId = approverUser.data.user.id;

    const requesterEmployee = await admin.from('employees').insert({
      company_id: companyId,
      name: 'Release Requester',
      work_email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      primary_role: 'creator_updater',
      staff_code: `REL-REQ-${crypto.randomUUID()}`,
    }).select('id').single();
    if (requesterEmployee.error || !requesterEmployee.data) throw new Error(requesterEmployee.error?.message);
    requesterEmployeeId = String(requesterEmployee.data.id);

    const approverEmployee = await admin.from('employees').insert({
      company_id: companyId,
      name: 'Release Approver',
      work_email: approverEmail,
      primary_role: 'manager',
      staff_code: `REL-APR-${crypto.randomUUID()}`,
    }).select('id').single();
    if (approverEmployee.error || !approverEmployee.data) throw new Error(approverEmployee.error?.message);
    approverEmployeeId = String(approverEmployee.data.id);

    const requesterLink = await admin.from('profiles').update({ employee_id: requesterEmployeeId }).eq('id', requesterId);
    if (requesterLink.error) throw new Error(requesterLink.error.message);
    const approverProfile = await admin.from('profiles').upsert({
      id: approverId,
      email: approverEmail,
      name: 'Release Approver',
      role: 'manager',
      access_scope: 'company',
      company_id: companyId,
      employee_id: approverEmployeeId,
      status: 'active',
    });
    if (approverProfile.error) throw new Error(approverProfile.error.message);

    const approverSignIn = await approver.auth.signInWithPassword({ email: approverEmail, password: approverPassword });
    if (approverSignIn.error) throw new Error(approverSignIn.error.message);

    const leaveType = await admin.from('leave_types').insert({
      company_id: companyId,
      code: `REL-${crypto.randomUUID()}`,
      name: 'Release qualification leave',
      days_per_year: 14,
      default_days: 14,
    }).select('id').single();
    if (leaveType.error || !leaveType.data) throw new Error(leaveType.error?.message);
    leaveTypeId = String(leaveType.data.id);

    const leaveFlow = await admin.from('approval_flows').insert({
      company_id: companyId,
      entity_type: 'leave_request',
      name: `Release leave flow ${crypto.randomUUID()}`,
      is_active: true,
      is_default: true,
      created_by: approverId,
    }).select('id').single();
    if (leaveFlow.error || !leaveFlow.data) throw new Error(leaveFlow.error?.message);
    leaveFlowId = String(leaveFlow.data.id);

    const leaveStep = await admin.from('approval_steps').insert({
      flow_id: leaveFlowId,
      step_order: 1,
      name: 'Manager approval',
      approver_type: 'specific_user',
      approver_user_id: approverId,
      allow_self_approval: false,
    }).select('id').single();
    if (leaveStep.error || !leaveStep.data) throw new Error(leaveStep.error?.message);
    leaveStepId = String(leaveStep.data.id);

    const legacyFlow = await admin.from('approval_flows').insert({
      company_id: companyId,
      entity_type: 'general',
      name: `Release legacy flow ${crypto.randomUUID()}`,
      is_active: true,
      is_default: false,
      created_by: approverId,
    }).select('id').single();
    if (legacyFlow.error || !legacyFlow.data) throw new Error(legacyFlow.error?.message);
    legacyFlowId = String(legacyFlow.data.id);

    const legacyStep = await admin.from('approval_steps').insert({
      flow_id: legacyFlowId,
      step_order: 1,
      name: 'Legacy specific approver',
      approver_type: 'specific_user',
      approver_user_id: approverId,
      allow_self_approval: false,
    }).select('id').single();
    if (legacyStep.error || !legacyStep.data) throw new Error(legacyStep.error?.message);
    legacyStepId = String(legacyStep.data.id);
  });

  afterAll(async () => {
    await appClient.auth.signOut({ scope: 'local' });
    const cleanupErrors: string[] = [];
    const recordCleanup = (label: string, error: { message: string } | null) => {
      if (error) cleanupErrors.push(`${label}: ${error.message}`);
    };

    if (legacyRequestId) {
      recordCleanup('legacy decisions', (await admin.from('approval_decisions').delete().eq('approval_request_id', legacyRequestId)).error);
      recordCleanup('legacy request', (await admin.from('approval_requests').delete().eq('id', legacyRequestId)).error);
    }
    if (leaveRequestId) {
      const instance = await admin.from('approval_instances').select('id').eq('entity_id', leaveRequestId).maybeSingle();
      if (instance.data?.id) {
        recordCleanup('instance decisions', (await admin.from('approval_decisions').delete().eq('instance_id', instance.data.id)).error);
        recordCleanup('approval instance', (await admin.from('approval_instances').delete().eq('id', instance.data.id)).error);
      }
      recordCleanup('leave request', (await admin.from('leave_requests').delete().eq('id', leaveRequestId)).error);
    }
    if (leaveStepId || legacyStepId) {
      recordCleanup(
        'approval steps',
        (await admin.from('approval_steps').delete().in('id', [leaveStepId, legacyStepId].filter(Boolean))).error,
      );
    }
    if (leaveFlowId || legacyFlowId) {
      recordCleanup(
        'approval flows',
        (await admin.from('approval_flows').delete().in('id', [leaveFlowId, legacyFlowId].filter(Boolean))).error,
      );
    }
    if (leaveTypeId) recordCleanup('leave type', (await admin.from('leave_types').delete().eq('id', leaveTypeId)).error);
    recordCleanup('requester profile', (await admin.from('profiles').update({ employee_id: null }).eq('id', requesterId)).error);
    if (requesterEmployeeId || approverEmployeeId) {
      recordCleanup(
        'employees',
        (await admin.from('employees').delete().in('id', [requesterEmployeeId, approverEmployeeId].filter(Boolean))).error,
      );
    }
    if (approverId) recordCleanup('approver auth user', (await admin.auth.admin.deleteUser(approverId)).error);
    if (cleanupErrors.length > 0) throw new Error(`Release workflow cleanup failed: ${cleanupErrors.join('; ')}`);
  });

  it('completes the canonical employee leave request and approval path', async () => {
    const requesterLogin = await appClient.auth.signInWithPassword({
      email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      password: process.env.RLS_USER_A_PASSWORD ?? 'Test1234!',
    });
    expect(requesterLogin.error).toBeNull();

    leaveRequestId = await createLeaveRequest(requesterEmployeeId, companyId, {
      leaveTypeId,
      startDate: '2027-01-04',
      endDate: '2027-01-05',
      dayPart: 'full_day',
      reason: 'Release qualification workflow',
    });

    const pending = await admin.from('approval_instances')
      .select('id, status, requester_id, current_step_id, current_approver_user_id')
      .eq('entity_type', 'leave_request')
      .eq('entity_id', leaveRequestId)
      .single();
    expect(pending.error).toBeNull();
    expect(pending.data).toMatchObject({
      status: 'pending',
      requester_id: requesterId,
      current_step_id: leaveStepId,
      current_approver_user_id: approverId,
    });

    await expect(reviewLeaveRequest({
      requestId: leaveRequestId,
      reviewerId: requesterId,
      decision: 'approved',
    })).rejects.toThrow(/cannot approve|assigned approver|row-level security/i);

    await appClient.auth.signOut({ scope: 'local' });
    const approverLogin = await appClient.auth.signInWithPassword({ email: approverEmail, password: approverPassword });
    expect(approverLogin.error).toBeNull();
    await reviewLeaveRequest({
      requestId: leaveRequestId,
      reviewerId: approverId,
      decision: 'approved',
      note: 'Approved during release qualification',
    });

    const [leave, instance, decisions, requesterRead, crossTenantRead] = await Promise.all([
      admin.from('leave_requests').select('status, reviewed_by, reviewer_note').eq('id', leaveRequestId).single(),
      admin.from('approval_instances').select('status, current_step_id').eq('entity_id', leaveRequestId).single(),
      admin.from('approval_decisions').select('instance_id, approval_request_id, step_id, approver_id, decision').eq('instance_id', pending.data!.id),
      requester.from('leave_requests').select('id, status').eq('id', leaveRequestId),
      otherTenant.from('leave_requests').select('id').eq('id', leaveRequestId),
    ]);
    expect(leave.data).toMatchObject({
      status: 'approved',
      reviewed_by: approverId,
      reviewer_note: 'Approved during release qualification',
    });
    expect(instance.data).toMatchObject({ status: 'approved', current_step_id: null });
    expect(decisions.data).toEqual([{
      instance_id: pending.data!.id,
      approval_request_id: null,
      step_id: leaveStepId,
      approver_id: approverId,
      decision: 'approved',
    }]);
    expect(requesterRead.data).toEqual([{ id: leaveRequestId, status: 'approved' }]);
    expect(crossTenantRead.data).toEqual([]);
  });

  it('accepts legacy request decisions only from the configured approver', async () => {
    const created = await requester.from('approval_requests').insert({
      company_id: companyId,
      entity_type: 'general',
      entity_id: crypto.randomUUID(),
      flow_id: legacyFlowId,
      requester_id: requesterId,
      current_step_order: 1,
      status: 'pending',
    }).select('id').single();
    expect(created.error).toBeNull();
    legacyRequestId = String(created.data!.id);

    const unauthorized = await otherTenant.from('approval_decisions').insert({
      approval_request_id: legacyRequestId,
      step_id: legacyStepId,
      approver_id: otherTenantId,
      decision: 'approved',
    });
    expect(unauthorized.error).not.toBeNull();

    const accepted = await approver.from('approval_decisions').insert({
      approval_request_id: legacyRequestId,
      step_id: legacyStepId,
      approver_id: approverId,
      decision: 'approved',
      note: 'Legacy path release qualification',
    }).select('approval_request_id, instance_id, step_order, approver_id, decision').single();
    expect(accepted.error).toBeNull();
    expect(accepted.data).toMatchObject({
      approval_request_id: legacyRequestId,
      instance_id: null,
      step_order: 1,
      approver_id: approverId,
      decision: 'approved',
    });
  });
});
