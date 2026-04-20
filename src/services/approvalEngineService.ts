/**
 * approvalEngineService.ts
 *
 * Approval workflow execution engine.
 *
 * How it works:
 *   1. When an entity (e.g. leave_request) is submitted, call initiateApprovalRequest().
 *      It finds the active flow for that entity_type, creates an approval_requests row
 *      (current_step_order = 1), and returns the request id.
 *   2. Eligible approvers see their queue via getPendingApprovalsForUser().
 *   3. submitApprovalDecision() records the decision:
 *      - rejected → marks approval_request + entity as rejected.
 *      - approved at last step → marks as fully approved, updates entity status.
 *      - approved at intermediate step → advances current_step_order.
 */

import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import type { ApprovalFlow, PendingApproval, FlowEntityType } from '@/types';

// ─── Internal helpers ────────────────────────────────────────────────────────

async function getActiveFlow(
  companyId: string,
  entityType: FlowEntityType,
): Promise<ApprovalFlow | null> {
  const { data: flow } = await supabase
    .from('approval_flows')
    .select('*')
    .eq('company_id', companyId)
    .eq('entity_type', entityType)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!flow) return null;

  const { data: steps } = await supabase
    .from('approval_steps')
    .select('*, approver_user:profiles!approval_steps_approver_user_id_fkey(name)')
    .eq('flow_id', flow.id)
    .order('step_order');

  return {
    id:          String(flow.id),
    companyId:   String(flow.company_id),
    name:        String(flow.name),
    description: flow.description ? String(flow.description) : undefined,
    entityType:  flow.entity_type as FlowEntityType,
    isActive:    Boolean(flow.is_active),
    steps: (steps ?? []).map(s => ({
      id:               String(s.id),
      flowId:           String(s.flow_id),
      stepOrder:        Number(s.step_order),
      name:             String(s.name),
      approverType:     s.approver_type as 'role' | 'specific_user' | 'direct_manager',
      approverRole:     s.approver_role ? String(s.approver_role) : undefined,
      approverUserId:   s.approver_user_id ? String(s.approver_user_id) : undefined,
      approverUserName: s.approver_user
        ? String((s.approver_user as Record<string, unknown>)?.name ?? '')
        : undefined,
      allowSelfApproval: Boolean(s.allow_self_approval),
    })),
    createdAt: String(flow.created_at),
    updatedAt: String(flow.updated_at),
  };
}

/** Resolve whether `userId` is an eligible approver for the given step. */
async function isEligibleApprover(
  stepId: string,
  userId: string,
  requesterId: string,
  companyId: string,
): Promise<boolean> {
  const { data: step } = await supabase
    .from('approval_steps')
    .select('approver_type, approver_role, approver_user_id, allow_self_approval')
    .eq('id', stepId)
    .single();

  if (!step) return false;

  // Block self-approval unless explicitly allowed
  if (!step.allow_self_approval && userId === requesterId) return false;

  if (step.approver_type === 'specific_user') {
    return step.approver_user_id === userId;
  }

  if (step.approver_type === 'role') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, company_id')
      .eq('id', userId)
      .single();
    return !!profile && profile.company_id === companyId && profile.role === step.approver_role;
  }

  if (step.approver_type === 'direct_manager') {
    // User is eligible if they are the requester's direct line manager
    const { data: requesterProfile } = await supabase
      .from('profiles')
      .select('manager_id')
      .eq('id', requesterId)
      .single();
    return requesterProfile?.manager_id === userId;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Start an approval workflow for an entity.
 * If no active flow exists for the entity type, returns { id: null } — the
 * caller should fall back to manual direct approval.
 */
export async function initiateApprovalRequest(
  entityType: FlowEntityType,
  entityId: string,
  companyId: string,
  requesterId: string,
): Promise<{ id: string | null; error: string | null }> {
  const flow = await getActiveFlow(companyId, entityType);
  if (!flow || flow.steps.length === 0) {
    return { id: null, error: null }; // No flow configured; proceed without workflow
  }

  const { data, error } = await supabase
    .from('approval_requests')
    .insert({
      company_id:         companyId,
      entity_type:        entityType,
      entity_id:          entityId,
      flow_id:            flow.id,
      requester_id:       requesterId,
      current_step_order: flow.steps[0].stepOrder,
      status:             'pending',
    })
    .select('id')
    .single();

  if (error) return { id: null, error: error.message };
  return { id: String(data.id), error: null };
}

/**
 * Submit an approval decision for the current step.
 * Advances the flow on approval, or finalises (approved/rejected) the entity.
 */
export async function submitApprovalDecision(
  approvalRequestId: string,
  approverId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<{ error: string | null }> {
  // Fetch the approval request + its flow steps
  const { data: request, error: reqErr } = await supabase
    .from('approval_requests')
    .select('*, approval_flows(id), approval_steps:approval_flows(approval_steps(*))')
    .eq('id', approvalRequestId)
    .single();

  if (reqErr || !request) return { error: reqErr?.message ?? 'Approval request not found' };
  if (request.status !== 'pending') return { error: 'This request is no longer pending.' };

  // Fetch the current step for this request
  const { data: currentStep, error: stepErr } = await supabase
    .from('approval_steps')
    .select('id, step_order, approver_type, approver_role, approver_user_id, allow_self_approval')
    .eq('flow_id', String(request.flow_id))
    .eq('step_order', request.current_step_order)
    .single();

  if (stepErr || !currentStep) return { error: 'Current approval step not found.' };

  // Verify eligibility
  const eligible = await isEligibleApprover(
    String(currentStep.id),
    approverId,
    String(request.requester_id),
    String(request.company_id),
  );
  if (!eligible) return { error: 'You are not authorised to approve this step.' };

  // Record the decision
  const { error: decisionErr } = await supabase
    .from('approval_decisions')
    .insert({
      approval_request_id: approvalRequestId,
      step_id:             String(currentStep.id),
      approver_id:         approverId,
      decision,
      note:                note ?? null,
    });
  if (decisionErr) return { error: decisionErr.message };

  void logUserAction(approverId, 'update', 'approval_request', approvalRequestId, { decision, step: request.current_step_order });

  if (decision === 'rejected') {
    // Reject the flow record itself
    const { error: e1 } = await supabase
      .from('approval_requests')
      .update({ status: 'rejected' })
      .eq('id', approvalRequestId);

    // Update the underlying entity if it supports a status field
    let e2: { message: string } | undefined;
    if (request.entity_type === 'leave_request') {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status:        'rejected',
          reviewed_by:   approverId,
          reviewed_at:   new Date().toISOString(),
          reviewer_note: note ?? null,
        })
        .eq('id', String(request.entity_id));
      e2 = error ?? undefined;
    }
    return { error: e1?.message ?? e2?.message ?? null };
  }

  // Approved — check if there is a next step
  const { data: nextStep } = await supabase
    .from('approval_steps')
    .select('id, step_order')
    .eq('flow_id', String(request.flow_id))
    .gt('step_order', request.current_step_order)
    .order('step_order')
    .limit(1)
    .maybeSingle();

  if (nextStep) {
    // Advance to next step
    const { error: advErr } = await supabase
      .from('approval_requests')
      .update({ current_step_order: nextStep.step_order })
      .eq('id', approvalRequestId);
    return { error: advErr?.message ?? null };
  }

  // All steps approved — finalise
  const { error: finalErr } = await supabase
    .from('approval_requests')
    .update({ status: 'approved' })
    .eq('id', approvalRequestId);

  if (request.entity_type === 'leave_request') {
    await supabase
      .from('leave_requests')
      .update({
        status:       'approved',
        reviewed_by:  approverId,
        reviewed_at:  new Date().toISOString(),
        reviewer_note: note ?? null,
      })
      .eq('id', String(request.entity_id));
  }

  return { error: finalErr?.message ?? null };
}

/**
 * Fetch all pending approval requests where the given user is the current eligible approver.
 * Enriched with leave request context when entity_type = 'leave_request'.
 *
 * Optimised: uses 5 batch queries instead of N*3 sequential queries (N+1 elimination).
 */
export async function getPendingApprovalsForUser(
  companyId: string,
  approverId: string,
): Promise<{ data: PendingApproval[]; error: string | null }> {
  // 1. Fetch approver's role (one query)
  const { data: approverProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', approverId)
    .single();
  const approverRole = approverProfile?.role ?? null;

  // 2. Fetch all pending approval_requests for the company with requester data (one query)
  const { data: requests, error } = await supabase
    .from('approval_requests')
    .select('*, requester:profiles!approval_requests_requester_id_fkey(name, manager_id)')
    .eq('company_id', companyId)
    .eq('status', 'pending');

  if (error) return { data: [], error: error.message };
  if (!requests?.length) return { data: [], error: null };

  const allRequests = requests as Array<Record<string, unknown>>;
  const uniqueFlowIds = [...new Set(allRequests.map(r => String(r.flow_id)))];

  // 3. Batch-fetch all steps for all relevant flows (one query)
  const { data: allSteps } = await supabase
    .from('approval_steps')
    .select('id, flow_id, step_order, name, approver_type, approver_role, approver_user_id, allow_self_approval')
    .in('flow_id', uniqueFlowIds);

  // Build lookup: "flowId:stepOrder" → step
  const stepKey = (flowId: unknown, stepOrder: unknown) => `${flowId}:${stepOrder}`;
  const stepsByKey = new Map<string, Record<string, unknown>>();
  for (const s of allSteps ?? []) {
    stepsByKey.set(stepKey(s.flow_id, s.step_order), s as Record<string, unknown>);
  }

  // 4. Batch-fetch flow names (one query)
  const { data: allFlows } = await supabase
    .from('approval_flows')
    .select('id, name')
    .in('id', uniqueFlowIds);
  const flowNameById = new Map((allFlows ?? []).map(f => [String(f.id), String(f.name)]));

  // Determine eligibility in-memory (no extra DB calls)
  const eligible: Array<{ req: Record<string, unknown>; step: Record<string, unknown> }> = [];
  for (const req of allRequests) {
    const step = stepsByKey.get(stepKey(req.flow_id, req.current_step_order));
    if (!step) continue;

    const requesterId = String(req.requester_id);
    if (!step.allow_self_approval && approverId === requesterId) continue;

    let isEligible = false;
    if (step.approver_type === 'specific_user' && step.approver_user_id === approverId) {
      isEligible = true;
    } else if (step.approver_type === 'role' && approverRole === step.approver_role) {
      isEligible = true;
    } else if (step.approver_type === 'direct_manager') {
      const requesterRow = req.requester as Record<string, unknown> | null;
      if (requesterRow?.manager_id === approverId) isEligible = true;
    }
    if (isEligible) eligible.push({ req, step });
  }

  if (!eligible.length) return { data: [], error: null };

  // 5. Batch-fetch leave request details for all eligible leave_requests (one query)
  const leaveEntityIds = eligible
    .filter(({ req }) => req.entity_type === 'leave_request')
    .map(({ req }) => String(req.entity_id));

  const leaveById = new Map<string, Record<string, unknown>>();
  if (leaveEntityIds.length > 0) {
    const { data: leaveRows } = await supabase
      .from('leave_requests')
      .select('id, start_date, end_date, days, reason, leave_types(name)')
      .in('id', leaveEntityIds);
    for (const lr of leaveRows ?? []) {
      leaveById.set(String(lr.id), lr as Record<string, unknown>);
    }
  }

  // Assemble results
  const result: PendingApproval[] = eligible.map(({ req, step }) => {
    const requesterId = String(req.requester_id);
    const requesterRow = req.requester as Record<string, unknown> | null;

    const pending: PendingApproval = {
      id:               String(req.id),
      entityType:       req.entity_type as FlowEntityType,
      entityId:         String(req.entity_id),
      companyId:        String(req.company_id),
      flowId:           String(req.flow_id),
      flowName:         flowNameById.get(String(req.flow_id)) ?? '',
      currentStepOrder: Number(req.current_step_order),
      currentStepName:  String(step.name),
      requesterId,
      requesterName:    requesterRow?.name ? String(requesterRow.name) : undefined,
      status:           req.status as PendingApproval['status'],
      createdAt:        String(req.created_at),
    };

    if (req.entity_type === 'leave_request') {
      const lr = leaveById.get(String(req.entity_id));
      if (lr) {
        pending.leaveRequest = {
          startDate:     String(lr.start_date),
          endDate:       String(lr.end_date),
          days:          Number(lr.days),
          leaveTypeName: (lr.leave_types as Record<string, unknown> | null)?.name
            ? String((lr.leave_types as Record<string, unknown>).name)
            : undefined,
          reason: lr.reason ? String(lr.reason) : undefined,
        };
      }
    }

    return pending;
  });

  return { data: result, error: null };
}

/**
 * Cancel an in-flight approval request (e.g. when the requester cancels the underlying leave).
 */
export async function cancelApprovalRequest(entityId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('approval_requests')
    .update({ status: 'cancelled' })
    .eq('entity_id', entityId)
    .eq('status', 'pending');
  return { error: error?.message ?? null };
}
