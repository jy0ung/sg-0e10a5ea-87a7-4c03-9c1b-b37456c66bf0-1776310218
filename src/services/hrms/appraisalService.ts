import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import {
  Appraisal, AppraisalItem, AppraisalStatus, AppraisalCycle, UpdateAppraisalItemInput,
} from '@/types';
import {
  AppraisalItemRecord,
  rowToAppraisalItem, rowToApprovalDecision, rowToApprovalInstance, rowToApprovalStep,
  resolveStepRouting, bootstrapApprovalInstanceForEntity,
  resolveRequiredProfileId, resolveStoredEmployeeIdentities, resolveStoredProfileIds,
} from './shared';
import { listEmployeeDirectory } from './employeeService';

// ── Appraisal-only private helpers ────────────────────────────────────────────

async function seedAppraisalItemsForCycle(
  appraisalId: string,
  companyId: string,
  fallbackReviewerId: string,
): Promise<{ error: string | null }> {
  const { data: existingItems, error: existingItemsError } = await supabase
    .from('appraisal_items')
    .select('id')
    .eq('appraisal_id', appraisalId)
    .limit(1);
  if (existingItemsError) return { error: existingItemsError.message };
  if (existingItems?.length) return { error: null };

  const employeeDirectory = await listEmployeeDirectory(companyId);
  if (employeeDirectory.error) return { error: employeeDirectory.error };

  const activeEmployees = employeeDirectory.data.filter(employee => employee.status === 'active');
  if (!activeEmployees.length) return { error: 'No active employees are available for this appraisal cycle.' };

  const reviewerProfileIds = await resolveStoredProfileIds(activeEmployees.map(employee => employee.managerId ?? ''));
  if (reviewerProfileIds.error) return { error: reviewerProfileIds.error };

  const items = activeEmployees.map(employee => ({
    appraisal_id: appraisalId,
    employee_id: employee.id,
    reviewer_id: employee.managerId
      ? reviewerProfileIds.data.get(employee.managerId) ?? fallbackReviewerId
      : fallbackReviewerId,
    status: 'pending',
  }));

  const { error: itemError } = await supabase
    .from('appraisal_items')
    .insert(items);
  return { error: itemError?.message ?? null };
}

async function syncAppraisalCompletionStatus(appraisalId: string): Promise<{ error: string | null }> {
  const { data: items, error: itemError } = await supabase
    .from('appraisal_items')
    .select('status')
    .eq('appraisal_id', appraisalId);
  if (itemError) return { error: itemError.message };
  if (!items?.length || items.some(item => String(item.status ?? 'pending') !== 'acknowledged')) {
    return { error: null };
  }

  const { error: appraisalError } = await supabase
    .from('appraisals')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', appraisalId);
  return { error: appraisalError?.message ?? null };
}

async function getAppraisalItemActionContext(itemId: string): Promise<{
  data: { item: AppraisalItemRecord; appraisalStatus: AppraisalStatus } | null;
  error: string | null;
}> {
  const { data: itemRow, error: itemError } = await supabase
    .from('appraisal_items')
    .select('id, appraisal_id, employee_id, reviewer_id, rating, goals, achievements, areas_to_improve, reviewer_comments, employee_comments, status, reviewed_at')
    .eq('id', itemId)
    .single();
  if (itemError) return { data: null, error: itemError.message };

  const item = rowToAppraisalItem(itemRow as Record<string, unknown>);
  const { data: appraisalRow, error: appraisalError } = await supabase
    .from('appraisals')
    .select('status')
    .eq('id', item.appraisalId)
    .single();
  if (appraisalError) return { data: null, error: appraisalError.message };

  return {
    data: {
      item,
      appraisalStatus: ((appraisalRow as Record<string, unknown> | null)?.status as AppraisalStatus | undefined) ?? 'open',
    },
    error: null,
  };
}

export async function listAppraisals(
  companyId: string,
  opts?: { includeApprovalHistory?: boolean },
): Promise<{ data: Appraisal[]; error: string | null }> {
  const { data, error } = await supabase
    .from('appraisals')
    .select('*')
    .eq('company_id', companyId)
    .order('period_start', { ascending: false });
  if (error) return { data: [], error: error.message };

  const appraisalIds = (data ?? []).map(r => String(r.id));
  const approvalMeta = new Map<string, Record<string, unknown>>();
  const approvalHistory = new Map<string, ApprovalDecision[]>();

  if (appraisalIds.length) {
    const { data: approvals, error: approvalError } = await supabase
      .from('approval_instances')
      .select('id, entity_id, status, current_step_order, current_step_name, current_approver_role, current_approver_user_id')
      .eq('entity_type', 'appraisal')
      .in('entity_id', appraisalIds);
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
          const mappedDecision = rowToApprovalDecision(decision as Record<string, unknown>);
          if (!approvalHistory.has(mappedDecision.instanceId)) approvalHistory.set(mappedDecision.instanceId, []);
          approvalHistory.get(mappedDecision.instanceId)!.push(mappedDecision);
        }
      }
    }
  }

  const mapped: Appraisal[] = (data ?? []).map(r => ({
    id:          String(r.id),
    companyId:   String(r.company_id),
    title:       String(r.title),
    cycle:       r.cycle as AppraisalCycle,
    periodStart: String(r.period_start),
    periodEnd:   String(r.period_end),
    status:      r.status as AppraisalStatus,
    approvalInstanceId: approvalMeta.get(String(r.id))?.id ? String(approvalMeta.get(String(r.id))?.id) : undefined,
    approvalInstanceStatus: approvalMeta.get(String(r.id))?.status
      ? String(approvalMeta.get(String(r.id))?.status) as Appraisal['approvalInstanceStatus']
      : undefined,
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
    createdBy:   r.created_by ? String(r.created_by) : undefined,
    createdAt:   String(r.created_at),
    updatedAt:   String(r.updated_at),
  }));
  return { data: mapped, error: null };
}

export async function createAppraisal(
  companyId: string,
  input: { title: string; cycle: AppraisalCycle; periodStart: string; periodEnd: string },
  createdBy: string,
): Promise<{ error: string | null }> {
  const { data: flows, error: flowError } = await supabase
    .from('approval_flows')
    .select('id')
    .eq('company_id', companyId)
    .eq('entity_type', 'appraisal')
    .eq('is_active', true)
    .limit(2);
  if (flowError) return { error: flowError.message };
  if ((flows?.length ?? 0) > 1) {
    return { error: 'Multiple active approval flows found for appraisal. Deactivate extras before continuing.' };
  }

  const requiresApproval = Boolean(flows?.length);
  const { data, error } = await supabase.from('appraisals').insert({
    company_id:   companyId,
    title:        input.title,
    cycle:        input.cycle,
    period_start: input.periodStart,
    period_end:   input.periodEnd,
    status:       requiresApproval ? 'in_progress' : 'open',
    created_by:   createdBy,
  }).select().single();
  if (error) return { error: error.message };

  const appraisalId = String(data.id);
  if (requiresApproval) {
    const bootstrapResult = await bootstrapApprovalInstanceForEntity(companyId, 'appraisal', appraisalId, createdBy);
    if (bootstrapResult.error) {
      await supabase.from('appraisals').delete().eq('id', appraisalId);
      return { error: bootstrapResult.error };
    }
  } else {
    const seedResult = await seedAppraisalItemsForCycle(appraisalId, companyId, createdBy);
    if (seedResult.error) {
      await supabase.from('appraisals').delete().eq('id', appraisalId);
      return { error: seedResult.error };
    }
  }

  void logUserAction(createdBy, 'create', 'appraisal', appraisalId, {
    title: input.title,
    cycle: input.cycle,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    approvalRequired: requiresApproval,
  });
  return { error: null };
}

export async function reviewAppraisalActivation(
  appraisalId: string,
  reviewerId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<{ error: string | null }> {
  const { data: appraisal, error: appraisalError } = await supabase
    .from('appraisals')
    .select('status, created_by')
    .eq('id', appraisalId)
    .single();
  if (appraisalError) return { error: appraisalError.message };

  const appraisalStatus = (appraisal?.status as AppraisalStatus | undefined) ?? 'open';
  if (appraisalStatus !== 'in_progress') {
    return { error: 'Only appraisal cycles pending activation can be reviewed.' };
  }

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
    .eq('entity_type', 'appraisal')
    .eq('entity_id', appraisalId)
    .maybeSingle();
  if (approvalError) return { error: approvalError.message };
  if (!approvalInstance) {
    return { error: 'This appraisal cycle does not have an approval workflow.' };
  }

  const instance = rowToApprovalInstance(approvalInstance as Record<string, unknown>);
  if (instance.status !== 'pending') {
    return { error: `This appraisal approval is already ${instance.status}.` };
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
  if (!currentStep) return { error: 'The current appraisal approval step could not be resolved.' };

  const requesterId = instance.requesterId || String((appraisal as Record<string, unknown> | null)?.created_by ?? '');
  if (requesterId && requesterId === reviewerId && !currentStep.allowSelfApproval) {
    return { error: 'You cannot approve or reject your own appraisal cycle.' };
  }

  const isAssignedApprover = currentStep.approverType === 'role'
    ? Boolean(instance.currentApproverRole) && instance.currentApproverRole === reviewerRole
    : Boolean(instance.currentApproverUserId) && instance.currentApproverUserId === reviewerId;
  if (!isAssignedApprover) {
    return { error: 'You are not the assigned approver for the current appraisal step.' };
  }

  const nextStep = decision === 'approved'
    ? steps.find(step => step.stepOrder > currentStep.stepOrder)
    : undefined;
  const nextRouting = nextStep
    ? await resolveStepRouting(nextStep, requesterId)
    : { approverRole: null, approverUserId: null, error: null };
  if (nextRouting.error) return { error: nextRouting.error };

  const decidedAt = new Date().toISOString();
  const { error: decisionError } = await supabase
    .from('approval_decisions')
    .insert({
      instance_id: instance.id,
      step_id: currentStep.id,
      step_order: currentStep.stepOrder,
      approver_id: reviewerId,
      decision,
      note: note ?? null,
      decided_at: decidedAt,
    });
  if (decisionError) return { error: decisionError.message };

  if (decision === 'rejected') {
    const [{ error: workflowError }, { error: appraisalUpdateError }] = await Promise.all([
      supabase
        .from('approval_instances')
        .update({
          status: 'rejected',
          current_step_id: null,
          current_step_order: null,
          current_step_name: null,
          current_approver_role: null,
          current_approver_user_id: null,
          updated_at: decidedAt,
        })
        .eq('id', instance.id),
      supabase
        .from('appraisals')
        .update({ updated_at: decidedAt })
        .eq('id', appraisalId),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (appraisalUpdateError) return { error: appraisalUpdateError.message };
  } else if (nextStep) {
    const [{ error: workflowError }, { error: appraisalUpdateError }] = await Promise.all([
      supabase
        .from('approval_instances')
        .update({
          current_step_id: nextStep.id,
          current_step_order: nextStep.stepOrder,
          current_step_name: nextStep.name,
          current_approver_role: nextRouting.approverRole,
          current_approver_user_id: nextRouting.approverUserId,
          updated_at: decidedAt,
        })
        .eq('id', instance.id),
      supabase
        .from('appraisals')
        .update({ updated_at: decidedAt })
        .eq('id', appraisalId),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (appraisalUpdateError) return { error: appraisalUpdateError.message };
  } else {
    const seedResult = await seedAppraisalItemsForCycle(appraisalId, String((appraisal as Record<string, unknown> | null)?.company_id ?? ''), reviewerId);
    if (seedResult.error) return { error: seedResult.error };

    const [{ error: workflowError }, { error: appraisalUpdateError }] = await Promise.all([
      supabase
        .from('approval_instances')
        .update({
          status: 'approved',
          current_step_id: null,
          current_step_order: null,
          current_step_name: null,
          current_approver_role: null,
          current_approver_user_id: null,
          updated_at: decidedAt,
        })
        .eq('id', instance.id),
      supabase
        .from('appraisals')
        .update({ status: 'open', updated_at: decidedAt })
        .eq('id', appraisalId),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (appraisalUpdateError) return { error: appraisalUpdateError.message };
  }

  void logUserAction(reviewerId, 'update', 'appraisal', appraisalId, {
    approvalDecision: decision,
    approvalStep: currentStep.name,
    reviewerNote: note ?? null,
    finalDecision: decision === 'rejected' || !nextStep,
    nextApprovalStep: nextStep?.name ?? null,
  });
  return { error: null };
}

export async function resubmitAppraisalActivation(
  appraisalId: string,
  requesterId: string,
): Promise<{ error: string | null }> {
  const { data: appraisal, error: appraisalError } = await supabase
    .from('appraisals')
    .select('status, created_by')
    .eq('id', appraisalId)
    .single();
  if (appraisalError) return { error: appraisalError.message };

  const appraisalStatus = (appraisal?.status as AppraisalStatus | undefined) ?? 'open';
  if (appraisalStatus !== 'in_progress') {
    return { error: 'Only appraisal cycles pending activation can be resubmitted.' };
  }

  const appraisalOwnerId = String((appraisal as Record<string, unknown> | null)?.created_by ?? '');
  if (!appraisalOwnerId || appraisalOwnerId !== requesterId) {
    return { error: 'Only the appraisal owner can resubmit this activation request.' };
  }

  const { data: approvalInstance, error: approvalError } = await supabase
    .from('approval_instances')
    .select('id, flow_id, requester_id, status')
    .eq('entity_type', 'appraisal')
    .eq('entity_id', appraisalId)
    .maybeSingle();
  if (approvalError) return { error: approvalError.message };
  if (!approvalInstance) {
    return { error: 'This appraisal cycle does not have an approval workflow.' };
  }

  const instance = rowToApprovalInstance(approvalInstance as Record<string, unknown>);
  if (instance.status !== 'rejected') {
    return { error: 'Only rejected appraisal approvals can be resubmitted.' };
  }

  const { data: stepRows, error: stepsError } = await supabase
    .from('approval_steps')
    .select('id, step_order, name, approver_type, approver_role, approver_user_id, allow_self_approval')
    .eq('flow_id', instance.flowId)
    .order('step_order');
  if (stepsError) return { error: stepsError.message };
  if (!stepRows?.length) return { error: 'The appraisal approval flow has no steps configured.' };

  const firstStep = rowToApprovalStep(stepRows[0] as Record<string, unknown>);
  const routing = await resolveStepRouting(firstStep, requesterId);
  if (routing.error) return { error: routing.error };

  const resubmittedAt = new Date().toISOString();
  const [{ error: workflowError }, { error: appraisalUpdateError }] = await Promise.all([
    supabase
      .from('approval_instances')
      .update({
        requester_id: requesterId,
        status: 'pending',
        current_step_id: firstStep.id,
        current_step_order: firstStep.stepOrder,
        current_step_name: firstStep.name,
        current_approver_role: routing.approverRole,
        current_approver_user_id: routing.approverUserId,
        updated_at: resubmittedAt,
      })
      .eq('id', instance.id),
    supabase
      .from('appraisals')
      .update({ updated_at: resubmittedAt })
      .eq('id', appraisalId),
  ]);
  if (workflowError) return { error: workflowError.message };
  if (appraisalUpdateError) return { error: appraisalUpdateError.message };

  void logUserAction(requesterId, 'update', 'appraisal', appraisalId, {
    approvalResubmitted: true,
    approvalFlowId: instance.flowId,
    approvalStep: firstStep.name,
  });
  return { error: null };
}

export async function listAppraisalItems(appraisalId: string): Promise<{ data: AppraisalItem[]; error: string | null }> {
  let { data, error } = await supabase
    .from('appraisal_items')
    .select('*, reviewer:profiles!reviewer_id(name)')
    .eq('appraisal_id', appraisalId);
  if (error) return { data: [], error: error.message };

  if (!(data?.length)) {
    const { data: appraisalRow, error: appraisalError } = await supabase
      .from('appraisals')
      .select('company_id, created_by, status')
      .eq('id', appraisalId)
      .single();
    if (appraisalError) return { data: [], error: appraisalError.message };

    const appraisalStatus = String((appraisalRow as Record<string, unknown> | null)?.status ?? 'open');
    if (appraisalStatus === 'open') {
      const seedResult = await seedAppraisalItemsForCycle(
        appraisalId,
        String((appraisalRow as Record<string, unknown> | null)?.company_id ?? ''),
        String((appraisalRow as Record<string, unknown> | null)?.created_by ?? ''),
      );
      if (seedResult.error) return { data: [], error: seedResult.error };

      const refetch = await supabase
        .from('appraisal_items')
        .select('*, reviewer:profiles!reviewer_id(name)')
        .eq('appraisal_id', appraisalId);
      data = refetch.data;
      error = refetch.error;
      if (error) return { data: [], error: error.message };
    }
  }

  const identityMap = await resolveStoredEmployeeIdentities((data ?? []).map(row => String(row.employee_id ?? '')));
  if (identityMap.error) return { data: [], error: identityMap.error };

  const mapped: AppraisalItem[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:               String(r.id),
    appraisalId:      String(r.appraisal_id),
    employeeId:       String(r.employee_id ?? ''),
    employeeName:     identityMap.data.get(String(r.employee_id ?? ''))?.name,
    reviewerId:       r.reviewer_id ? String(r.reviewer_id) : undefined,
    reviewerName:     (r.reviewer as Record<string, unknown> | null)?.name ? String((r.reviewer as Record<string, unknown>).name) : undefined,
    rating:           r.rating != null ? Number(r.rating) : undefined,
    goals:            r.goals ? String(r.goals) : undefined,
    achievements:     r.achievements ? String(r.achievements) : undefined,
    areasToImprove:   r.areas_to_improve ? String(r.areas_to_improve) : undefined,
    reviewerComments: r.reviewer_comments ? String(r.reviewer_comments) : undefined,
    employeeComments: r.employee_comments ? String(r.employee_comments) : undefined,
    status:           r.status as AppraisalItem['status'],
    reviewedAt:       r.reviewed_at ? String(r.reviewed_at) : undefined,
  }));
  return { data: mapped, error: null };
}

export async function submitAppraisalSelfReview(
  itemId: string,
  employeeId: string,
  input: Pick<AppraisalItem, 'goals' | 'achievements' | 'areasToImprove' | 'employeeComments'>,
): Promise<{ error: string | null }> {
  const requesterProfileId = await resolveRequiredProfileId(employeeId);
  if (requesterProfileId.error) return { error: requesterProfileId.error };

  const context = await getAppraisalItemActionContext(itemId);
  if (context.error) return { error: context.error };
  if (!context.data) return { error: 'Appraisal item not found.' };

  const { item, appraisalStatus } = context.data;
  if (appraisalStatus !== 'open') return { error: 'Self review is only available for active appraisal cycles.' };
  if (item.employeeId !== employeeId) return { error: 'You can only submit your own appraisal self review.' };
  if (!['pending', 'self_reviewed'].includes(item.status)) {
    return { error: 'This appraisal item is no longer open for self review.' };
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('appraisal_items')
    .update({
      goals: input.goals ?? null,
      achievements: input.achievements ?? null,
      areas_to_improve: input.areasToImprove ?? null,
      employee_comments: input.employeeComments ?? null,
      status: 'self_reviewed',
      updated_at: updatedAt,
    })
    .eq('id', itemId);
  if (error) return { error: error.message };

  void logUserAction(requesterProfileId.data, 'update', 'appraisal_item', itemId, {
    action: 'self_review',
    appraisalId: item.appraisalId,
  });
  return { error: null };
}

export async function reviewAppraisalItem(
  itemId: string,
  reviewerId: string,
  input: Pick<AppraisalItem, 'rating' | 'reviewerComments'>,
): Promise<{ error: string | null }> {
  const context = await getAppraisalItemActionContext(itemId);
  if (context.error) return { error: context.error };
  if (!context.data) return { error: 'Appraisal item not found.' };

  const { item, appraisalStatus } = context.data;
  if (appraisalStatus !== 'open') return { error: 'Manager review is only available for active appraisal cycles.' };
  if (!item.reviewerId || item.reviewerId !== reviewerId) {
    return { error: 'You are not the assigned reviewer for this appraisal item.' };
  }
  if (!['self_reviewed', 'reviewed'].includes(item.status)) {
    return { error: 'The employee must complete self review before manager review.' };
  }

  const reviewedAt = new Date().toISOString();
  const { error } = await supabase
    .from('appraisal_items')
    .update({
      rating: input.rating ?? null,
      reviewer_comments: input.reviewerComments ?? null,
      status: 'reviewed',
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    })
    .eq('id', itemId);
  if (error) return { error: error.message };

  void logUserAction(reviewerId, 'update', 'appraisal_item', itemId, {
    action: 'manager_review',
    appraisalId: item.appraisalId,
    rating: input.rating ?? null,
  });
  return { error: null };
}

export async function acknowledgeAppraisalItem(
  itemId: string,
  employeeId: string,
  employeeComments?: string,
): Promise<{ error: string | null }> {
  const requesterProfileId = await resolveRequiredProfileId(employeeId);
  if (requesterProfileId.error) return { error: requesterProfileId.error };

  const context = await getAppraisalItemActionContext(itemId);
  if (context.error) return { error: context.error };
  if (!context.data) return { error: 'Appraisal item not found.' };

  const { item, appraisalStatus } = context.data;
  if (!['open', 'completed'].includes(appraisalStatus)) {
    return { error: 'Acknowledgement is only available for active appraisal cycles.' };
  }
  if (item.employeeId !== employeeId) {
    return { error: 'You can only acknowledge your own appraisal review.' };
  }
  if (!['reviewed', 'acknowledged'].includes(item.status)) {
    return { error: 'Manager review must be completed before acknowledgement.' };
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('appraisal_items')
    .update({
      employee_comments: employeeComments ?? item.employeeComments ?? null,
      status: 'acknowledged',
      updated_at: updatedAt,
    })
    .eq('id', itemId);
  if (error) return { error: error.message };

  const syncResult = await syncAppraisalCompletionStatus(item.appraisalId);
  if (syncResult.error) return syncResult;

  void logUserAction(requesterProfileId.data, 'update', 'appraisal_item', itemId, {
    action: 'acknowledge',
    appraisalId: item.appraisalId,
  });
  return { error: null };
}

export async function createAppraisalItem(
  appraisalId: string,
  companyId: string,
  input: { employeeId: string; reviewerId?: string; goals?: string; rating?: number },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('appraisal_items').insert({
    appraisal_id: appraisalId,
    company_id:   companyId,
    employee_id:  input.employeeId,
    reviewer_id:  input.reviewerId ?? null,
    goals:        input.goals ?? null,
    rating:       input.rating ?? null,
  });
  return { error: error?.message ?? null };
}

export async function updateAppraisalItem(
  id: string,
  input: UpdateAppraisalItemInput,
  actorId?: string,
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {};
  if (input.rating           !== undefined) payload.rating            = input.rating;
  if (input.goals            !== undefined) payload.goals             = input.goals;
  if (input.achievements     !== undefined) payload.achievements      = input.achievements;
  if (input.areasToImprove   !== undefined) payload.areas_to_improve  = input.areasToImprove;
  if (input.reviewerComments !== undefined) payload.reviewer_comments = input.reviewerComments;
  if (input.employeeComments !== undefined) payload.employee_comments = input.employeeComments;
  if (input.reviewerId       !== undefined) payload.reviewer_id       = input.reviewerId;
  if (input.status           !== undefined) payload.status            = input.status;
  if (input.reviewedAt       !== undefined) payload.reviewed_at       = input.reviewedAt;
  const { error } = await supabase.from('appraisal_items').update(payload).eq('id', id);
  if (!error && actorId) {
    void logUserAction(actorId, 'update', 'appraisal_item', id, { changes: payload });
  }
  return { error: error?.message ?? null };
}

export async function deleteAppraisalItem(id: string, actorId?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('appraisal_items').delete().eq('id', id);
  if (!error && actorId) {
    void logUserAction(actorId, 'delete', 'appraisal_item', id);
  }
  return { error: error?.message ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

