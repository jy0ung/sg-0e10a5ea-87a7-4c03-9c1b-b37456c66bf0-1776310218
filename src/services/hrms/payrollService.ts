import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import * as pkg from '@flc/hrms-services';
import { PayrollRun, PayrollItem, PayrollRunStatus } from '@/types';

export async function listPayrollRuns(
  companyId: string,
  opts?: { includeApprovalHistory?: boolean },
): Promise<{ data: PayrollRun[]; error: string | null }> {
  try {
    const data = await pkg.listPayrollRuns(companyId, opts);
    return { data: data as PayrollRun[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createPayrollRun(
  companyId: string,
  periodYear: number,
  periodMonth: number,
  createdBy: string,
): Promise<{ data: PayrollRun | null; error: string | null }> {
  try {
    const data = await pkg.createPayrollRun(companyId, periodYear, periodMonth, createdBy);
    void logUserAction(createdBy, 'create', 'payroll_run', data.id, { periodYear, periodMonth });
    return { data: data as PayrollRun, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updatePayrollRunStatus(
  runId: string,
  status: PayrollRunStatus,
  actorId?: string,
): Promise<{ error: string | null }> {
  try {
    await pkg.updatePayrollRunStatus(runId, status);
    if (actorId) {
      void logUserAction(actorId, 'update', 'payroll_run', runId, { status });
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reviewPayrollRunFinalisation(
  runId: string,
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

    await pkg.reviewPayrollRunFinalisation({ runId, reviewerId, reviewerRole, decision, note });
    void logUserAction(reviewerId, 'update', 'payroll_run', runId, { decision, reviewerNote: note ?? null });
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resubmitPayrollRunFinalisation(
  runId: string,
  requesterId: string,
): Promise<{ error: string | null }> {
  try {
    await pkg.resubmitPayrollRunFinalisation(runId, requesterId);
    void logUserAction(requesterId, 'update', 'payroll_run', runId, { approvalResubmitted: true });
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listPayrollItems(runId: string): Promise<{ data: PayrollItem[]; error: string | null }> {
  try {
    const data = await pkg.listPayrollItems(runId);
    return { data: data as PayrollItem[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getMyPayslips(
  employeeId: string,
  companyId: string,
): Promise<{ data: pkg.PayslipSummary[]; error: string | null }> {
  try {
    const data = await pkg.getMyPayslips(employeeId, companyId);
    return { data, error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}
