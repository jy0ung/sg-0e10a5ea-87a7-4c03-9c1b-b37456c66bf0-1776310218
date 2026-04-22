/**
 * @flc/hrms-services
 *
 * Shared HRMS self-service (employee-facing) data-access layer.
 * Consumed by both the web app and the HRMS mobile app so both clients
 * hit the database through a single, typed, auditable surface.
 *
 * No React hooks, no audit logging dependency — thin, testable wrappers.
 */
import { supabase } from '@flc/supabase';
import type { LeaveRequest, AttendanceRecord, LeaveType } from '@flc/types';
import type { CreateLeaveRequestFormData } from '@flc/hrms-schemas';

const untypedSupabase = supabase as any;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Calendar days between two ISO dates (inclusive). */
function calcDays(startDate: string, endDate: string): number {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

async function resolveRequiredProfileId(employeeId: string): Promise<string> {
  if (!employeeId) return employeeId;

  const { data: directProfile, error: directError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', employeeId)
    .maybeSingle();
  if (directError) throw new Error(directError.message);
  if (directProfile?.id) return String(directProfile.id);

  const { data: linkedProfile, error: linkedError } = await supabase
    .from('profiles')
    .select('id')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (linkedError) throw new Error(linkedError.message);
  if (!linkedProfile?.id) throw new Error(`No profile linked to employee '${employeeId}'.`);

  return String(linkedProfile.id);
}

async function resolveDirectManagerApproverUserId(requesterId: string): Promise<string> {
  const requesterProfileId = await resolveRequiredProfileId(requesterId);

  const requesterProfileResult = await supabase
    .from('profiles')
    .select('employee_id')
    .eq('id', requesterProfileId)
    .maybeSingle();

  if (requesterProfileResult.error) {
    throw new Error(requesterProfileResult.error.message);
  }

  const requesterProfile = requesterProfileResult.data as unknown as Record<string, unknown> | null;
  const requesterEmployeeId = requesterProfile?.employee_id ? String(requesterProfile.employee_id) : null;

  if (!requesterEmployeeId) {
    throw new Error('The requester must be linked to a workforce employee for direct-manager approval routing.');
  }

  const { data: requesterEmployee, error: requesterEmployeeError } = await supabase
    .from('employees')
    .select('manager_employee_id')
    .eq('id', requesterEmployeeId)
    .maybeSingle();
  if (requesterEmployeeError) {
    throw new Error(requesterEmployeeError.message);
  }

  const managerEmployeeId = (requesterEmployee as Record<string, unknown> | null)?.manager_employee_id;
  if (!managerEmployeeId) {
    throw new Error('The requester does not have a reporting manager assigned for the active approval flow.');
  }

  const managerEmployeeIdText = String(managerEmployeeId);
  const { data: managerProfile, error: managerProfileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('employee_id', managerEmployeeIdText)
    .maybeSingle();
  if (managerProfileError) throw new Error(managerProfileError.message);
  if (!managerProfile?.id) {
    throw new Error('The requester reporting manager does not have a linked user profile.');
  }

  return String(managerProfile.id);
}

type ApprovalBootstrapStep = {
  id: string;
  stepOrder: number;
  name: string;
  approverType: 'role' | 'specific_user' | 'direct_manager';
  approverRole?: string;
  approverUserId?: string;
};

function rowToApprovalBootstrapStep(row: Record<string, unknown>): ApprovalBootstrapStep {
  return {
    id: String(row.id ?? ''),
    stepOrder: Number(row.step_order ?? 0),
    name: String(row.name ?? ''),
    approverType: (row.approver_type as ApprovalBootstrapStep['approverType']) ?? 'role',
    approverRole: row.approver_role ? String(row.approver_role) : undefined,
    approverUserId: row.approver_user_id ? String(row.approver_user_id) : undefined,
  };
}

async function resolveStepRouting(
  step: ApprovalBootstrapStep,
  requesterId: string,
): Promise<{ approverRole: string | null; approverUserId: string | null }> {
  if (step.approverType === 'role') {
    if (!step.approverRole) throw new Error(`Approval step '${step.name}' is missing an approver role.`);
    return { approverRole: step.approverRole, approverUserId: null };
  }

  if (step.approverType === 'specific_user') {
    if (!step.approverUserId) throw new Error(`Approval step '${step.name}' is missing a specific approver.`);
    return { approverRole: null, approverUserId: step.approverUserId };
  }

  return { approverRole: null, approverUserId: await resolveDirectManagerApproverUserId(requesterId) };
}

async function bootstrapLeaveApprovalInstance(
  companyId: string,
  leaveRequestId: string,
  requesterId: string,
): Promise<void> {
  const { data: flows, error: flowError } = await untypedSupabase
    .from('approval_flows')
    .select('id')
    .eq('company_id', companyId)
    .eq('entity_type', 'leave_request')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(2);
  if (flowError) throw new Error(flowError.message);
  if (!flows?.length) return;
  if (flows.length > 1) {
    throw new Error('Multiple active leave approval flows found. Deactivate extras before accepting new requests.');
  }

  const flowId = String(flows[0].id);
  const { data: steps, error: stepError } = await untypedSupabase
    .from('approval_steps')
    .select('id, step_order, name, approver_type, approver_role, approver_user_id')
    .eq('flow_id', flowId)
    .order('step_order');
  if (stepError) throw new Error(stepError.message);
  if (!steps?.length) throw new Error('The active leave approval flow has no steps configured.');

  const firstStep = rowToApprovalBootstrapStep(steps[0] as unknown as Record<string, unknown>);
  const routing = await resolveStepRouting(firstStep, requesterId);

  const { error: instanceError } = await untypedSupabase.from('approval_instances').insert({
    company_id: companyId,
    flow_id: flowId,
    entity_type: 'leave_request',
    entity_id: leaveRequestId,
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

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function updateContactNo(profileId: string, contactNo: string): Promise<void> {
  const resolvedProfileId = await resolveRequiredProfileId(profileId);

  const { error } = await supabase
    .from('profiles')
    .update({ contact_no: contactNo })
    .eq('id', resolvedProfileId);
  if (error) throw new Error(error.message);
}

// ─── Leave Types ──────────────────────────────────────────────────────────────

export async function getLeaveTypes(companyId: string): Promise<LeaveType[]> {
  const { data, error } = await supabase
    .from('leave_types')
    .select('id, name, code, company_id, days_per_year, is_paid, active, created_at, updated_at')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    id:          r.id,
    companyId:   r.company_id,
    name:        r.name,
    code:        r.code,
    daysPerYear: r.days_per_year,
    isPaid:      r.is_paid,
    active:      r.active,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  }));
}

// ─── Leave Requests (self-service) ───────────────────────────────────────────

export async function getMyLeaveRequests(
  employeeId: string,
  companyId: string,
): Promise<LeaveRequest[]> {
  let query = supabase
    .from('leave_requests')
    .select('*, leave_types(name)')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:            String(r.id),
    companyId:     String(r.company_id),
    employeeId:    String(r.employee_id),
    leaveTypeId:   String(r.leave_type_id),
    leaveTypeName: (r.leave_types as Record<string, unknown> | null)?.name
                     ? String((r.leave_types as Record<string, unknown>).name) : undefined,
    startDate:     String(r.start_date),
    endDate:       String(r.end_date),
    days:          Number(r.days),
    reason:        r.reason ? String(r.reason) : undefined,
    status:        r.status as LeaveRequest['status'],
    reviewedBy:    r.reviewed_by ? String(r.reviewed_by) : undefined,
    reviewedAt:    r.reviewed_at ? String(r.reviewed_at) : undefined,
    reviewerNote:  r.reviewer_note ? String(r.reviewer_note) : undefined,
    createdAt:     String(r.created_at),
    updatedAt:     String(r.updated_at),
  }));
}

export async function createLeaveRequest(
  employeeId: string,
  companyId: string,
  payload: CreateLeaveRequestFormData,
): Promise<string> {
  const requesterProfileId = await resolveRequiredProfileId(employeeId);

  const { data, error } = await supabase.from('leave_requests').insert({
    company_id:    companyId,
    employee_id:   employeeId,
    leave_type_id: payload.leaveTypeId,
    start_date:    payload.startDate,
    end_date:      payload.endDate,
    days:          calcDays(payload.startDate, payload.endDate),
    reason:        payload.reason ?? null,
    status:        'pending',
  }).select('id').single();
  if (error) throw new Error(error.message);

  const leaveRequestId = String((data as Record<string, unknown> | null)?.id ?? '');
  if (!leaveRequestId) throw new Error('Failed to create leave request. Missing identifier.');

  try {
    await bootstrapLeaveApprovalInstance(companyId, leaveRequestId, requesterProfileId);
  } catch (workflowError) {
    await supabase.from('leave_requests').delete().eq('id', leaveRequestId);
    throw workflowError;
  }

  return leaveRequestId;
}

export async function cancelLeaveRequest(requestId: string): Promise<void> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('leave_requests')
    .update({ status: 'cancelled', updated_at: updatedAt })
    .eq('id', requestId);
  if (error) throw new Error(error.message);

  const { error: workflowError } = await untypedSupabase
    .from('approval_instances')
    .update({
      status: 'cancelled',
      current_step_id: null,
      current_step_order: null,
      current_step_name: null,
      current_approver_role: null,
      current_approver_user_id: null,
      updated_at: updatedAt,
    })
    .eq('entity_type', 'leave_request')
    .eq('entity_id', requestId);
  if (workflowError) throw new Error(workflowError.message);
}

// ─── Attendance (self-service) ───────────────────────────────────────────────

export async function getMyAttendance(
  employeeId: string,
  companyId: string,
  dateRange: { from: string; to: string },
): Promise<AttendanceRecord[]> {
  let query = supabase
    .from('attendance_records')
    .select('*')
    .eq('company_id', companyId)
    .gte('date', dateRange.from)
    .lte('date', dateRange.to)
    .eq('employee_id', employeeId)
    .order('date', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    id:          r.id,
    companyId:   r.company_id,
    employeeId:  r.employee_id,
    date:        r.date,
    clockIn:     r.clock_in  ?? undefined,
    clockOut:    r.clock_out ?? undefined,
    hoursWorked: r.hours_worked ?? undefined,
    status:      r.status as AttendanceRecord['status'],
    notes:       r.notes ?? undefined,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  }));
}

export async function clockIn(
  employeeId: string,
  companyId: string,
  date: string,
): Promise<void> {
  const { error } = await supabase.from('attendance_records').upsert({
    company_id:  companyId,
    employee_id: employeeId,
    date,
    clock_in:    new Date().toISOString(),
    status:      'present',
  }, { onConflict: 'employee_id,date' });
  if (error) throw new Error(error.message);
}

export async function clockOut(
  employeeId: string,
  companyId: string,
  date: string,
): Promise<void> {
  const checkOut = new Date().toISOString();
  const { data: existing } = await supabase
    .from('attendance_records')
    .select('clock_in')
    .eq('company_id', companyId)
    .eq('date', date)
    .eq('employee_id', employeeId)
    .maybeSingle();
  const hoursWorked = existing?.clock_in
    ? Math.round(
        (new Date(checkOut).getTime() - new Date(existing.clock_in).getTime()) / 3_600_000 * 100
      ) / 100
    : undefined;

  const { error } = await supabase.from('attendance_records').upsert({
    company_id:   companyId,
    employee_id:  employeeId,
    date,
    clock_out:    checkOut,
    hours_worked: hoursWorked ?? null,
    status:       'present',
  }, { onConflict: 'employee_id,date' });
  if (error) throw new Error(error.message);
}

// ─── Payroll (self-service) ──────────────────────────────────────────────────

export interface PayslipSummary {
  id:          string;
  periodYear:  number;
  periodMonth: number;
  grossPay:    number;
  netPay:      number;
  status:      string;
}

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
