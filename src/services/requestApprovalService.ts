import { supabase } from '@/integrations/supabase/client';
import type { ApprovalDecision, ApprovalInstanceStatus } from '@/types';
import { rowToApprovalDecision, rowToApprovalStep, resolveStepRouting, userHasAssignedHrmsRole } from './hrms/shared';
import { logUserAction } from './auditService';
import { createNotifications } from './notificationService';
import { resolveApprovalFlowId } from './approvalFlowService';

export interface InternalRequestApprovalPlan {
  flowId: string;
  firstStepId: string;
  firstStepOrder: number;
  firstStepName: string;
  approverRole: string | null;
  approverUserId: string | null;
}

export interface InternalRequestApprovalMetadata {
  id: string;
  ticketId: string;
  status: ApprovalInstanceStatus;
  currentStepId: string | null;
  currentStepOrder: number | null;
  currentStepName: string | null;
  currentApproverRole: string | null;
  currentApproverUserId: string | null;
  history?: ApprovalDecision[];
}

interface ApprovalInstanceRow {
  id: string;
  entity_id: string;
  status: ApprovalInstanceStatus;
  current_step_id: string | null;
  current_step_order: number | null;
  current_step_name: string | null;
  current_approver_role: string | null;
  current_approver_user_id: string | null;
}

type RequestApprovalDecision = 'approved' | 'rejected';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function profilesTable(): any {
  return supabase.from('profiles' as never);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function approvalStepsTable(): any {
  return supabase.from('approval_steps' as never);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function approvalInstancesTable(): any {
  return supabase.from('approval_instances' as never);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function approvalDecisionsTable(): any {
  return supabase.from('approval_decisions' as never);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ticketsTable(): any {
  return supabase.from('tickets' as never);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ticketActivityTable(): any {
  return supabase.from('ticket_activity' as never);
}

function mapApproval(row: ApprovalInstanceRow): InternalRequestApprovalMetadata {
  return {
    id: row.id,
    ticketId: row.entity_id,
    status: row.status,
    currentStepId: row.current_step_id,
    currentStepOrder: row.current_step_order,
    currentStepName: row.current_step_name,
    currentApproverRole: row.current_approver_role,
    currentApproverUserId: row.current_approver_user_id,
  };
}

export async function getInternalRequestApprovalPlan(
  companyId: string,
  requesterId: string,
): Promise<{ data: InternalRequestApprovalPlan | null; error: string | null }> {
  // Look up requester's department for department-scoped flow resolution
  const { data: requesterProfile } = await profilesTable()
    .select('department_id')
    .eq('id', requesterId)
    .maybeSingle();
  const departmentId = (requesterProfile as Record<string, unknown>)?.department_id
    ? String((requesterProfile as Record<string, unknown>).department_id)
    : null;

  const flowId = await resolveApprovalFlowId(companyId, 'internal_request', departmentId);
  if (!flowId) return { data: null, error: null };

  const { data: steps, error: stepsError } = await approvalStepsTable()
    .select('id, step_order, name, approver_type, approver_role, approver_user_id, fallback_approver_user_id, escalation_rule, condition_rule, is_active, allow_self_approval')
    .eq('flow_id', flowId)
    .order('step_order');

  if (stepsError) return { data: null, error: stepsError.message };
  if (!steps?.length) return { data: null, error: 'The configured approval flow has no steps. Please contact HR/Admin.' };

  const firstStep = (steps ?? []).map((row: Record<string, unknown>) => rowToApprovalStep(row)).find(step => step.isActive);
  if (!firstStep) return { data: null, error: 'The configured approval flow has no active steps. Please contact HR/Admin.' };
  const routing = await resolveStepRouting(firstStep, requesterId, companyId);
  if (routing.error) return { data: null, error: routing.error };

  return {
    data: {
      flowId,
      firstStepId: firstStep.id,
      firstStepOrder: firstStep.stepOrder,
      firstStepName: firstStep.name,
      approverRole: routing.approverRole,
      approverUserId: routing.approverUserId,
    },
    error: null,
  };
}

export async function createInternalRequestApprovalInstance(
  companyId: string,
  ticketId: string,
  requesterId: string,
  plan: InternalRequestApprovalPlan,
): Promise<{ error: string | null }> {
  const { error } = await approvalInstancesTable().insert({
    company_id: companyId,
    flow_id: plan.flowId,
    entity_type: 'internal_request',
    entity_id: ticketId,
    requester_id: requesterId,
    current_step_id: plan.firstStepId,
    current_step_order: plan.firstStepOrder,
    current_step_name: plan.firstStepName,
    current_approver_role: plan.approverRole,
    current_approver_user_id: plan.approverUserId,
    status: 'pending',
  });

  return { error: error?.message ?? null };
}

export async function listInternalRequestApprovalMetadata(
  ticketIds: string[],
  includeHistory = false,
): Promise<{ data: Map<string, InternalRequestApprovalMetadata>; error: string | null }> {
  const empty = new Map<string, InternalRequestApprovalMetadata>();
  if (ticketIds.length === 0) return { data: empty, error: null };

  const { data, error } = await approvalInstancesTable()
    .select('id, entity_id, status, current_step_id, current_step_order, current_step_name, current_approver_role, current_approver_user_id')
    .eq('entity_type', 'internal_request')
    .in('entity_id', ticketIds);

  if (error) return { data: empty, error: error.message };

  const approvalsByTicket = new Map<string, InternalRequestApprovalMetadata>();
  const instanceIds: string[] = [];
  for (const approval of (data ?? []) as ApprovalInstanceRow[]) {
    const mapped = mapApproval(approval);
    approvalsByTicket.set(mapped.ticketId, mapped);
    instanceIds.push(mapped.id);
  }

  if (!includeHistory || instanceIds.length === 0) return { data: approvalsByTicket, error: null };

  const { data: decisions, error: decisionsError } = await approvalDecisionsTable()
    .select('id, instance_id, step_id, step_order, approver_id, decision, note, decided_at, created_at, approver:profiles!approval_decisions_approver_id_fkey(name), step:approval_steps!approval_decisions_step_id_fkey(name)')
    .in('instance_id', instanceIds)
    .order('decided_at');

  if (decisionsError) return { data: new Map(), error: decisionsError.message };

  const approvalsByInstance = new Map([...approvalsByTicket.values()].map((approval) => [approval.id, approval]));
  for (const decision of decisions ?? []) {
    const mappedDecision = rowToApprovalDecision(decision as Record<string, unknown>);
    const approval = approvalsByInstance.get(mappedDecision.instanceId);
    if (!approval) continue;
    approval.history = approval.history ?? [];
    approval.history.push(mappedDecision);
  }

  return { data: approvalsByTicket, error: null };
}

export async function getInternalRequestApprovalGate(
  ticketId: string,
): Promise<{ data: InternalRequestApprovalMetadata | null; error: string | null }> {
  const result = await listInternalRequestApprovalMetadata([ticketId]);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data.get(ticketId) ?? null, error: null };
}

export async function reviewInternalRequestApproval(
  ticketId: string,
  decision: RequestApprovalDecision,
  note: string | undefined,
  context: { userId: string; companyId: string },
): Promise<{ error: string | null }> {
  const { data: ticket, error: ticketError } = await ticketsTable()
    .select('id, company_id, submitted_by, subject, status')
    .eq('company_id', context.companyId)
    .eq('id', ticketId)
    .single();
  if (ticketError) return { error: ticketError.message };
  if (!ticket) return { error: 'Request not found.' };

  const { data: approvalRow, error: approvalError } = await approvalInstancesTable()
    .select('id, flow_id, requester_id, status, current_step_id, current_step_order, current_step_name, current_approver_role, current_approver_user_id')
    .eq('company_id', context.companyId)
    .eq('entity_type', 'internal_request')
    .eq('entity_id', ticketId)
    .maybeSingle();
  if (approvalError) return { error: approvalError.message };
  if (!approvalRow) return { error: 'This request does not have an approval workflow.' };

  const approval = approvalRow as Record<string, unknown>;
  if (approval.status !== 'pending') return { error: `This request approval is already ${approval.status}.` };

  const { data: stepRows, error: stepsError } = await approvalStepsTable()
    .select('id, step_order, name, approver_type, approver_role, approver_user_id, fallback_approver_user_id, escalation_rule, condition_rule, is_active, allow_self_approval')
    .eq('flow_id', String(approval.flow_id))
    .order('step_order');
  if (stepsError) return { error: stepsError.message };

  const steps = (stepRows ?? []).map((row: Record<string, unknown>) => rowToApprovalStep(row)).filter(step => step.isActive);
  const currentStep = steps.find((step) => step.id === approval.current_step_id)
    ?? steps.find((step) => step.stepOrder === Number(approval.current_step_order));
  if (!currentStep) return { error: 'The current approval step could not be resolved.' };

  const requesterId = String(approval.requester_id ?? ticket.submitted_by ?? '');
  if (requesterId === context.userId && !currentStep.allowSelfApproval) {
    return { error: 'You cannot approve or reject your own request.' };
  }

  let isAssignedApprover = Boolean(approval.current_approver_user_id) && approval.current_approver_user_id === context.userId;
  if (currentStep.approverType === 'role' && approval.current_approver_role) {
    const assigned = await userHasAssignedHrmsRole(context.companyId, context.userId, String(approval.current_approver_role));
    if (assigned.error) return { error: assigned.error };
    isAssignedApprover = assigned.data;
  }
  if (!isAssignedApprover) return { error: 'You are not the assigned approver for the current step.' };

  const nextStep = decision === 'approved'
    ? steps.find((step) => step.stepOrder > currentStep.stepOrder)
    : undefined;
  const nextRouting = nextStep
    ? await resolveStepRouting(nextStep, requesterId, context.companyId)
    : { approverRole: null, approverUserId: null, error: null };
  if (nextRouting.error) return { error: nextRouting.error };

  const decidedAt = new Date().toISOString();
  const normalizedNote = note?.trim() ? note.trim() : null;
  const { error: decisionError } = await approvalDecisionsTable().insert({
    instance_id: String(approval.id),
    step_id: currentStep.id,
    step_order: currentStep.stepOrder,
    approver_id: context.userId,
    decision,
    note: normalizedNote,
    decided_at: decidedAt,
  });
  if (decisionError) return { error: decisionError.message };

  if (decision === 'rejected') {
    const [{ error: workflowError }, { error: requestError }, { error: activityError }] = await Promise.all([
      approvalInstancesTable()
        .update({
          status: 'rejected',
          current_step_id: null,
          current_step_order: null,
          current_step_name: null,
          current_approver_role: null,
          current_approver_user_id: null,
          updated_at: decidedAt,
        })
        .eq('id', String(approval.id)),
      ticketsTable()
        .update({
          status: 'cancelled',
          resolved_at: decidedAt,
          resolution_note: normalizedNote ?? 'Request rejected during approval.',
        })
        .eq('company_id', context.companyId)
        .eq('id', ticketId),
      ticketActivityTable().insert({
        ticket_id: ticketId,
        company_id: context.companyId,
        actor_id: context.userId,
        event_type: 'status_changed',
        message: 'Request rejected during approval.',
        metadata: { before: ticket.status, after: 'cancelled', approvalStep: currentStep.name, note: normalizedNote },
      }),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (requestError) return { error: requestError.message };
    if (activityError) return { error: activityError.message };
  } else if (nextStep) {
    const { error: workflowError } = await approvalInstancesTable()
      .update({
        current_step_id: nextStep.id,
        current_step_order: nextStep.stepOrder,
        current_step_name: nextStep.name,
        current_approver_role: nextRouting.approverRole,
        current_approver_user_id: nextRouting.approverUserId,
        updated_at: decidedAt,
      })
      .eq('id', String(approval.id));
    if (workflowError) return { error: workflowError.message };
  } else {
    const [{ error: workflowError }, { error: activityError }] = await Promise.all([
      approvalInstancesTable()
        .update({
          status: 'approved',
          current_step_id: null,
          current_step_order: null,
          current_step_name: null,
          current_approver_role: null,
          current_approver_user_id: null,
          updated_at: decidedAt,
        })
        .eq('id', String(approval.id)),
      ticketActivityTable().insert({
        ticket_id: ticketId,
        company_id: context.companyId,
        actor_id: context.userId,
        event_type: 'comment_added',
        message: 'Request approval completed.',
        metadata: { approvalStep: currentStep.name, note: normalizedNote },
      }),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (activityError) return { error: activityError.message };
  }

  if (ticket.submitted_by && ticket.submitted_by !== context.userId) {
    void createNotifications([{
      userId: String(ticket.submitted_by),
      title: decision === 'approved' && !nextStep ? 'Request approved' : decision === 'rejected' ? 'Request rejected' : 'Request approval advanced',
      message: `"${String(ticket.subject)}" ${decision === 'approved' && nextStep ? `advanced to ${nextStep.name}.` : `was ${decision}.`}`,
      type: decision === 'rejected' ? 'warning' : 'success',
    }]);
  }

  void logUserAction(context.userId, 'update', 'internal_request_approval', String(approval.id), {
    ticketId,
    decision,
    approvalStep: currentStep.name,
    finalDecision: decision === 'rejected' || !nextStep,
    nextApprovalStep: nextStep?.name ?? null,
  });

  return { error: null };
}
