import type { FlowEntityType } from '@flc/types';
import { supabase, untypedSupabase } from '../shared/supabaseClient';
import {
  rowToApprovalStep,
  rowToApprovalInstance,
  type SubmitApprovalDecisionInput,
  type EntityStatusUpdater,
  type ApprovalAuditAdapter,
  type ApprovalAuditEvent,
} from './approvalTypes';
import { resolveStepRouting, userMatchesAssignedApproverRole } from './approvalRouting';

// ─── Approval Step select fragment ─────────────────────────────────────────────
const APPROVAL_STEP_SELECT =
  'id, step_order, name, approver_type, approver_role, approver_user_id, ' +
  'fallback_approver_user_id, escalation_rule, condition_rule, is_active, allow_self_approval';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Creates an `approval_instances` row for an entity that has just been
 * submitted. Finds the single active approval flow for the entity type,
 * resolves the first step's approver, and inserts the instance.
 *
 * No-ops silently if no active flow is configured for the entity type.
 * Throws on any other error (multiple active flows, step configuration issues,
 * routing failures, database errors).
 */
export async function bootstrapApprovalInstanceForEntity(
  companyId: string,
  entityType: FlowEntityType,
  entityId: string,
  requesterId: string,
): Promise<void> {
  const { data: flows, error: flowError } = await supabase
    .from('approval_flows')
    .select('id')
    .eq('company_id', companyId)
    .eq('entity_type', entityType)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(2);
  if (flowError) throw new Error(flowError.message);
  if (!flows?.length) return; // No flow configured — not an error.
  if (flows.length > 1) {
    throw new Error(
      `Multiple active approval flows found for ${entityType}. Deactivate extras before continuing.`,
    );
  }

  const flowId = String(flows[0].id);
  const { data: steps, error: stepError } = await untypedSupabase
    // TODO: Replace untypedSupabase after APPROVAL_STEP_SELECT is updated to use select('*')
    // and rowToApprovalStep() is updated to accept ApprovalStepRow.
    .from('approval_steps')
    .select(APPROVAL_STEP_SELECT)
    .eq('flow_id', flowId)
    .order('step_order');
  if (stepError) throw new Error(stepError.message);
  if (!steps?.length) {
    throw new Error(`The active ${entityType} approval flow has no steps configured.`);
  }

  const firstStep = (steps as Record<string, unknown>[])
    .map(rowToApprovalStep)
    .find((s) => s.isActive);
  if (!firstStep) {
    throw new Error(`The active ${entityType} approval flow has no active steps configured.`);
  }

  const routing = await resolveStepRouting(firstStep, requesterId, companyId);

  const { error: instanceError } = await untypedSupabase
    // TODO: Replace untypedSupabase after approval_instances Insert type is verified against
    // all required columns in database.types.ts.
    .from('approval_instances').insert({
    company_id: companyId,
    flow_id: flowId,
    entity_type: entityType,
    entity_id: entityId,
    requester_id: requesterId,
    current_step_id: firstStep.id,
    current_step_order: firstStep.stepOrder,
    current_step_name: firstStep.name,
    current_approver_role: routing.approverRole,
    current_approver_user_id: routing.approverUserId,
    status: 'pending',
  });
  if (instanceError) throw new Error(instanceError.message);
}

// ─── Decision engine ──────────────────────────────────────────────────────────

/**
 * Submits an approval decision for any HRMS entity that has an active
 * `approval_instances` row.
 *
 * Responsibilities:
 * - Guards against self-approval (unless the step allows it).
 * - Verifies the reviewer is the assigned approver for the current step
 *   (by specific user ID, HRMS role UUID, or legacy approver code mapped to assigned HRMS roles).
 * - Inserts an `approval_decisions` record.
 * - Advances the instance to the next step, or finalises it.
 * - Calls `updateEntityStatus` on rejection or final approval so the caller
 *   can update the entity table (leave_requests, payroll_runs, etc.).
 * - Fires the optional audit adapter (failures are swallowed, never blocking).
 *
 * Throws on any business rule violation or database error.
 *
 * @param input        Decision context.
 * @param updateEntityStatus  Callback to update the owning entity record.
 * @param auditAdapter Optional adapter for audit log integration.
 */
export async function submitApprovalDecision(
  input: SubmitApprovalDecisionInput,
  updateEntityStatus: EntityStatusUpdater,
  auditAdapter?: ApprovalAuditAdapter,
): Promise<void> {
  const { entityType, entityId, reviewerId, companyId, requesterId, decision, note } = input;

  // 1. Load the instance — must exist and be pending.
  const { data: instanceRow, error: instanceError } = await untypedSupabase
    // TODO: Replace untypedSupabase after rowToApprovalInstance() is updated to accept
    // the partial-select Pick type from approval_instances.
    .from('approval_instances')
    .select(
      'id, flow_id, requester_id, status, current_step_id, current_step_order, ' +
      'current_step_name, current_approver_role, current_approver_user_id',
    )
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();
  if (instanceError) throw new Error(instanceError.message);
  if (!instanceRow) throw new Error(`No approval workflow found for this ${entityType}.`);

  const instance = rowToApprovalInstance(instanceRow as Record<string, unknown>);
  if (instance.status !== 'pending') {
    throw new Error(`This ${entityType} approval is already ${instance.status}.`);
  }

  // 2. Load and filter active steps for the flow.
  const { data: stepRows, error: stepsError } = await untypedSupabase
    // TODO: Replace untypedSupabase after APPROVAL_STEP_SELECT is updated to use select('*')
    // and rowToApprovalStep() is updated to accept ApprovalStepRow.
    .from('approval_steps')
    .select(APPROVAL_STEP_SELECT)
    .eq('flow_id', instance.flowId)
    .order('step_order');
  if (stepsError) throw new Error(stepsError.message);

  const steps = (stepRows as Record<string, unknown>[]).map(rowToApprovalStep).filter((s) => s.isActive);
  const currentStep =
    steps.find((s) => s.id === instance.currentStepId) ??
    steps.find((s) => s.stepOrder === instance.currentStepOrder);
  if (!currentStep) throw new Error('The current approval step could not be resolved.');

  // 3. Self-approval guard.
  const effectiveRequesterId = instance.requesterId || requesterId;
  if (effectiveRequesterId && effectiveRequesterId === reviewerId && !currentStep.allowSelfApproval) {
    throw new Error(`You cannot approve or reject your own ${entityType.replace('_', ' ')}.`);
  }

  // 4. Verify reviewer is the assigned approver.
  let isAssignedApprover =
    Boolean(instance.currentApproverUserId) && instance.currentApproverUserId === reviewerId;

  if (!isAssignedApprover && currentStep.approverType === 'role' && instance.currentApproverRole) {
    isAssignedApprover = await userMatchesAssignedApproverRole(
      companyId,
      reviewerId,
      instance.currentApproverRole,
    );
  }

  if (!isAssignedApprover) {
    throw new Error('You are not the assigned approver for the current step.');
  }

  // 5. Resolve next step if approving.
  const nextStep =
    decision === 'approved'
      ? steps.find((s) => s.stepOrder > currentStep.stepOrder)
      : undefined;

  const nextRouting = nextStep
    ? await resolveStepRouting(nextStep, effectiveRequesterId, companyId)
    : null;

  const decidedAt = new Date().toISOString();
  const isFinalDecision = decision === 'rejected' || !nextStep;

  // 6. Insert decision record.
  const { error: decisionError } = await untypedSupabase.from('approval_decisions').insert({
    instance_id: instance.id,
    step_id: currentStep.id,
    step_order: currentStep.stepOrder,
    approver_id: reviewerId,
    decision,
    note: note ?? null,
    decided_at: decidedAt,
  });
  if (decisionError) throw new Error(decisionError.message);

  // 7. Update the instance and entity status.
  if (isFinalDecision) {
    // Rejection or final approval — clear all step pointers.
    const { error: workflowError } = await untypedSupabase
      .from('approval_instances')
      .update({
        status: decision === 'approved' ? 'approved' : 'rejected',
        current_step_id: null,
        current_step_order: null,
        current_step_name: null,
        current_approver_role: null,
        current_approver_user_id: null,
        updated_at: decidedAt,
      })
      .eq('id', instance.id);
    if (workflowError) throw new Error(workflowError.message);

    // Entity-specific status update (caller responsibility).
    await updateEntityStatus(entityId, decision, reviewerId, note, decidedAt);
  } else if (nextStep && nextRouting) {
    // Intermediate approval — advance to next step.
    const { error: workflowError } = await untypedSupabase
      .from('approval_instances')
      .update({
        current_step_id: nextStep.id,
        current_step_order: nextStep.stepOrder,
        current_step_name: nextStep.name,
        current_approver_role: nextRouting.approverRole,
        current_approver_user_id: nextRouting.approverUserId,
        updated_at: decidedAt,
      })
      .eq('id', instance.id);
    if (workflowError) throw new Error(workflowError.message);
  }

  // 8. Fire audit event (best-effort — never block the transaction).
  if (auditAdapter) {
    const event: ApprovalAuditEvent = {
      entityType,
      entityId,
      reviewerId,
      decision,
      stepName: currentStep.name,
      stepOrder: currentStep.stepOrder,
      note,
      decidedAt,
      isFinalDecision,
      nextStepName: nextStep?.name,
    };
    void auditAdapter.logApprovalAction(event).catch(() => undefined);
  }
}

/**
 * Resets a previously rejected approval instance back to `pending` at step 1.
 * Used when the entity owner resubmits after a rejection.
 *
 * Throws if the instance is not in `rejected` state.
 */
export async function resubmitApprovalInstance(
  companyId: string,
  entityType: FlowEntityType,
  entityId: string,
  requesterId: string,
): Promise<void> {
  const { data: instanceRow, error: instanceError } = await untypedSupabase
    .from('approval_instances')
    .select('id, flow_id, status')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();
  if (instanceError) throw new Error(instanceError.message);
  if (!instanceRow) throw new Error(`No approval workflow found for this ${entityType}.`);

  const instance = rowToApprovalInstance(instanceRow as Record<string, unknown>);
  if (instance.status !== 'rejected') {
    throw new Error(`Only rejected ${entityType.replace('_', ' ')} approvals can be resubmitted.`);
  }

  const { data: stepRows, error: stepsError } = await untypedSupabase    // TODO: Replace untypedSupabase after APPROVAL_STEP_SELECT is updated to use select('*')
    // and rowToApprovalStep() is updated to accept ApprovalStepRow.    .from('approval_steps')
    .select(APPROVAL_STEP_SELECT)
    .eq('flow_id', instance.flowId)
    .order('step_order');
  if (stepsError) throw new Error(stepsError.message);
  if (!stepRows?.length) {
    throw new Error(`The ${entityType} approval flow has no steps configured.`);
  }

  const firstStep = (stepRows as Record<string, unknown>[]).map(rowToApprovalStep).find((s) => s.isActive);
  if (!firstStep) {
    throw new Error(`The ${entityType} approval flow has no active steps configured.`);
  }

  const routing = await resolveStepRouting(firstStep, requesterId, companyId);

  const { error: workflowError } = await untypedSupabase
    .from('approval_instances')
    .update({
      requester_id: requesterId,
      status: 'pending',
      current_step_id: firstStep.id,
      current_step_order: firstStep.stepOrder,
      current_step_name: firstStep.name,
      current_approver_role: routing.approverRole,
      current_approver_user_id: routing.approverUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', instance.id);
  if (workflowError) throw new Error(workflowError.message);
}
