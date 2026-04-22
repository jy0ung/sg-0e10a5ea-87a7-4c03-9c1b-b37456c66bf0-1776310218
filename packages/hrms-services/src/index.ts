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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Calendar days between two ISO dates (inclusive). */
function calcDays(startDate: string, endDate: string): number {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

function isMissingWorkforceSchemaError(message: string | null | undefined): boolean {
  const text = (message ?? '').toLowerCase();
  return [
    'relation "employees" does not exist',
    'column profiles.employee_id does not exist',
    'could not find the table',
    'could not find a relationship',
  ].some(fragment => text.includes(fragment));
}

function isLegacyEmployeeOwnershipWriteError(message: string | null | undefined): boolean {
  const text = (message ?? '').toLowerCase();
  return [
    'violates foreign key constraint',
    'violates row-level security policy',
    'new row violates row-level security policy',
  ].some(fragment => text.includes(fragment));
}

async function resolveLegacyProfileEmployeeId(employeeId: string): Promise<string> {
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
  if (linkedError) {
    if (isMissingWorkforceSchemaError(linkedError.message)) return employeeId;
    throw new Error(linkedError.message);
  }

  return linkedProfile?.id ? String(linkedProfile.id) : employeeId;
}

async function resolveEmployeeOwnershipCandidateIds(employeeId: string): Promise<string[]> {
  const profileId = await resolveLegacyProfileEmployeeId(employeeId);
  return [...new Set([employeeId, profileId].filter(Boolean))];
}

async function resolveDirectManagerApproverUserId(requesterId: string): Promise<string> {
  const requesterProfileId = await resolveLegacyProfileEmployeeId(requesterId);

  const requesterProfileResult = await supabase
    .from('profiles')
    .select('manager_id, employee_id')
    .eq('id', requesterProfileId)
    .maybeSingle();

  if (requesterProfileResult.error) {
    if (!isMissingWorkforceSchemaError(requesterProfileResult.error.message)) {
      throw new Error(requesterProfileResult.error.message);
    }

    const { data: legacyRequesterProfile, error: legacyRequesterProfileError } = await supabase
      .from('profiles')
      .select('manager_id')
      .eq('id', requesterProfileId)
      .maybeSingle();
    if (legacyRequesterProfileError) throw new Error(legacyRequesterProfileError.message);

    const legacyManagerId = (legacyRequesterProfile as Record<string, unknown> | null)?.manager_id;
    if (!legacyManagerId) {
      throw new Error('The requester does not have a reporting manager assigned for the active approval flow.');
    }

    return String(legacyManagerId);
  }

  const requesterProfile = requesterProfileResult.data as Record<string, unknown> | null;
  const legacyManagerId = requesterProfile?.manager_id ? String(requesterProfile.manager_id) : null;
  const requesterEmployeeId = requesterProfile?.employee_id ? String(requesterProfile.employee_id) : null;

  if (requesterEmployeeId) {
    const { data: requesterEmployee, error: requesterEmployeeError } = await supabase
      .from('employees')
      .select('manager_employee_id')
      .eq('id', requesterEmployeeId)
      .maybeSingle();

    if (requesterEmployeeError) {
      if (!isMissingWorkforceSchemaError(requesterEmployeeError.message)) {
        throw new Error(requesterEmployeeError.message);
      }
    } else {
      const managerEmployeeId = (requesterEmployee as Record<string, unknown> | null)?.manager_employee_id;
      if (managerEmployeeId) {
        const managerEmployeeIdText = String(managerEmployeeId);

        const { data: managerProfile, error: managerProfileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('employee_id', managerEmployeeIdText)
          .maybeSingle();
        if (managerProfileError) {
          if (!isMissingWorkforceSchemaError(managerProfileError.message)) {
            throw new Error(managerProfileError.message);
          }
        } else if (managerProfile?.id) {
          return String(managerProfile.id);
        }

        const { data: directManagerProfile, error: directManagerProfileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', managerEmployeeIdText)
          .maybeSingle();
        if (directManagerProfileError) throw new Error(directManagerProfileError.message);
        if (directManagerProfile?.id) {
          return String(directManagerProfile.id);
        }
      }
    }
  }

  if (!legacyManagerId) {
    throw new Error('The requester does not have a reporting manager assigned for the active approval flow.');
  }

  return legacyManagerId;
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
  const { data: flows, error: flowError } = await supabase
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
  const { data: steps, error: stepError } = await supabase
    .from('approval_steps')
    .select('id, step_order, name, approver_type, approver_role, approver_user_id')
    .eq('flow_id', flowId)
    .order('step_order');
  if (stepError) throw new Error(stepError.message);
  if (!steps?.length) throw new Error('The active leave approval flow has no steps configured.');

  const firstStep = rowToApprovalBootstrapStep(steps[0] as Record<string, unknown>);
  const routing = await resolveStepRouting(firstStep, requesterId);

  const { error: instanceError } = await supabase.from('approval_instances').insert({
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
  const resolvedProfileId = await resolveLegacyProfileEmployeeId(profileId);

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
  const employeeOwnerIds = await resolveEmployeeOwnershipCandidateIds(employeeId);

  let query = supabase
    .from('leave_requests')
    .select('*, leave_types(name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  query = employeeOwnerIds.length > 1
    ? query.in('employee_id', employeeOwnerIds)
    : query.eq('employee_id', employeeOwnerIds[0]);

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
  const requesterProfileId = await resolveLegacyProfileEmployeeId(employeeId);

  const insertLeaveRequest = async (storedEmployeeId: string): Promise<string> => {
    const { data, error } = await supabase.from('leave_requests').insert({
      company_id:    companyId,
      employee_id:   storedEmployeeId,
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
    return leaveRequestId;
  };

  let leaveRequestId: string;
  try {
    leaveRequestId = await insertLeaveRequest(employeeId);
  } catch (error) {
    if (!(error instanceof Error) || requesterProfileId === employeeId || !isLegacyEmployeeOwnershipWriteError(error.message)) {
      throw error;
    }
    leaveRequestId = await insertLeaveRequest(requesterProfileId);
  }

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

  const { error: workflowError } = await supabase
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
  const employeeOwnerIds = await resolveEmployeeOwnershipCandidateIds(employeeId);

  let query = supabase
    .from('attendance_records')
    .select('*')
    .eq('company_id', companyId)
    .gte('date', dateRange.from)
    .lte('date', dateRange.to)
    .order('date', { ascending: false });
  query = employeeOwnerIds.length > 1
    ? query.in('employee_id', employeeOwnerIds)
    : query.eq('employee_id', employeeOwnerIds[0]);

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
  const requesterProfileId = await resolveLegacyProfileEmployeeId(employeeId);

  const clockInForOwner = async (storedEmployeeId: string) => {
    const { error } = await supabase.from('attendance_records').upsert({
      company_id:  companyId,
      employee_id: storedEmployeeId,
      date,
      clock_in:    new Date().toISOString(),
      status:      'present',
    }, { onConflict: 'employee_id,date' });
    if (error) throw new Error(error.message);
  };

  try {
    await clockInForOwner(employeeId);
  } catch (error) {
    if (!(error instanceof Error) || requesterProfileId === employeeId || !isLegacyEmployeeOwnershipWriteError(error.message)) {
      throw error;
    }
    await clockInForOwner(requesterProfileId);
  }
}

export async function clockOut(
  employeeId: string,
  companyId: string,
  date: string,
): Promise<void> {
  const requesterProfileId = await resolveLegacyProfileEmployeeId(employeeId);
  const readOwnerIds = [...new Set([employeeId, requesterProfileId].filter(Boolean))];
  const checkOut = new Date().toISOString();
  let query = supabase
    .from('attendance_records')
    .select('clock_in')
    .eq('company_id', companyId)
    .eq('date', date)
    .maybeSingle();
  query = readOwnerIds.length > 1
    ? query.in('employee_id', readOwnerIds)
    : query.eq('employee_id', readOwnerIds[0]);

  const { data: existing } = await query;
  const hoursWorked = existing?.clock_in
    ? Math.round(
        (new Date(checkOut).getTime() - new Date(existing.clock_in).getTime()) / 3_600_000 * 100
      ) / 100
    : undefined;

  const clockOutForOwner = async (storedEmployeeId: string) => {
    const { error } = await supabase.from('attendance_records').upsert({
      company_id:   companyId,
      employee_id:  storedEmployeeId,
      date,
      clock_out:    checkOut,
      hours_worked: hoursWorked ?? null,
      status:       'present',
    }, { onConflict: 'employee_id,date' });
    if (error) throw new Error(error.message);
  };

  try {
    await clockOutForOwner(employeeId);
  } catch (error) {
    if (!(error instanceof Error) || requesterProfileId === employeeId || !isLegacyEmployeeOwnershipWriteError(error.message)) {
      throw error;
    }
    await clockOutForOwner(requesterProfileId);
  }
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
  const employeeOwnerIds = await resolveEmployeeOwnershipCandidateIds(employeeId);

  let query = supabase
    .from('payroll_items')
    .select('id, gross_pay, net_pay, payroll_runs!inner(period_year, period_month, status, company_id)')
    .eq('payroll_runs.company_id', companyId)
    .order('payroll_runs(period_year)', { ascending: false })
    .order('payroll_runs(period_month)', { ascending: false });
  query = employeeOwnerIds.length > 1
    ? query.in('employee_id', employeeOwnerIds)
    : query.eq('employee_id', employeeOwnerIds[0]);

  const { data, error } = await query;
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
