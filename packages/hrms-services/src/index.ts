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
import type { Announcement, AppraisalCycle, AppraisalItem, AppraisalStatus, LeaveRequest, AttendanceRecord, LeaveType } from '@flc/types';
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

export interface SelfServiceAppraisalItem extends AppraisalItem {
  appraisalTitle: string;
  appraisalCycle: AppraisalCycle;
  periodStart: string;
  periodEnd: string;
  appraisalStatus: AppraisalStatus;
}

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

async function getSelfServiceAppraisalItem(itemId: string): Promise<SelfServiceAppraisalItem> {
  const { data, error } = await supabase
    .from('appraisal_items')
    .select('*, reviewer:profiles!reviewer_id(name), appraisal:appraisals!appraisal_id(title, cycle, period_start, period_end, status)')
    .eq('id', itemId)
    .single();

  if (error) throw new Error(error.message);
  return rowToSelfServiceAppraisalItem(data as Record<string, unknown>);
}

async function syncAppraisalCompletionStatus(appraisalId: string): Promise<void> {
  const { data, error } = await supabase
    .from('appraisal_items')
    .select('status')
    .eq('appraisal_id', appraisalId);
  if (error) throw new Error(error.message);

  if (!data?.length || data.some(item => String(item.status ?? 'pending') !== 'acknowledged')) return;

  const { error: updateError } = await supabase
    .from('appraisals')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', appraisalId);
  if (updateError) throw new Error(updateError.message);
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

// ─── Announcements ───────────────────────────────────────────────────────────

export async function listAnnouncements(
  companyId: string,
  opts?: { limit?: number },
): Promise<Announcement[]> {
  let query = supabase
    .from('announcements')
    .select('*, profiles(name)')
    .eq('company_id', companyId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id:          String(row.id),
    companyId:   String(row.company_id),
    title:       String(row.title),
    body:        String(row.body),
    category:    row.category as Announcement['category'],
    priority:    row.priority as Announcement['priority'],
    pinned:      Boolean(row.pinned),
    publishedAt: row.published_at ? String(row.published_at) : undefined,
    expiresAt:   row.expires_at ? String(row.expires_at) : undefined,
    authorId:    row.author_id ? String(row.author_id) : undefined,
    authorName:  (row.profiles as Record<string, unknown> | null)?.name
      ? String((row.profiles as Record<string, unknown>).name)
      : undefined,
    createdAt:   String(row.created_at),
    updatedAt:   String(row.updated_at),
  }));
}

// ─── Appraisals (self-service) ───────────────────────────────────────────────

export async function getMyAppraisalItems(
  employeeId: string,
  companyId: string,
): Promise<SelfServiceAppraisalItem[]> {
  const { data, error } = await supabase
    .from('appraisal_items')
    .select('*, reviewer:profiles!reviewer_id(name), appraisal:appraisals!appraisal_id(title, cycle, period_start, period_end, status, company_id)')
    .eq('employee_id', employeeId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter(row => {
      const appraisal = (row as Record<string, unknown>).appraisal as Record<string, unknown> | undefined;
      return String(appraisal?.company_id ?? companyId) === companyId;
    })
    .map(row => rowToSelfServiceAppraisalItem(row as Record<string, unknown>));
}

export async function submitAppraisalSelfReview(
  itemId: string,
  employeeId: string,
  input: Pick<AppraisalItem, 'goals' | 'achievements' | 'areasToImprove' | 'employeeComments'>,
): Promise<void> {
  await resolveRequiredProfileId(employeeId);

  const item = await getSelfServiceAppraisalItem(itemId);
  if (item.appraisalStatus !== 'open') throw new Error('Self review is only available for active appraisal cycles.');
  if (item.employeeId !== employeeId) throw new Error('You can only submit your own appraisal self review.');
  if (!['pending', 'self_reviewed'].includes(item.status)) {
    throw new Error('This appraisal item is no longer open for self review.');
  }

  const { error } = await supabase
    .from('appraisal_items')
    .update({
      goals: input.goals ?? null,
      achievements: input.achievements ?? null,
      areas_to_improve: input.areasToImprove ?? null,
      employee_comments: input.employeeComments ?? null,
      status: 'self_reviewed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);
  if (error) throw new Error(error.message);
}

export async function acknowledgeAppraisalItem(
  itemId: string,
  employeeId: string,
  employeeComments?: string,
): Promise<void> {
  await resolveRequiredProfileId(employeeId);

  const item = await getSelfServiceAppraisalItem(itemId);
  if (!['open', 'completed'].includes(item.appraisalStatus)) {
    throw new Error('Acknowledgement is only available for active appraisal cycles.');
  }
  if (item.employeeId !== employeeId) throw new Error('You can only acknowledge your own appraisal review.');
  if (!['reviewed', 'acknowledged'].includes(item.status)) {
    throw new Error('Manager review must be completed before acknowledgement.');
  }

  const { error } = await supabase
    .from('appraisal_items')
    .update({
      employee_comments: employeeComments ?? item.employeeComments ?? null,
      status: 'acknowledged',
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);
  if (error) throw new Error(error.message);

  await syncAppraisalCompletionStatus(item.appraisalId);
}

// ─── Leave Requests (self-service) ───────────────────────────────────────────

export async function getMyLeaveRequests(
  employeeId: string,
  companyId: string,
): Promise<LeaveRequest[]> {
  const query = supabase
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
  const query = supabase
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
