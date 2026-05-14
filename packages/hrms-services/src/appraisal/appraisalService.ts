import type {
  Appraisal, AppraisalItem, AppraisalStatus, AppraisalCycle,
  UpdateAppraisalItemInput, ApprovalDecision,
} from '@flc/types';
import type { AppraisalItemRow } from '@flc/supabase';
import { supabase } from '../shared/supabaseClient';
import {
  resolveRequiredProfileId,
  resolveStoredEmployeeIdentities,
  resolveStoredProfileIds,
} from '../shared/identity';
import { listEmployeeDirectory } from '../employee/employeeService';
import { bootstrapApprovalInstanceForEntity, submitApprovalDecision, resubmitApprovalInstance } from '../approval/approvalEngine';
import { rowToApprovalDecision } from '../approval/approvalTypes';
import type { ApprovalAuditAdapter } from '../approval/approvalTypes';

// ─── Internal types ───────────────────────────────────────────────────────────

export type AppraisalItemRecord = {
  id: string;
  appraisalId: string;
  employeeId: string;
  reviewerId?: string;
  status: AppraisalItem['status'];
  rating?: number;
  goals?: string;
  achievements?: string;
  areasToImprove?: string;
  reviewerComments?: string;
  employeeComments?: string;
  reviewedAt?: string;
};

export interface SelfServiceAppraisalItem extends AppraisalItem {
  appraisalTitle:  string;
  appraisalCycle:  AppraisalCycle;
  periodStart:     string;
  periodEnd:       string;
  appraisalStatus: AppraisalStatus;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function rowToAppraisalItemRecord(row: Pick<AppraisalItemRow,
  'id' | 'appraisal_id' | 'employee_id' | 'reviewer_id' | 'rating' |
  'goals' | 'achievements' | 'areas_to_improve' | 'reviewer_comments' |
  'employee_comments' | 'status' | 'reviewed_at'
>): AppraisalItemRecord {
  return {
    id:               String(row.id ?? ''),
    appraisalId:      String(row.appraisal_id ?? ''),
    employeeId:       String(row.employee_id ?? ''),
    reviewerId:       row.reviewer_id ? String(row.reviewer_id) : undefined,
    status:           (row.status as AppraisalItemRecord['status']) ?? 'pending',
    rating:           row.rating != null ? Number(row.rating) : undefined,
    goals:            row.goals ? String(row.goals) : undefined,
    achievements:     row.achievements ? String(row.achievements) : undefined,
    areasToImprove:   row.areas_to_improve ? String(row.areas_to_improve) : undefined,
    reviewerComments: row.reviewer_comments ? String(row.reviewer_comments) : undefined,
    employeeComments: row.employee_comments ? String(row.employee_comments) : undefined,
    reviewedAt:       row.reviewed_at ? String(row.reviewed_at) : undefined,
  };
}

async function getAppraisalItemActionContext(
  itemId: string,
): Promise<{ item: AppraisalItemRecord; appraisalStatus: AppraisalStatus }> {
  const { data: itemRow, error: itemError } = await supabase
    .from('appraisal_items')
    .select('id, appraisal_id, employee_id, reviewer_id, rating, goals, achievements, areas_to_improve, reviewer_comments, employee_comments, status, reviewed_at')
    .eq('id', itemId)
    .single();
  if (itemError) throw new Error(itemError.message);

  const item = rowToAppraisalItemRecord(itemRow);
  const { data: appraisalRow, error: appraisalError } = await supabase
    .from('appraisals')
    .select('status')
    .eq('id', item.appraisalId)
    .single();
  if (appraisalError) throw new Error(appraisalError.message);

  return {
    item,
    appraisalStatus: (appraisalRow?.status as AppraisalStatus | undefined) ?? 'open',
  };
}

/**
 * Seeds appraisal items for all active employees. No-ops if items already exist.
 * Throws on any error.
 */
async function seedAppraisalItemsForCycle(
  appraisalId: string,
  companyId: string,
  fallbackReviewerId: string,
): Promise<void> {
  const { data: existingItems, error: existError } = await supabase
    .from('appraisal_items')
    .select('id')
    .eq('appraisal_id', appraisalId)
    .limit(1);
  if (existError) throw new Error(existError.message);
  if (existingItems?.length) return;

  const allEmployees = await listEmployeeDirectory(companyId);
  const activeEmployees = allEmployees.filter(e => e.status === 'active');
  if (!activeEmployees.length) {
    throw new Error('No active employees are available for this appraisal cycle.');
  }

  const reviewerProfileIds = await resolveStoredProfileIds(
    activeEmployees.map(e => e.managerId ?? ''),
  );

  const items = activeEmployees.map(e => ({
    appraisal_id: appraisalId,
    employee_id:  e.id,
    reviewer_id:  e.managerId
      ? (reviewerProfileIds.get(e.managerId) ?? fallbackReviewerId)
      : fallbackReviewerId,
    status: 'pending',
  }));

  const { error: itemError } = await supabase.from('appraisal_items').insert(items);
  if (itemError) throw new Error(itemError.message);
}

/** Checks all items are acknowledged; if so, marks the appraisal 'completed'. */
async function syncAppraisalCompletionStatus(appraisalId: string): Promise<void> {
  const { data, error } = await supabase
    .from('appraisal_items')
    .select('status')
    .eq('appraisal_id', appraisalId);
  if (error) throw new Error(error.message);
  if (!data?.length || data.some(i => String(i.status ?? 'pending') !== 'acknowledged')) return;

  const { error: updateError } = await supabase
    .from('appraisals')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', appraisalId);
  if (updateError) throw new Error(updateError.message);
}

// TODO: Replace Record<string, unknown> with a typed join shape after appraisal_items +
// appraisals + profiles join is represented in Database types.
function rowToSelfServiceAppraisalItem(row: Record<string, unknown>): SelfServiceAppraisalItem {
  const appraisal = (row.appraisal ?? row.appraisals ?? {}) as Record<string, unknown>;
  const reviewer = row.reviewer as Record<string, unknown> | null;
  return {
    id:               String(row.id ?? ''),
    appraisalId:      String(row.appraisal_id ?? ''),
    employeeId:       String(row.employee_id ?? ''),
    reviewerId:       row.reviewer_id ? String(row.reviewer_id) : undefined,
    reviewerName:     reviewer?.name ? String(reviewer.name) : undefined,
    rating:           row.rating != null ? Number(row.rating) : undefined,
    goals:            row.goals ? String(row.goals) : undefined,
    achievements:     row.achievements ? String(row.achievements) : undefined,
    areasToImprove:   row.areas_to_improve ? String(row.areas_to_improve) : undefined,
    reviewerComments: row.reviewer_comments ? String(row.reviewer_comments) : undefined,
    employeeComments: row.employee_comments ? String(row.employee_comments) : undefined,
    status:           (row.status as AppraisalItem['status']) ?? 'pending',
    reviewedAt:       row.reviewed_at ? String(row.reviewed_at) : undefined,
    appraisalTitle:   String(appraisal.title ?? 'Appraisal'),
    appraisalCycle:   (appraisal.cycle as AppraisalCycle) ?? 'annual',
    periodStart:      String(appraisal.period_start ?? ''),
    periodEnd:        String(appraisal.period_end ?? ''),
    appraisalStatus:  (appraisal.status as AppraisalStatus) ?? 'open',
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Lists all appraisal cycles for a company, newest first.
 * Throws on database error.
 */
export async function listAppraisals(
  companyId: string,
  opts?: { includeApprovalHistory?: boolean },
): Promise<Appraisal[]> {
  const { data, error } = await supabase
    .from('appraisals')
    .select('*')
    .eq('company_id', companyId)
    .order('period_start', { ascending: false });
  if (error) throw new Error(error.message);

  const appraisalIds = (data ?? []).map(r => String(r.id));
  const approvalHistory = new Map<string, ApprovalDecision[]>();
  type AppraisalApprovalMeta = {
    id: string; entity_id: string | null; status: string | null;
    current_step_order: number | null; current_step_name: string | null;
    current_approver_role: string | null; current_approver_user_id: string | null;
  };
  // Build meta map: entity_id -> approval instance row
  const approvalMeta = new Map<string, AppraisalApprovalMeta>();

  if (appraisalIds.length) {
    const { data: approvals, error: approvalError } = await supabase
      .from('approval_instances')
      .select('id, entity_id, status, current_step_order, current_step_name, current_approver_role, current_approver_user_id')
      .eq('entity_type', 'appraisal')
      .in('entity_id', appraisalIds);
    if (approvalError) throw new Error(approvalError.message);
    for (const a of approvals ?? []) approvalMeta.set(String(a.entity_id), a);

    if (opts?.includeApprovalHistory) {
      const instanceIds = (approvals ?? []).map(a => String(a.id));
      if (instanceIds.length) {
        const { data: decisions, error: decisionsError } = await supabase
          .from('approval_decisions')
          .select('id, instance_id, step_id, step_order, approver_id, decision, note, decided_at, created_at, approver:profiles!approval_decisions_approver_id_fkey(name), step:approval_steps!approval_decisions_step_id_fkey(name)')
          .in('instance_id', instanceIds)
          .order('decided_at');
        if (decisionsError) throw new Error(decisionsError.message);
        for (const d of decisions ?? []) {
          // TODO: Replace Record cast after approval_decisions join shape is in Database types.
          const mapped = rowToApprovalDecision(d as Record<string, unknown>);
          if (!approvalHistory.has(mapped.instanceId)) approvalHistory.set(mapped.instanceId, []);
          approvalHistory.get(mapped.instanceId)!.push(mapped);
        }
      }
    }
  }

  return (data ?? []).map(r => {
    const meta = approvalMeta.get(String(r.id));
    return {
      id:          String(r.id),
      companyId:   String(r.company_id),
      title:       String(r.title),
      cycle:       r.cycle as AppraisalCycle,
      periodStart: String(r.period_start),
      periodEnd:   String(r.period_end),
      status:      r.status as AppraisalStatus,
      approvalInstanceId:       meta?.id ? String(meta.id) : undefined,
      approvalInstanceStatus:   meta?.status ? String(meta.status) as Appraisal['approvalInstanceStatus'] : undefined,
      currentApprovalStepOrder: meta?.current_step_order != null ? Number(meta.current_step_order) : undefined,
      currentApprovalStepName:  meta?.current_step_name ? String(meta.current_step_name) : undefined,
      currentApproverRole:      meta?.current_approver_role ? String(meta.current_approver_role) : undefined,
      currentApproverUserId:    meta?.current_approver_user_id ? String(meta.current_approver_user_id) : undefined,
      approvalHistory: meta?.id ? (approvalHistory.get(String(meta.id)) ?? []) : undefined,
      createdBy:   r.created_by ? String(r.created_by) : undefined,
      createdAt:   String(r.created_at),
      updatedAt:   String(r.updated_at),
    };
  });
}

/**
 * Creates an appraisal cycle. If an active approval flow exists, the cycle
 * starts in `in_progress` and waits for activation approval. Otherwise items
 * are seeded immediately and status is `open`.
 * Throws on any error.
 */
export async function createAppraisal(
  companyId: string,
  input: { title: string; cycle: AppraisalCycle; periodStart: string; periodEnd: string },
  createdBy: string,
): Promise<void> {
  const { data: flows, error: flowError } = await supabase
    .from('approval_flows')
    .select('id')
    .eq('company_id', companyId)
    .eq('entity_type', 'appraisal')
    .eq('is_active', true)
    .limit(2);
  if (flowError) throw new Error(flowError.message);
  if ((flows?.length ?? 0) > 1) {
    throw new Error('Multiple active approval flows found for appraisal. Deactivate extras before continuing.');
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
  if (error) throw new Error(error.message);

  const appraisalId = String(data.id);
  if (requiresApproval) {
    try {
      await bootstrapApprovalInstanceForEntity(companyId, 'appraisal', appraisalId, createdBy);
    } catch (workflowError) {
      await supabase.from('appraisals').delete().eq('id', appraisalId);
      throw workflowError;
    }
  } else {
    try {
      await seedAppraisalItemsForCycle(appraisalId, companyId, createdBy);
    } catch (seedError) {
      await supabase.from('appraisals').delete().eq('id', appraisalId);
      throw seedError;
    }
  }
}

/**
 * Submits an approval decision for an appraisal cycle activation.
 * Final approval seeds appraisal items and sets status to `open`.
 * Throws on any business rule violation or database error.
 */
export async function reviewAppraisalActivation(
  input: {
    appraisalId: string;
    reviewerId: string;
    decision: 'approved' | 'rejected';
    note?: string;
  },
  auditAdapter?: ApprovalAuditAdapter,
): Promise<void> {
  const { appraisalId, reviewerId, decision, note } = input;

  const { data: appraisal, error: appraisalError } = await supabase
    .from('appraisals')
    .select('status, created_by, company_id')
    .eq('id', appraisalId)
    .single();
  if (appraisalError) throw new Error(appraisalError.message);

  const appraisalStatus = (appraisal?.status as AppraisalStatus | undefined) ?? 'open';
  if (appraisalStatus !== 'in_progress') {
    throw new Error('Only appraisal cycles pending activation can be reviewed.');
  }

  const companyId = String(appraisal?.company_id ?? '');
  const requesterId = String(appraisal?.created_by ?? '');

  await submitApprovalDecision(
    { entityType: 'appraisal', entityId: appraisalId, reviewerId, companyId, requesterId, decision, note },
    async (entityId, dec, rId, _n, decidedAt) => {
      if (dec === 'rejected') {
        // Rejected: update timestamp only.
        const { error } = await supabase.from('appraisals').update({ updated_at: decidedAt }).eq('id', entityId);
        if (error) throw new Error(error.message);
      } else {
        // Final approved: seed items and activate the cycle.
        await seedAppraisalItemsForCycle(entityId, companyId, rId);
        const { error } = await supabase
          .from('appraisals')
          .update({ status: 'open', updated_at: decidedAt })
          .eq('id', entityId);
        if (error) throw new Error(error.message);
      }
    },
    auditAdapter,
  );
}

/**
 * Resets a rejected appraisal activation back to step 1.
 * Throws on any business rule violation or database error.
 */
export async function resubmitAppraisalActivation(
  appraisalId: string,
  requesterId: string,
): Promise<void> {
  const { data: appraisal, error: appraisalError } = await supabase
    .from('appraisals')
    .select('status, created_by, company_id')
    .eq('id', appraisalId)
    .single();
  if (appraisalError) throw new Error(appraisalError.message);

  const appraisalStatus = (appraisal?.status as AppraisalStatus | undefined) ?? 'open';
  if (appraisalStatus !== 'in_progress') {
    throw new Error('Only appraisal cycles pending activation can be resubmitted.');
  }

  const appraisalOwnerId = String(appraisal?.created_by ?? '');
  const companyId = String(appraisal?.company_id ?? '');
  if (!appraisalOwnerId || appraisalOwnerId !== requesterId) {
    throw new Error('Only the appraisal owner can resubmit this activation request.');
  }

  await resubmitApprovalInstance(companyId, 'appraisal', appraisalId, requesterId);
}

/**
 * Lists appraisal items for a cycle. If no items exist and the cycle is open,
 * seeds them on the fly (lazy seed for cycles created without approval).
 * Throws on database error.
 */
export async function listAppraisalItems(appraisalId: string): Promise<AppraisalItem[]> {
  const { data: initialData, error } = await supabase
    .from('appraisal_items')
    .select('*, reviewer:profiles!reviewer_id(name)')
    .eq('appraisal_id', appraisalId);
  if (error) throw new Error(error.message);
  let data = initialData;

  if (!data?.length) {
    const { data: appraisalRow, error: appraisalError } = await supabase
      .from('appraisals')
      .select('company_id, created_by, status')
      .eq('id', appraisalId)
      .single();
    if (appraisalError) throw new Error(appraisalError.message);

    const status = String(appraisalRow?.status ?? 'open');
    if (status === 'open') {
      await seedAppraisalItemsForCycle(
        appraisalId,
        String(appraisalRow?.company_id ?? ''),
        String(appraisalRow?.created_by ?? ''),
      );
      const refetch = await supabase
        .from('appraisal_items')
        .select('*, reviewer:profiles!reviewer_id(name)')
        .eq('appraisal_id', appraisalId);
      if (refetch.error) throw new Error(refetch.error.message);
      data = refetch.data;
    }
  }

  const identityMap = await resolveStoredEmployeeIdentities(
    (data ?? []).map(row => String(row.employee_id ?? '')),
  );

  // TODO: Replace Record cast after appraisal_items + profiles join shape is in Database types.
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:               String(r.id),
    appraisalId:      String(r.appraisal_id),
    employeeId:       String(r.employee_id ?? ''),
    employeeName:     identityMap.get(String(r.employee_id ?? ''))?.name,
    reviewerId:       r.reviewer_id ? String(r.reviewer_id) : undefined,
    reviewerName:     (r.reviewer as Record<string, unknown> | null)?.name
      ? String((r.reviewer as Record<string, unknown>).name)
      : undefined,
    rating:           r.rating != null ? Number(r.rating) : undefined,
    goals:            r.goals ? String(r.goals) : undefined,
    achievements:     r.achievements ? String(r.achievements) : undefined,
    areasToImprove:   r.areas_to_improve ? String(r.areas_to_improve) : undefined,
    reviewerComments: r.reviewer_comments ? String(r.reviewer_comments) : undefined,
    employeeComments: r.employee_comments ? String(r.employee_comments) : undefined,
    status:           r.status as AppraisalItem['status'],
    reviewedAt:       r.reviewed_at ? String(r.reviewed_at) : undefined,
  }));
}

// ─── Self-service ─────────────────────────────────────────────────────────────

/** Returns all appraisal items assigned to or owned by this employee. Throws on error. */
export async function getMyAppraisalItems(employeeId: string, _companyId?: string): Promise<SelfServiceAppraisalItem[]> {
  const { data, error } = await supabase
    .from('appraisal_items')
    .select('*, reviewer:profiles!reviewer_id(name), appraisal:appraisals!appraisal_id(title, cycle, period_start, period_end, status)')
    .or(`employee_id.eq.${employeeId},reviewer_id.eq.${employeeId}`);
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => rowToSelfServiceAppraisalItem(row as Record<string, unknown>));
}

/**
 * Submits the employee's self-review for their appraisal item.
 * Note: audit logging is the caller's responsibility.
 * Throws on business rule violation or database error.
 */
export async function submitAppraisalSelfReview(
  itemId: string,
  employeeId: string,
  input: Pick<AppraisalItem, 'goals' | 'achievements' | 'areasToImprove' | 'employeeComments'>,
): Promise<void> {
  const profileId = await resolveRequiredProfileId(employeeId);
  const { item, appraisalStatus } = await getAppraisalItemActionContext(itemId);

  if (appraisalStatus !== 'open') throw new Error('Self review is only available for active appraisal cycles.');
  if (item.employeeId !== employeeId && item.employeeId !== profileId) {
    throw new Error('You can only submit your own appraisal self review.');
  }
  if (!['pending', 'self_reviewed'].includes(item.status)) {
    throw new Error('This appraisal item is no longer open for self review.');
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('appraisal_items')
    .update({
      goals:             input.goals ?? null,
      achievements:      input.achievements ?? null,
      areas_to_improve:  input.areasToImprove ?? null,
      employee_comments: input.employeeComments ?? null,
      status:            'self_reviewed',
      updated_at:        updatedAt,
    })
    .eq('id', itemId);
  if (error) throw new Error(error.message);
}

/**
 * Submits the manager's review for an appraisal item.
 * Note: audit logging is the caller's responsibility.
 * Throws on business rule violation or database error.
 */
export async function reviewAppraisalItem(
  itemId: string,
  reviewerId: string,
  input: Pick<AppraisalItem, 'rating' | 'reviewerComments'>,
): Promise<void> {
  const { item, appraisalStatus } = await getAppraisalItemActionContext(itemId);

  if (appraisalStatus !== 'open') throw new Error('Manager review is only available for active appraisal cycles.');
  if (!item.reviewerId || item.reviewerId !== reviewerId) {
    throw new Error('You are not the assigned reviewer for this appraisal item.');
  }
  if (!['self_reviewed', 'reviewed'].includes(item.status)) {
    throw new Error('The employee must complete self review before manager review.');
  }

  const reviewedAt = new Date().toISOString();
  const { error } = await supabase
    .from('appraisal_items')
    .update({
      rating:            input.rating ?? null,
      reviewer_comments: input.reviewerComments ?? null,
      status:            'reviewed',
      reviewed_at:       reviewedAt,
      updated_at:        reviewedAt,
    })
    .eq('id', itemId);
  if (error) throw new Error(error.message);
}

/**
 * Acknowledges the appraisal review from the employee's side.
 * Triggers appraisal completion check.
 * Note: audit logging is the caller's responsibility.
 * Throws on business rule violation or database error.
 */
export async function acknowledgeAppraisalItem(
  itemId: string,
  employeeId: string,
  employeeComments?: string,
): Promise<void> {
  const profileId = await resolveRequiredProfileId(employeeId);
  const { item, appraisalStatus } = await getAppraisalItemActionContext(itemId);

  if (!['open', 'completed'].includes(appraisalStatus)) {
    throw new Error('Acknowledgement is only available for active appraisal cycles.');
  }
  if (item.employeeId !== employeeId && item.employeeId !== profileId) {
    throw new Error('You can only acknowledge your own appraisal review.');
  }
  if (!['reviewed', 'acknowledged'].includes(item.status)) {
    throw new Error('Manager review must be completed before acknowledgement.');
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('appraisal_items')
    .update({
      employee_comments: employeeComments ?? item.employeeComments ?? null,
      status:            'acknowledged',
      updated_at:        updatedAt,
    })
    .eq('id', itemId);
  if (error) throw new Error(error.message);

  await syncAppraisalCompletionStatus(item.appraisalId);
}

/** Creates a single appraisal item. Throws on database error. */
export async function createAppraisalItem(
  appraisalId: string,
  companyId: string,
  input: { employeeId: string; reviewerId?: string; goals?: string; rating?: number },
): Promise<void> {
  const { error } = await supabase.from('appraisal_items').insert({
    appraisal_id: appraisalId,
    company_id:   companyId,
    employee_id:  input.employeeId,
    reviewer_id:  input.reviewerId ?? null,
    goals:        input.goals ?? null,
    rating:       input.rating ?? null,
  } as never);
  if (error) throw new Error(error.message);
}

/** Updates an appraisal item. Throws on database error. */
export async function updateAppraisalItem(
  id: string,
  input: UpdateAppraisalItemInput,
): Promise<void> {
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
  const { error } = await supabase.from('appraisal_items').update(payload as never).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Deletes an appraisal item. Throws on database error. */
export async function deleteAppraisalItem(id: string): Promise<void> {
  const { error } = await supabase.from('appraisal_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
