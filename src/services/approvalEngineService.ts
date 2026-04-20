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
    // Reject the whole flow + the underlying entity
    const { error: e1 } = await supabase
      .from('approval_requests')
      .update({ status: 'rejected' })
      .eq('id', approvalRequestId);
    const { error: e2 } = await supabase
      .from(request.entity_type === 'leave_request' ? 'leave_requests' : 'approval_requests')
      .update({
        status:       'rejected',
        reviewed_by:  approverId,
        reviewed_at:  new Date().toISOString(),
        reviewer_note: note ?? null,
      })
      .eq('id', String(request.entity_id));
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
 */
export async function getPendingApprovalsForUser(
  companyId: string,
  approverId: string,
): Promise<{ data: PendingApproval[]; error: string | null }> {
  // Fetch the approver's role to enable role-based step matching
  const { data: approverProfile } = await supabase
    .from('profiles')
    .select('role, manager_id')
    .eq('id', approverId)
    .single();

  const approverRole = approverProfile?.role ?? null;

  // Get all pending approval_requests for the company
  const { data: requests, error } = await supabase
    .from('approval_requests')
    .select('*, requester:profiles!requester_id(name, manager_id)')
    .eq('company_id', companyId)
    .eq('status', 'pending');

  if (error) return { data: [], error: error.message };

  // For each request, fetch the current step and check eligibility
  const relevant: PendingApproval[] = [];

  for (const req of (requests ?? [])) {
    const { data: step } = await supabase
      .from('approval_steps')
      .select('id, name, approver_type, approver_role, approver_user_id, allow_self_approval')
      .eq('flow_id', String(req.flow_id))
      .eq('step_order', req.current_step_order)
      .single();

    if (!step) continue;

    // Check if approverId is eligible
    let eligible = false;
    const requesterId = String(req.requester_id);
    const selfApprovalOk = Boolean(step.allow_self_approval);

    if (!selfApprovalOk && approverId === requesterId) continue;

    if (step.approver_type === 'specific_user' && step.approver_user_id === approverId) {
      eligible = true;
    } else if (step.approver_type === 'role' && approverRole === step.approver_role) {
      eligible = true;
    } else if (step.approver_type === 'direct_manager') {
      const requesterRow = req.requester as Record<string, unknown> | null;
      if (requesterRow?.manager_id === approverId) eligible = true;
    }

    if (!eligible) continue;

    // Fetch flow name
    const { data: flow } = await supabase
      .from('approval_flows')
      .select('name')
      .eq('id', String(req.flow_id))
      .single();

    const pending: PendingApproval = {
      id:               String(req.id),
      entityType:       req.entity_type as FlowEntityType,
      entityId:         String(req.entity_id),
      companyId:        String(req.company_id),
      flowId:           String(req.flow_id),
      flowName:         flow?.name ? String(flow.name) : '',
      currentStepOrder: Number(req.current_step_order),
      currentStepName:  String(step.name),
      requesterId,
      requesterName:    (req.requester as Record<string, unknown> | null)?.name
        ? String((req.requester as Record<string, unknown>).name)
        : undefined,
      status:    req.status as PendingApproval['status'],
      createdAt: String(req.created_at),
    };

    // Enrich leave_request context
    if (req.entity_type === 'leave_request') {
      const { data: lr } = await supabase
        .from('leave_requests')
        .select('start_date, end_date, days, reason, leave_types(name)')
        .eq('id', String(req.entity_id))
        .single();

      if (lr) {
        pending.leaveRequest = {
          startDate:     String(lr.start_date),
          endDate:       String(lr.end_date),
          days:          Number(lr.days),
          leaveTypeName: (lr.leave_types as Record<string, unknown> | null)?.name
            ? String((lr.leave_types as Record<string, unknown>).name)
            : undefined,
          reason: lr.reason ?? undefined,
        };
      }
    }

    relevant.push(pending);
  }

  return { data: relevant, error: null };
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
