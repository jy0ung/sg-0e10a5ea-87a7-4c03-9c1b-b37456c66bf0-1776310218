import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import { createLeaveRequest as createSharedLeaveRequest } from '@flc/hrms-services';
import {
  LeaveType, LeaveBalance, LeaveRequest, CreateLeaveRequestInput,
  LeaveStatus, ApprovalDecision,
} from '@/types';
import { HRMS_LEAVE_APPROVER_ROLES } from '@/config/hrmsConfig';
import {
  rowToApprovalDecision, rowToApprovalInstance, rowToApprovalStep,
  resolveStepRouting, resolveRequiredProfileId, resolveStoredEmployeeIdentities,
} from './shared';

export async function listLeaveTypes(companyId: string): Promise<{ data: LeaveType[]; error: string | null }> {
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('name');
  if (error) return { data: [], error: error.message };
  const mapped: LeaveType[] = (data ?? []).map(r => ({
    id:           String(r.id),
    companyId:    String(r.company_id),
    name:         String(r.name),
    code:         String(r.code),
    daysPerYear:  Number(r.days_per_year),
    defaultDays:  Number(r.default_days ?? r.days_per_year),
    carryForward: Boolean((r as Record<string, unknown>).carry_forward ?? true),
    isPaid:       Boolean(r.is_paid),
    active:       Boolean(r.active),
    createdAt:    String(r.created_at),
    updatedAt:    String(r.updated_at),
  }));
  return { data: mapped, error: null };
}

export async function listLeaveBalances(employeeId: string, year: number): Promise<{ data: LeaveBalance[]; error: string | null }> {
  const { data, error } = await supabase
    .from('leave_balances')
    .select('*, leave_types(name)')
    .eq('year', year)
    .eq('employee_id', employeeId);
  if (error) return { data: [], error: error.message };

  const mapped: LeaveBalance[] = (data ?? []).map(r => ({
    id:            String(r.id),
    employeeId:    String(r.employee_id ?? ''),
    leaveTypeId:   String(r.leave_type_id),
    year:          Number(r.year),
    entitledDays:  Number(r.entitled_days),
    usedDays:      Number(r.used_days),
    remainingDays: Number(r.entitled_days) - Number(r.used_days),
  }));
  return { data: mapped, error: null };
}

export async function listLeaveRequests(
  companyId: string,
  opts?: { employeeId?: string; status?: LeaveStatus; includeApprovalHistory?: boolean; dateFrom?: string; dateTo?: string },
): Promise<{ data: LeaveRequest[]; error: string | null }> {
  let q = supabase
    .from('leave_requests')
    .select('*, employee:profiles!leave_requests_employee_id_fkey(name), leave_types(name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts?.status)     q = q.eq('status', opts.status);
  if (opts?.dateFrom)   q = q.gte('end_date', opts.dateFrom);   // leave ends on/after window start
  if (opts?.dateTo)     q = q.lte('start_date', opts.dateTo);   // leave starts on/before window end
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };

  const identityMap = await resolveStoredEmployeeIdentities((data ?? []).map(row => String(row.employee_id ?? '')));
  if (identityMap.error) return { data: [], error: identityMap.error };

  const requestIds = (data ?? []).map(r => String(r.id));
  const approvalMeta = new Map<string, Record<string, unknown>>();
  const approvalHistory = new Map<string, ApprovalDecision[]>();

  if (requestIds.length) {
    const { data: approvals, error: approvalError } = await supabase
      .from('approval_instances')
      .select('id, entity_id, status, current_step_order, current_step_name, current_approver_role, current_approver_user_id')
      .eq('entity_type', 'leave_request')
      .in('entity_id', requestIds);
    if (approvalError) return { data: [], error: approvalError.message };
    for (const approval of approvals ?? []) {
      approvalMeta.set(String(approval.entity_id), approval as Record<string, unknown>);
    }

    if (opts?.includeApprovalHistory) {
      const instanceIds = (approvals ?? []).map(approval => String(approval.id));
      if (instanceIds.length) {
        const { data: decisions, error: decisionsError } = await supabase
          .from('approval_decisions')
          .select('id, instance_id, step_id, step_order, approver_id, decision, note, decided_at, created_at, approver:profiles!approval_decisions_approver_id_fkey(name), step:approval_steps!approval_decisions_step_id_fkey(name)')
          .in('instance_id', instanceIds)
          .order('decided_at');
        if (decisionsError) return { data: [], error: decisionsError.message };
        for (const decision of decisions ?? []) {
          const mapped = rowToApprovalDecision(decision as Record<string, unknown>);
          if (!approvalHistory.has(mapped.instanceId)) approvalHistory.set(mapped.instanceId, []);
          approvalHistory.get(mapped.instanceId)!.push(mapped);
        }
      }
    }
  }

  const mapped: LeaveRequest[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:            String(r.id),
    companyId:     String(r.company_id),
    employeeId:    String(r.employee_id),
    employeeName:  (r.employee as Record<string, unknown> | null)?.name
      ? String((r.employee as Record<string, unknown>).name)
      : (identityMap.data.get(String(r.employee_id))?.name ? String(identityMap.data.get(String(r.employee_id))!.name) : undefined),
    leaveTypeId:   String(r.leave_type_id),
    leaveTypeName: (r.leave_types as Record<string, unknown> | null)?.name ? String((r.leave_types as Record<string, unknown>).name) : undefined,
    startDate:     String(r.start_date),
    endDate:       String(r.end_date),
    days:          Number(r.days),
    reason:        r.reason ? String(r.reason) : undefined,
    status:        (r.status as LeaveStatus) ?? 'pending',
    reviewedBy:    r.reviewed_by ? String(r.reviewed_by) : undefined,
    reviewedAt:    r.reviewed_at ? String(r.reviewed_at) : undefined,
    reviewerNote:  r.reviewer_note ? String(r.reviewer_note) : undefined,
    approvalInstanceId:      approvalMeta.get(String(r.id))?.id ? String(approvalMeta.get(String(r.id))?.id) : undefined,
    approvalInstanceStatus:  approvalMeta.get(String(r.id))?.status ? String(approvalMeta.get(String(r.id))?.status) as LeaveRequest['approvalInstanceStatus'] : undefined,
    currentApprovalStepOrder: approvalMeta.get(String(r.id))?.current_step_order != null
      ? Number(approvalMeta.get(String(r.id))?.current_step_order)
      : undefined,
    currentApprovalStepName: approvalMeta.get(String(r.id))?.current_step_name
      ? String(approvalMeta.get(String(r.id))?.current_step_name)
      : undefined,
    currentApproverRole: approvalMeta.get(String(r.id))?.current_approver_role
      ? String(approvalMeta.get(String(r.id))?.current_approver_role)
      : undefined,
    currentApproverUserId: approvalMeta.get(String(r.id))?.current_approver_user_id
      ? String(approvalMeta.get(String(r.id))?.current_approver_user_id)
      : undefined,
    approvalHistory: approvalMeta.get(String(r.id))?.id
      ? approvalHistory.get(String(approvalMeta.get(String(r.id))?.id)) ?? []
      : undefined,
    createdAt:     String(r.created_at),
    updatedAt:     String(r.updated_at),
  }));
  return { data: mapped, error: null };
}

export async function createLeaveRequest(
  employeeId: string,
  companyId: string,
  input: CreateLeaveRequestInput,
): Promise<{ error: string | null }> {
  try {
    const requesterProfileId = await resolveRequiredProfileId(employeeId);
    if (requesterProfileId.error) return { error: requesterProfileId.error };

    const leaveRequestId = await createSharedLeaveRequest(employeeId, companyId, {
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason,
    });
    void logUserAction(requesterProfileId.data, 'create', 'leave_request', leaveRequestId, {
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      days: input.days,
    });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to create leave request.' };
  }
}

export async function reviewLeaveRequest(
  requestId: string,
  reviewerId: string,
  status: 'approved' | 'rejected',
  note?: string,
): Promise<{ error: string | null }> {
  const { data: req, error: requestError } = await supabase
    .from('leave_requests')
    .select('employee_id, company_id')
    .eq('id', requestId)
    .single();
  if (requestError) return { error: requestError.message };

  const requestOwnerId = String((req as Record<string, unknown> | null)?.employee_id ?? '');
  if (!requestOwnerId) return { error: 'Leave request not found.' };

  const requesterProfileId = await resolveRequiredProfileId(requestOwnerId);
  if (requesterProfileId.error) return { error: requesterProfileId.error };

  const { data: reviewer, error: reviewerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', reviewerId)
    .single();
  if (reviewerError) return { error: reviewerError.message };

  const reviewerRole = String((reviewer as Record<string, unknown> | null)?.role ?? '');

  const { data: approvalInstance, error: approvalError } = await supabase
    .from('approval_instances')
    .select('id, flow_id, requester_id, status, current_step_id, current_step_order, current_step_name, current_approver_role, current_approver_user_id')
    .eq('entity_type', 'leave_request')
    .eq('entity_id', requestId)
    .maybeSingle();
  if (approvalError) return { error: approvalError.message };

  if (!approvalInstance) {
    if (requesterProfileId.data === reviewerId) {
      return { error: 'You cannot approve or reject your own leave request.' };
    }
    if (!HRMS_LEAVE_APPROVER_ROLES.includes(reviewerRole as AppRole)) {
      return { error: 'You are not allowed to review this leave request.' };
    }

    const { error } = await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), reviewer_note: note ?? null })
      .eq('id', requestId);
    if (!error) {
      void logUserAction(reviewerId, 'update', 'leave_request', requestId,
        { status, reviewerNote: note ?? null, approvalMode: 'legacy' });
    }
    return { error: error?.message ?? null };
  }

  const instance = rowToApprovalInstance(approvalInstance as Record<string, unknown>);
  const approvalRequesterId = instance.requesterId || requesterProfileId.data;
  if (instance.status !== 'pending') {
    return { error: `This leave approval is already ${instance.status}.` };
  }

  const { data: stepRows, error: stepsError } = await supabase
    .from('approval_steps')
    .select('id, step_order, name, approver_type, approver_role, approver_user_id, allow_self_approval')
    .eq('flow_id', instance.flowId)
    .order('step_order');
  if (stepsError) return { error: stepsError.message };

  const steps = (stepRows ?? []).map(row => rowToApprovalStep(row as Record<string, unknown>));
  const currentStep = steps.find(step => step.id === instance.currentStepId)
    ?? steps.find(step => step.stepOrder === instance.currentStepOrder);
  if (!currentStep) {
    return { error: 'The current approval step could not be resolved.' };
  }

  if (approvalRequesterId === reviewerId && !currentStep.allowSelfApproval) {
    return { error: 'You cannot approve or reject your own leave request.' };
  }

  const isAssignedApprover = currentStep.approverType === 'role'
    ? Boolean(instance.currentApproverRole) && instance.currentApproverRole === reviewerRole
    : Boolean(instance.currentApproverUserId) && instance.currentApproverUserId === reviewerId;

  if (!isAssignedApprover) {
    return { error: 'You are not the assigned approver for the current step.' };
  }

  const nextStep = status === 'approved'
    ? steps.find(step => step.stepOrder > currentStep.stepOrder)
    : undefined;
  const nextRouting = nextStep
    ? await resolveStepRouting(nextStep, approvalRequesterId)
    : { approverRole: null, approverUserId: null, error: null };
  if (nextRouting.error) return { error: nextRouting.error };

  const reviewedAt = new Date().toISOString();

  const { error: decisionError } = await supabase
    .from('approval_decisions')
    .insert({
      instance_id: instance.id,
      step_id: currentStep.id,
      step_order: currentStep.stepOrder,
      approver_id: reviewerId,
      decision: status,
      note: note ?? null,
      decided_at: reviewedAt,
    });
  if (decisionError) return { error: decisionError.message };

  if (status === 'rejected') {
    const [{ error: workflowError }, { error: leaveError }] = await Promise.all([
      supabase
        .from('approval_instances')
        .update({
          status: 'rejected',
          current_step_id: null,
          current_step_order: null,
          current_step_name: null,
          current_approver_role: null,
          current_approver_user_id: null,
          updated_at: reviewedAt,
        })
        .eq('id', instance.id),
      supabase
        .from('leave_requests')
        .update({ status, reviewed_by: reviewerId, reviewed_at: reviewedAt, reviewer_note: note ?? null, updated_at: reviewedAt })
        .eq('id', requestId),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (leaveError) return { error: leaveError.message };
  } else if (nextStep) {
    const { error: workflowError } = await supabase
      .from('approval_instances')
      .update({
        current_step_id: nextStep.id,
        current_step_order: nextStep.stepOrder,
        current_step_name: nextStep.name,
        current_approver_role: nextRouting.approverRole,
        current_approver_user_id: nextRouting.approverUserId,
        updated_at: reviewedAt,
      })
      .eq('id', instance.id);
    if (workflowError) return { error: workflowError.message };
  } else {
    const [{ error: workflowError }, { error: leaveError }] = await Promise.all([
      supabase
        .from('approval_instances')
        .update({
          status: 'approved',
          current_step_id: null,
          current_step_order: null,
          current_step_name: null,
          current_approver_role: null,
          current_approver_user_id: null,
          updated_at: reviewedAt,
        })
        .eq('id', instance.id),
      supabase
        .from('leave_requests')
        .update({ status, reviewed_by: reviewerId, reviewed_at: reviewedAt, reviewer_note: note ?? null, updated_at: reviewedAt })
        .eq('id', requestId),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (leaveError) return { error: leaveError.message };
  }

  void logUserAction(reviewerId, 'update', 'leave_request', requestId,
    {
      status,
      reviewerNote: note ?? null,
      approvalStep: currentStep.name,
      finalDecision: status === 'rejected' || !nextStep,
      nextApprovalStep: nextStep?.name ?? null,
    });
  return { error: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════

