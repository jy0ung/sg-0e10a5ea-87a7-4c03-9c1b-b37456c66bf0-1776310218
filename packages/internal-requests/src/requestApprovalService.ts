import { supabase } from '@flc/supabase';
import type { ApprovalDecision, ApprovalInstanceStatus } from '@flc/types';
import {
  rowToApprovalDecision,
  rowToApprovalStep,
  resolveStepRouting,
  type ApprovalStepRecord,
} from '@flc/hrms-services';
import { createNotifications, logUserAction } from '@flc/platform-services';
import {
  resolveInternalRequestApprovalFlowId,
  type InternalRequestApprovalPlanOptions,
} from './approvalFlowResolver';

export type { InternalRequestApprovalPlanOptions } from './approvalFlowResolver';

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
  options: InternalRequestApprovalPlanOptions = {},
): Promise<{ data: InternalRequestApprovalPlan | null; error: string | null }> {
  try {
    const flowId = await resolveInternalRequestApprovalFlowId(
      companyId,
      requesterId,
      options,
    );
    if (!flowId) return { data: null, error: null };

    const { data: steps, error: stepsError } = await supabase.from('approval_steps')
      .select('id, step_order, name, approver_type, approver_role, approver_user_id, fallback_approver_user_id, escalation_rule, condition_rule, is_active, allow_self_approval')
      .eq('flow_id', flowId)
      .order('step_order');

    if (stepsError) return { data: null, error: stepsError.message };
    if (!steps?.length) return { data: null, error: 'The configured approval flow has no steps. Please contact HR/Admin.' };

    const firstStep = (steps as Record<string, unknown>[])
      .map((row) => rowToApprovalStep(row))
      .find((step: ApprovalStepRecord) => step.isActive);
    if (!firstStep) return { data: null, error: 'The configured approval flow has no active steps. Please contact HR/Admin.' };
    const routing = await resolveStepRouting(firstStep, requesterId, companyId);

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
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createInternalRequestApprovalInstance(
  companyId: string,
  ticketId: string,
  requesterId: string,
  plan: InternalRequestApprovalPlan,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('approval_instances').insert({
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

  const { data, error } = await supabase.from('approval_instances')
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

  const { data: decisions, error: decisionsError } = await supabase.from('approval_decisions')
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

interface AtomicInternalRequestReviewResult {
  instanceId: string;
  ticketId: string;
  submittedBy: string | null;
  subject: string;
  decision: RequestApprovalDecision;
  approvalStep: string;
  finalDecision: boolean;
  nextApprovalStep: string | null;
}

export async function reviewInternalRequestApproval(
  ticketId: string,
  expectedStepId: string,
  decision: RequestApprovalDecision,
  note: string | undefined,
  context: { userId: string; companyId: string },
): Promise<{ error: string | null }> {
  try {
    const rpcClient = supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };

    const { data, error } = await rpcClient.rpc(
      'review_internal_request_approval',
      {
        p_company_id: context.companyId,
        p_ticket_id: ticketId,
        p_expected_step_id: expectedStepId,
        p_decision: decision,
        p_note: note?.trim() ? note.trim() : null,
      },
    );

    if (error) return { error: error.message };
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { error: 'Approval review did not return workflow metadata.' };
    }

    const result = data as unknown as AtomicInternalRequestReviewResult;

    if (result.submittedBy && result.submittedBy !== context.userId) {
      void createNotifications([{
        userId: result.submittedBy,
        title:
          decision === 'approved' && !result.finalDecision
            ? 'Request approval advanced'
            : decision === 'rejected'
              ? 'Request rejected'
              : 'Request approved',
        message:
          `"${result.subject}" ${
            decision === 'approved' && !result.finalDecision
              ? `advanced to ${result.nextApprovalStep ?? 'the next approval step'}.`
              : `was ${decision}.`
          }`,
        type: decision === 'rejected' ? 'warning' : 'success',
      }]);
    }

    void logUserAction(
      context.userId,
      'update',
      'internal_request_approval',
      result.instanceId,
      {
        ticketId: result.ticketId,
        decision,
        approvalStep: result.approvalStep,
        finalDecision: result.finalDecision,
        nextApprovalStep: result.nextApprovalStep,
      },
    );

    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Mark the approval instance for a ticket as cancelled. Idempotent: a no-op
 * when no instance exists or the instance is already in a terminal state.
 * Called by ticketService.cancelMyTicket so an in-flight approval doesn't
 * remain orphaned after the requester cancels their own ticket.
 */
export async function cancelInternalRequestApprovalInstance(
  ticketId: string,
  companyId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('approval_instances')
    .update({
      status: 'cancelled',
      current_step_id: null,
      current_step_order: null,
      current_step_name: null,
      current_approver_role: null,
      current_approver_user_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('entity_type', 'internal_request')
    .eq('entity_id', ticketId)
    .eq('status', 'pending');
  return { error: error?.message ?? null };
}

/**
 * Single-ticket convenience that returns the approval metadata together with
 * the full decision history. Consumed by TicketApprovalHistory in the request
 * detail panel.
 */
export async function getInternalRequestApprovalWithHistory(
  ticketId: string,
): Promise<{ data: InternalRequestApprovalMetadata | null; error: string | null }> {
  const { data, error } = await listInternalRequestApprovalMetadata([ticketId], true);
  if (error) return { data: null, error };
  return { data: data.get(ticketId) ?? null, error: null };
}
