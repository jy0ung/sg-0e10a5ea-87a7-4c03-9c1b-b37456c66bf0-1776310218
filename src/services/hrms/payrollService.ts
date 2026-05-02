import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import { PayrollRun, PayrollItem, PayrollRunStatus } from '@/types';
import {
  rowToApprovalDecision, rowToApprovalInstance, rowToApprovalStep,
  resolveStepRouting, bootstrapApprovalInstanceForEntity, resolveStoredEmployeeIdentities,
} from './shared';

export async function listPayrollRuns(
  companyId: string,
  opts?: { includeApprovalHistory?: boolean },
): Promise<{ data: PayrollRun[]; error: string | null }> {
  const { data, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('company_id', companyId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });
  if (error) return { data: [], error: error.message };

  const runIds = (data ?? []).map(run => String(run.id));
  const approvalMeta = new Map<string, Record<string, unknown>>();
  const approvalHistory = new Map<string, ApprovalDecision[]>();

  if (runIds.length) {
    const { data: approvals, error: approvalError } = await supabase
      .from('approval_instances')
      .select('id, entity_id, status, current_step_order, current_step_name, current_approver_role, current_approver_user_id')
      .eq('entity_type', 'payroll_run')
      .in('entity_id', runIds);
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
          const mapped = rowToApprovalDecision(decision as Record<string, unknown>);
          if (!approvalHistory.has(mapped.instanceId)) approvalHistory.set(mapped.instanceId, []);
          approvalHistory.get(mapped.instanceId)!.push(mapped);
        }
      }
    }
  }

  const mapped: PayrollRun[] = (data ?? []).map(r => ({
    id:             String(r.id),
    companyId:      String(r.company_id),
    periodYear:     Number(r.period_year),
    periodMonth:    Number(r.period_month),
    status:         r.status as PayrollRunStatus,
    approvalInstanceId: approvalMeta.get(String(r.id))?.id ? String(approvalMeta.get(String(r.id))?.id) : undefined,
    approvalInstanceStatus: approvalMeta.get(String(r.id))?.status
      ? String(approvalMeta.get(String(r.id))?.status) as PayrollRun['approvalInstanceStatus']
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
    totalHeadcount: Number(r.total_headcount),
    totalGross:     Number(r.total_gross),
    totalNet:       Number(r.total_net),
    notes:          r.notes ? String(r.notes) : undefined,
    createdBy:      r.created_by ? String(r.created_by) : undefined,
    createdAt:      String(r.created_at),
    updatedAt:      String(r.updated_at),
  }));
  return { data: mapped, error: null };
}

export async function createPayrollRun(
  companyId: string,
  periodYear: number,
  periodMonth: number,
  createdBy: string,
): Promise<{ data: PayrollRun | null; error: string | null }> {
  const { data, error } = await supabase
    .from('payroll_runs')
    .insert({ company_id: companyId, period_year: periodYear, period_month: periodMonth, created_by: createdBy })
    .select()
    .single();
  if (error) return { data: null, error: error.message };

  const runId = String(data.id);
  const bootstrapResult = await bootstrapApprovalInstanceForEntity(companyId, 'payroll_run', runId, createdBy);
  if (bootstrapResult.error) {
    await supabase.from('payroll_runs').delete().eq('id', runId);
    return { data: null, error: bootstrapResult.error };
  }

  void logUserAction(createdBy, 'create', 'payroll_run', runId, {
    periodYear,
    periodMonth,
  });

  return {
    data: {
      id: runId, companyId: String(data.company_id),
      periodYear: Number(data.period_year), periodMonth: Number(data.period_month),
      status: data.status as PayrollRunStatus,
      totalHeadcount: 0, totalGross: 0, totalNet: 0,
      createdAt: String(data.created_at), updatedAt: String(data.updated_at),
    },
    error: null,
  };
}

const VALID_PAYROLL_TRANSITIONS: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  draft:     ['finalised'],
  finalised: ['paid'],
  paid:      [],
};

export async function updatePayrollRunStatus(
  runId: string,
  status: PayrollRunStatus,
  actorId?: string,
): Promise<{ error: string | null }> {
  const { data: current, error: currentError } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('id', runId)
    .single();
  if (currentError) return { error: currentError.message };

  const currentStatus = current?.status as PayrollRunStatus | undefined;
  if (currentStatus && !VALID_PAYROLL_TRANSITIONS[currentStatus]?.includes(status)) {
    return { error: `Cannot transition payroll from '${currentStatus}' to '${status}'.` };
  }

  if (status === 'finalised') {
    const { data: approvalInstance, error: approvalError } = await supabase
      .from('approval_instances')
      .select('id')
      .eq('entity_type', 'payroll_run')
      .eq('entity_id', runId)
      .maybeSingle();
    if (approvalError) return { error: approvalError.message };
    if (approvalInstance) {
      return { error: 'Payroll finalisation is controlled by the approval workflow for this run.' };
    }
  }

  const { error } = await supabase.from('payroll_runs').update({ status }).eq('id', runId);
  if (!error && actorId) {
    void logUserAction(actorId, 'update', 'payroll_run', runId,
      { status, previousStatus: currentStatus });
  }
  return { error: error?.message ?? null };
}

export async function reviewPayrollRunFinalisation(
  runId: string,
  reviewerId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<{ error: string | null }> {
  const { data: run, error: runError } = await supabase
    .from('payroll_runs')
    .select('status, created_by')
    .eq('id', runId)
    .single();
  if (runError) return { error: runError.message };

  const runStatus = (run?.status as PayrollRunStatus | undefined) ?? 'draft';
  if (runStatus !== 'draft') {
    return { error: `Only draft payroll runs can be reviewed for finalisation.` };
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
    .eq('entity_type', 'payroll_run')
    .eq('entity_id', runId)
    .maybeSingle();
  if (approvalError) return { error: approvalError.message };
  if (!approvalInstance) {
    return { error: 'This payroll run does not have an approval workflow.' };
  }

  const instance = rowToApprovalInstance(approvalInstance as Record<string, unknown>);
  if (instance.status !== 'pending') {
    return { error: `This payroll approval is already ${instance.status}.` };
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
  if (!currentStep) return { error: 'The current payroll approval step could not be resolved.' };

  const requesterId = instance.requesterId || String((run as Record<string, unknown> | null)?.created_by ?? '');
  if (requesterId && requesterId === reviewerId && !currentStep.allowSelfApproval) {
    return { error: 'You cannot approve or reject your own payroll run.' };
  }

  const isAssignedApprover = currentStep.approverType === 'role'
    ? Boolean(instance.currentApproverRole) && instance.currentApproverRole === reviewerRole
    : Boolean(instance.currentApproverUserId) && instance.currentApproverUserId === reviewerId;
  if (!isAssignedApprover) {
    return { error: 'You are not the assigned approver for the current payroll step.' };
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
    const { error: workflowError } = await supabase
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
      .eq('id', instance.id);
    if (workflowError) return { error: workflowError.message };
  } else if (nextStep) {
    const { error: workflowError } = await supabase
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
    if (workflowError) return { error: workflowError.message };
  } else {
    const [{ error: workflowError }, { error: runUpdateError }] = await Promise.all([
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
        .from('payroll_runs')
        .update({ status: 'finalised', updated_at: decidedAt })
        .eq('id', runId),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (runUpdateError) return { error: runUpdateError.message };
  }

  void logUserAction(reviewerId, 'update', 'payroll_run', runId, {
    approvalDecision: decision,
    approvalStep: currentStep.name,
    reviewerNote: note ?? null,
    finalDecision: decision === 'rejected' || !nextStep,
    nextApprovalStep: nextStep?.name ?? null,
  });
  return { error: null };
}

export async function resubmitPayrollRunFinalisation(
  runId: string,
  requesterId: string,
): Promise<{ error: string | null }> {
  const { data: run, error: runError } = await supabase
    .from('payroll_runs')
    .select('status, created_by')
    .eq('id', runId)
    .single();
  if (runError) return { error: runError.message };

  const runStatus = (run?.status as PayrollRunStatus | undefined) ?? 'draft';
  if (runStatus !== 'draft') {
    return { error: 'Only draft payroll runs can be resubmitted for finalisation.' };
  }

  const runOwnerId = String((run as Record<string, unknown> | null)?.created_by ?? '');
  if (!runOwnerId || runOwnerId !== requesterId) {
    return { error: 'Only the payroll owner can resubmit this finalisation request.' };
  }

  const { data: approvalInstance, error: approvalError } = await supabase
    .from('approval_instances')
    .select('id, flow_id, requester_id, status')
    .eq('entity_type', 'payroll_run')
    .eq('entity_id', runId)
    .maybeSingle();
  if (approvalError) return { error: approvalError.message };
  if (!approvalInstance) {
    return { error: 'This payroll run does not have an approval workflow.' };
  }

  const instance = rowToApprovalInstance(approvalInstance as Record<string, unknown>);
  if (instance.status !== 'rejected') {
    return { error: `Only rejected payroll approvals can be resubmitted.` };
  }

  const { data: stepRows, error: stepsError } = await supabase
    .from('approval_steps')
    .select('id, step_order, name, approver_type, approver_role, approver_user_id, allow_self_approval')
    .eq('flow_id', instance.flowId)
    .order('step_order');
  if (stepsError) return { error: stepsError.message };
  if (!stepRows?.length) return { error: 'The payroll approval flow has no steps configured.' };

  const firstStep = rowToApprovalStep(stepRows[0] as Record<string, unknown>);
  const routing = await resolveStepRouting(firstStep, requesterId);
  if (routing.error) return { error: routing.error };

  const resubmittedAt = new Date().toISOString();
  const { error: workflowError } = await supabase
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
    .eq('id', instance.id);
  if (workflowError) return { error: workflowError.message };

  void logUserAction(requesterId, 'update', 'payroll_run', runId, {
    approvalResubmitted: true,
    approvalFlowId: instance.flowId,
    approvalStep: firstStep.name,
  });
  return { error: null };
}

export async function listPayrollItems(runId: string): Promise<{ data: PayrollItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from('payroll_items')
    .select('*')
    .eq('payroll_run_id', runId);
  if (error) return { data: [], error: error.message };

  const identityMap = await resolveStoredEmployeeIdentities((data ?? []).map(row => String(row.employee_id ?? '')));
  if (identityMap.error) return { data: [], error: identityMap.error };

  const mapped: PayrollItem[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:              String(r.id),
    payrollRunId:    String(r.payroll_run_id),
    employeeId:      String(r.employee_id ?? ''),
    employeeName:    identityMap.data.get(String(r.employee_id ?? ''))?.name,
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

  mapped.sort((left, right) => {
    const leftKey = left.employeeName ?? left.employeeId;
    const rightKey = right.employeeName ?? right.employeeId;
    return leftKey.localeCompare(rightKey);
  });

  return { data: mapped, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPRAISALS
// ═══════════════════════════════════════════════════════════════════════════════

