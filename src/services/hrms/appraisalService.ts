import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import * as pkg from '@flc/hrms-services';
import { Appraisal, AppraisalItem, AppraisalCycle, UpdateAppraisalItemInput } from '@/types';

export async function listAppraisals(
  companyId: string,
  opts?: { includeApprovalHistory?: boolean },
): Promise<{ data: Appraisal[]; error: string | null }> {
  try {
    const data = await pkg.listAppraisals(companyId, opts);
    return { data: data as Appraisal[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createAppraisal(
  companyId: string,
  input: { title: string; cycle: AppraisalCycle; periodStart: string; periodEnd: string },
  createdBy: string,
): Promise<{ error: string | null }> {
  try {
    await pkg.createAppraisal(companyId, input, createdBy);
    void logUserAction(createdBy, 'create', 'appraisal', companyId, {
      title: input.title,
      cycle: input.cycle,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reviewAppraisalActivation(
  appraisalId: string,
  reviewerId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<{ error: string | null }> {
  try {
    const { data: reviewer, error: reviewerError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', reviewerId)
      .single();
    if (reviewerError) return { error: reviewerError.message };
    const reviewerRole = String((reviewer as Record<string, unknown> | null)?.role ?? '');

    await pkg.reviewAppraisalActivation({ appraisalId, reviewerId, reviewerRole, decision, note });
    void logUserAction(reviewerId, 'update', 'appraisal', appraisalId, {
      approvalDecision: decision,
      reviewerNote: note ?? null,
    });
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resubmitAppraisalActivation(
  appraisalId: string,
  requesterId: string,
): Promise<{ error: string | null }> {
  try {
    await pkg.resubmitAppraisalActivation(appraisalId, requesterId);
    void logUserAction(requesterId, 'update', 'appraisal', appraisalId, { approvalResubmitted: true });
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listAppraisalItems(appraisalId: string): Promise<{ data: AppraisalItem[]; error: string | null }> {
  try {
    const data = await pkg.listAppraisalItems(appraisalId);
    return { data: data as AppraisalItem[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function submitAppraisalSelfReview(
  itemId: string,
  employeeId: string,
  input: Pick<AppraisalItem, 'goals' | 'achievements' | 'areasToImprove' | 'employeeComments'>,
): Promise<{ error: string | null }> {
  try {
    await pkg.submitAppraisalSelfReview(itemId, employeeId, input);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reviewAppraisalItem(
  itemId: string,
  reviewerId: string,
  input: Pick<AppraisalItem, 'rating' | 'reviewerComments'>,
): Promise<{ error: string | null }> {
  try {
    await pkg.reviewAppraisalItem(itemId, reviewerId, input);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function acknowledgeAppraisalItem(
  itemId: string,
  employeeId: string,
  employeeComments?: string,
): Promise<{ error: string | null }> {
  try {
    await pkg.acknowledgeAppraisalItem(itemId, employeeId, employeeComments);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createAppraisalItem(
  appraisalId: string,
  companyId: string,
  input: { employeeId: string; reviewerId?: string; goals?: string; rating?: number },
): Promise<{ error: string | null }> {
  try {
    await pkg.createAppraisalItem(appraisalId, companyId, input);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateAppraisalItem(
  id: string,
  input: UpdateAppraisalItemInput,
  actorId?: string,
): Promise<{ error: string | null }> {
  try {
    await pkg.updateAppraisalItem(id, input);
    if (actorId) {
      void logUserAction(actorId, 'update', 'appraisal_item', id);
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteAppraisalItem(id: string, actorId?: string): Promise<{ error: string | null }> {
  try {
    await pkg.deleteAppraisalItem(id);
    if (actorId) {
      void logUserAction(actorId, 'delete', 'appraisal_item', id);
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
