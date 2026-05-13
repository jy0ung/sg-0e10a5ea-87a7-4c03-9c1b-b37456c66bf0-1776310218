import type { PayrollRun, PayrollItem, PayrollRunStatus, ApprovalDecision } from '@flc/types';
import { supabase } from '../shared/supabaseClient';
import { resolveStoredEmployeeIdentities } from '../shared/identity';
import { bootstrapApprovalInstanceForEntity, submitApprovalDecision, resubmitApprovalInstance } from '../approval/approvalEngine';
import { rowToApprovalDecision } from '../approval/approvalTypes';
import type { ApprovalAuditAdapter } from '../approval/approvalTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_PAYROLL_TRANSITIONS: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  draft:     ['finalised'],
  finalised: ['paid'],
  paid:      [],
};

function approvalMetaFromRuns(approvals: Array<{
  id: string;
  entity_id: string | null;
  status: string | null;
  current_step_order: number | null;
  current_step_name: string | null;
  current_approver_role: string | null;
  current_approver_user_id: string | null;
}>): Map<string, typeof approvals[number]> {
  const approvalMeta = new Map<string, typeof approvals[number]>();
  for (const a of approvals) approvalMeta.set(String(a.entity_id), a);
  return approvalMeta;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Lists all payroll runs for a company, newest first, with optional approval
 * history. Throws on database error.
 */
export async function listPayrollRuns(
  companyId: string,
  opts?: { includeApprovalHistory?: boolean },
): Promise<PayrollRun[]> {
  const { data, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('company_id', companyId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });
  if (error) throw new Error(error.message);

  const runIds = (data ?? []).map(run => String(run.id));
  const approvalHistory = new Map<string, ApprovalDecision[]>();
  let approvalMeta = approvalMetaFromRuns([]);

  if (runIds.length) {
    const { data: approvals, error: approvalError } = await supabase
      .from('approval_instances')
      .select('id, entity_id, status, current_step_order, current_step_name, current_approver_role, current_approver_user_id')
      .eq('entity_type', 'payroll_run')
      .in('entity_id', runIds);
    if (approvalError) throw new Error(approvalError.message);
    approvalMeta = approvalMetaFromRuns(approvals ?? []);

    if (opts?.includeApprovalHistory) {
      const instanceIds = (approvals ?? []).map(a => String(a.id));
      if (instanceIds.length) {
        const { data: decisions, error: decisionsError } = await supabase
          .from('approval_decisions')
          // TODO: Replace Record cast after join shape is represented in Database types.
          .select('id, instance_id, step_id, step_order, approver_id, decision, note, decided_at, created_at, approver:profiles!approval_decisions_approver_id_fkey(name), step:approval_steps!approval_decisions_step_id_fkey(name)')
          .in('instance_id', instanceIds)
          .order('decided_at');
        if (decisionsError) throw new Error(decisionsError.message);
        for (const d of decisions ?? []) {
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
      id:             String(r.id),
      companyId:      String(r.company_id),
      periodYear:     Number(r.period_year),
      periodMonth:    Number(r.period_month),
      status:         r.status as PayrollRunStatus,
      approvalInstanceId:       meta?.id ? String(meta.id) : undefined,
      approvalInstanceStatus:   meta?.status ? String(meta.status) as PayrollRun['approvalInstanceStatus'] : undefined,
      currentApprovalStepOrder: meta?.current_step_order != null ? Number(meta.current_step_order) : undefined,
      currentApprovalStepName:  meta?.current_step_name ? String(meta.current_step_name) : undefined,
      currentApproverRole:      meta?.current_approver_role ? String(meta.current_approver_role) : undefined,
      currentApproverUserId:    meta?.current_approver_user_id ? String(meta.current_approver_user_id) : undefined,
      approvalHistory: meta?.id ? (approvalHistory.get(String(meta.id)) ?? []) : undefined,
      totalHeadcount: Number(r.total_headcount),
      totalGross:     Number(r.total_gross),
      totalNet:       Number(r.total_net),
      notes:          r.notes ? String(r.notes) : undefined,
      createdBy:      r.created_by ? String(r.created_by) : undefined,
      createdAt:      String(r.created_at),
      updatedAt:      String(r.updated_at),
    };
  });
}

/**
 * Creates a new payroll run and bootstraps its approval instance.
 * On bootstrap failure the run is deleted to keep data consistent.
 * Throws on any error.
 */
export async function createPayrollRun(
  companyId: string,
  periodYear: number,
  periodMonth: number,
  createdBy: string,
): Promise<PayrollRun> {
  const { data, error } = await supabase
    .from('payroll_runs')
    .insert({ company_id: companyId, period_year: periodYear, period_month: periodMonth, created_by: createdBy })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const runId = String(data.id);
  try {
    await bootstrapApprovalInstanceForEntity(companyId, 'payroll_run', runId, createdBy);
  } catch (workflowError) {
    await supabase.from('payroll_runs').delete().eq('id', runId);
    throw workflowError;
  }

  return {
    id:             runId,
    companyId:      String(data.company_id),
    periodYear:     Number(data.period_year),
    periodMonth:    Number(data.period_month),
    status:         data.status as PayrollRunStatus,
    totalHeadcount: 0,
    totalGross:     0,
    totalNet:       0,
    createdAt:      String(data.created_at),
    updatedAt:      String(data.updated_at),
  };
}

/**
 * Transitions a payroll run status. Only valid transitions are allowed.
 * Blocks direct finalisation if an approval workflow is active.
 * Throws on invalid transition or database error.
 */
export async function updatePayrollRunStatus(
  runId: string,
  status: PayrollRunStatus,
): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('id', runId)
    .single();
  if (currentError) throw new Error(currentError.message);

  const currentStatus = current?.status as PayrollRunStatus | undefined;
  if (currentStatus && !VALID_PAYROLL_TRANSITIONS[currentStatus]?.includes(status)) {
    throw new Error(`Cannot transition payroll from '${currentStatus}' to '${status}'.`);
  }

  if (status === 'finalised') {
    const { data: approvalInstance, error: approvalError } = await supabase
      .from('approval_instances')
      .select('id')
      .eq('entity_type', 'payroll_run')
      .eq('entity_id', runId)
      .maybeSingle();
    if (approvalError) throw new Error(approvalError.message);
    if (approvalInstance) {
      throw new Error('Payroll finalisation is controlled by the approval workflow for this run.');
    }
  }

  const { error } = await supabase.from('payroll_runs').update({ status }).eq('id', runId);
  if (error) throw new Error(error.message);
}

/**
 * Submits an approval decision for a payroll run finalisation.
 * The payroll run must be in 'draft' status and have an active approval instance.
 * Throws on any business rule violation or database error.
 *
 * Note: Final approval sets the payroll run status to 'finalised', not 'approved'.
 */
export async function reviewPayrollRunFinalisation(
  input: {
    runId: string;
    reviewerId: string;
    reviewerRole: string;
    decision: 'approved' | 'rejected';
    note?: string;
  },
  auditAdapter?: ApprovalAuditAdapter,
): Promise<void> {
  const { runId, reviewerId, reviewerRole, decision, note } = input;

  const { data: run, error: runError } = await supabase
    .from('payroll_runs')
    .select('status, created_by, company_id')
    .eq('id', runId)
    .single();
  if (runError) throw new Error(runError.message);

  const runStatus = (run?.status as PayrollRunStatus | undefined) ?? 'draft';
  if (runStatus !== 'draft') {
    throw new Error('Only draft payroll runs can be reviewed for finalisation.');
  }

  const companyId = String(run?.company_id ?? '');
  const ownerId = String(run?.created_by ?? '');
  // The owner may be a profile ID already; resolveRequiredProfileId handles both.
  const requesterId = ownerId;

  await submitApprovalDecision(
    { entityType: 'payroll_run', entityId: runId, reviewerId, reviewerRole, companyId, requesterId, decision, note },
    async (entityId, dec, _rId, _n, decidedAt) => {
      // Final approval sets 'finalised', not 'approved', to match domain semantics.
      if (dec === 'approved') {
        const { error } = await supabase
          .from('payroll_runs')
          .update({ status: 'finalised', updated_at: decidedAt })
          .eq('id', entityId);
        if (error) throw new Error(error.message);
      }
      // Rejection: no entity status change needed (entity stays 'draft').
    },
    auditAdapter,
  );
}

/**
 * Resets a rejected payroll run approval back to step 1 so the owner can
 * resubmit for approval.
 * Throws on any business rule violation or database error.
 */
export async function resubmitPayrollRunFinalisation(
  runId: string,
  requesterId: string,
): Promise<void> {
  const { data: run, error: runError } = await supabase
    .from('payroll_runs')
    .select('status, created_by, company_id')
    .eq('id', runId)
    .single();
  if (runError) throw new Error(runError.message);

  const runStatus = (run?.status as PayrollRunStatus | undefined) ?? 'draft';
  if (runStatus !== 'draft') {
    throw new Error('Only draft payroll runs can be resubmitted for finalisation.');
  }

  const runOwnerId = String(run?.created_by ?? '');
  const companyId = String(run?.company_id ?? '');
  if (!runOwnerId || runOwnerId !== requesterId) {
    throw new Error('Only the payroll owner can resubmit this finalisation request.');
  }

  await resubmitApprovalInstance(companyId, 'payroll_run', runId, requesterId);
}

/**
 * Lists the line items for a payroll run with resolved employee names.
 * Throws on database error.
 */
export async function listPayrollItems(runId: string): Promise<PayrollItem[]> {
  const { data, error } = await supabase
    .from('payroll_items')
    .select('*')
    .eq('payroll_run_id', runId);
  if (error) throw new Error(error.message);

  const identityMap = await resolveStoredEmployeeIdentities(
    (data ?? []).map(row => String(row.employee_id ?? '')),
  );

  return (data ?? []).map(r => ({
    id:              String(r.id),
    payrollRunId:    String(r.payroll_run_id),
    employeeId:      String(r.employee_id ?? ''),
    employeeName:    identityMap.get(String(r.employee_id ?? ''))?.name,
    basicSalary:     Number(r.basic_salary),
    allowances:      Number(r.allowances),
    overtime:        Number(r.overtime),
    grossPay:        Number(r.gross_pay),
    epfEmployee:     Number(r.epf_employee),
    socsoEmployee:   Number(r.socso_employee),
    incomeTax:       Number(r.income_tax),
    otherDeductions: Number(r.other_deductions),
    totalDeductions: Number(r.total_deductions),
    netPay:          Number(r.net_pay),
    epfEmployer:     Number(r.epf_employer),
    socsoEmployer:   Number(r.socso_employer),
    notes:           r.notes ? String(r.notes) : undefined,
  }));
}

// ─── Self-service: payslips ───────────────────────────────────────────────────

export interface PayslipSummary {
  id:          string;
  periodYear:  number;
  periodMonth: number;
  grossPay:    number;
  netPay:      number;
  status:      string;
}

/**
 * Returns payslip summaries for an employee across all runs in a company.
 * Throws on database error.
 */
export async function getMyPayslips(
  employeeId: string,
  companyId: string,
): Promise<PayslipSummary[]> {
  const { data, error } = await supabase
    .from('payroll_items')
    .select('id, gross_pay, net_pay, payroll_runs!inner(period_year, period_month, status, company_id)')
    .eq('payroll_runs.company_id', companyId)
    .eq('employee_id', employeeId)
    .order('payroll_runs(period_year)', { ascending: false })
    .order('payroll_runs(period_month)', { ascending: false });
  if (error) throw new Error(error.message);
  // TODO: Replace Record cast after payroll_items + payroll_runs join shape is in Database types.
  return (data ?? []).map((r: Record<string, unknown>) => {
    const run = r.payroll_runs as Record<string, unknown>;
    return {
      id:          String(r.id),
      periodYear:  Number(run?.period_year),
      periodMonth: Number(run?.period_month),
      grossPay:    Number(r.gross_pay),
      netPay:      Number(r.net_pay),
      status:      String(run?.status ?? 'draft'),
    };
  });
}
