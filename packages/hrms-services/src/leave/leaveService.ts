import type {
  LeaveType, LeaveBalance, LeaveRequest, CreateLeaveRequestInput,
  LeaveStatus, ApprovalDecision, LeaveDayPart,
} from '@flc/types';
import type { CreateLeaveRequestFormData } from '@flc/hrms-schemas';
import { supabase, untypedSupabase } from '../shared/supabaseClient';
import { resolveRequiredProfileId, resolveStoredEmployeeIdentities } from '../shared/identity';
import { bootstrapApprovalInstanceForEntity, submitApprovalDecision } from '../approval/approvalEngine';
import { rowToApprovalDecision } from '../approval/approvalTypes';
import type { ApprovalAuditAdapter } from '../approval/approvalTypes';

// ─── Attachment payload (passed in from wrappers that handle file upload) ──────

export type LeaveAttachmentPayload = {
  attachmentFileName?: string;
  attachmentFilePath?: string;
  attachmentFileSize?: number;
  attachmentMimeType?: string;
};

// ─── Private helpers ──────────────────────────────────────────────────────────

function parseIsoDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function formatIsoDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function eachDate(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = parseIsoDateOnly(startDate);
  const end = parseIsoDateOnly(endDate);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatIsoDateOnly(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

async function getHolidayDateSet(
  companyId: string,
  startDate: string,
  endDate: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    // public_holidays is in Database types; supabase client is sufficient here.
    .from('public_holidays')
    .select('date, is_recurring')
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);

  const targetYears = new Set(eachDate(startDate, endDate).map(d => d.slice(0, 4)));
  const holidays = new Set<string>();
  for (const holiday of data ?? []) {
    const date = String(holiday.date ?? '');
    if (!date) continue;
    if (holiday.is_recurring) {
      for (const year of targetYears) holidays.add(`${year}-${date.slice(5)}`);
    } else {
      holidays.add(date);
    }
  }
  return holidays;
}

async function calcLeaveDays(
  companyId: string,
  startDate: string,
  endDate: string,
  dayPart: LeaveDayPart = 'full_day',
): Promise<number> {
  const holidays = await getHolidayDateSet(companyId, startDate, endDate);
  if (dayPart !== 'full_day') {
    const day = parseIsoDateOnly(startDate).getDay();
    return day === 0 || day === 6 || holidays.has(startDate) ? 0 : 0.5;
  }
  const days = eachDate(startDate, endDate).filter(date => {
    const day = parseIsoDateOnly(date).getDay();
    return day !== 0 && day !== 6 && !holidays.has(date);
  }).length;
  return Math.max(0, days);
}

async function resolveHrmsRoleName(roleId: string): Promise<string | null> {
  // hrms_roles is not in generated Database types; using untypedSupabase.
  const { data } = await untypedSupabase
    .from('hrms_roles')
    .select('name')
    .eq('id', roleId)
    .maybeSingle();
  return data?.name ? String(data.name) : null;
}

async function resolveSpecificApproverName(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle();
  return data?.name ? String(data.name) : null;
}

async function resolveDirectManagerName(employeeId: string): Promise<string | null> {
  const { data: employee } = await supabase
    .from('employees')
    .select('manager_employee_id')
    .eq('id', employeeId)
    .maybeSingle();
  const mgrEmpId = employee?.manager_employee_id ? String(employee.manager_employee_id) : '';
  if (!mgrEmpId) return null;
  const { data: mgrProfile } = await supabase
    .from('profiles')
    .select('name')
    .eq('employee_id', mgrEmpId)
    .maybeSingle();
  if (mgrProfile?.name) return String(mgrProfile.name);
  const { data: mgrEmployee } = await supabase.from('employees').select('name').eq('id', mgrEmpId).maybeSingle();
  return mgrEmployee?.name ? String(mgrEmployee.name) : null;
}

function roleLabel(role?: string | null): string {
  return role
    ? role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Assigned approver';
}

async function approvalStepLabel(step: Record<string, unknown>, employeeId: string): Promise<string> {
  const stepName = String(step.name ?? 'Approval step');
  const approverType = String(step.approver_type ?? 'role');
  if (approverType === 'specific_user' && step.approver_user_id) {
    const name = await resolveSpecificApproverName(String(step.approver_user_id));
    return `${name ?? 'Specific approver'} (${stepName})`;
  }
  if (approverType === 'direct_manager') {
    const name = await resolveDirectManagerName(employeeId);
    return `${name ?? 'Direct Manager'} (${stepName})`;
  }
  const roleId = step.approver_role ? String(step.approver_role) : null;
  const roleName = roleId ? await resolveHrmsRoleName(roleId) : null;
  return `${roleName ?? roleLabel(roleId)} (${stepName})`;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type LeaveApprovalPreview = {
  nextStepLabel: string;
  fullFlow: string[];
};

export type LeaveEmployeeInfo = {
  branch: string;
  department: string;
  position: string;
};

export type LeaveHoliday = {
  date: string;
  isRecurring: boolean;
};

// ─── Service functions ────────────────────────────────────────────────────────

/** Lists active leave types for a company. Throws on database error. */
export async function listLeaveTypes(companyId: string): Promise<LeaveType[]> {
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('name');
  if (error) throw new Error(error.message);
  // TODO: Replace cast after Database generated types include requires_balance + min_advance_notice_days columns.
  return (data ?? []).map(r => (r as unknown as Record<string, unknown>)).map(r => ({
    id:                   String(r.id),
    companyId:            String(r.company_id),
    name:                 String(r.name),
    code:                 String(r.code),
    daysPerYear:          Number(r.days_per_year),
    defaultDays:          Number(r.default_days ?? r.days_per_year),
    carryForward:         Boolean(r.carry_forward ?? true),
    isPaid:               Boolean(r.is_paid),
    requiresBalance:      r.requires_balance != null ? Boolean(r.requires_balance) : true,
    minAdvanceNoticeDays: r.min_advance_notice_days != null ? Number(r.min_advance_notice_days) : null,
    active:               Boolean(r.active),
    createdAt:            String(r.created_at),
    updatedAt:            String(r.updated_at),
  }));
}

/** Lists leave balances for an employee for a given year. Throws on database error. */
export async function listLeaveBalances(
  employeeId: string,
  year: number,
): Promise<LeaveBalance[]> {
  const { data, error } = await supabase
    .from('leave_balances')
    .select('*, leave_types(name)')
    .eq('year', year)
    .eq('employee_id', employeeId);
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    id:            String(r.id),
    employeeId:    String(r.employee_id ?? ''),
    leaveTypeId:   String(r.leave_type_id),
    year:          Number(r.year),
    entitledDays:  Number(r.entitled_days),
    usedDays:      Number(r.used_days),
    remainingDays: Number(r.entitled_days) - Number(r.used_days),
  }));
}

/** Lists public holidays for a company. Throws on database error. */
export async function listLeaveHolidays(companyId: string): Promise<LeaveHoliday[]> {
  const { data, error } = await supabase
    .from('public_holidays')
    .select('date, is_recurring')
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => ({
    date: String(row.date),
    isRecurring: Boolean(row.is_recurring),
  }));
}

/** Resolves branch/department/position info for an employee. Throws on database error. */
export async function getLeaveEmployeeInfo(
  companyId: string,
  employeeId: string,
): Promise<LeaveEmployeeInfo> {
  const { data: employee, error } = await supabase
    .from('employees')
    .select('branch_id, department:departments!employees_department_id_fkey(name), job_title:job_titles!employees_job_title_id_fkey(name)')
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = employee as Record<string, unknown> | null;
  // TODO: Replace Record cast after employees + departments + job_titles join shape
  // is represented in Database types.
  const branchId = row?.branch_id ? String(row.branch_id) : '';
  let branch = branchId || 'Not assigned';

  if (branchId) {
    const { data: branchRow } = await supabase
      .from('branches')
      .select('name, code')
      .or(`id.eq.${branchId},code.eq.${branchId}`)
      .maybeSingle();
    if (branchRow) {
      const b = branchRow as Record<string, unknown>;
      branch = String(b.name ?? b.code ?? branchId);
    }
  }

  return {
    branch,
    department: row?.department
      ? String((row.department as Record<string, unknown>).name ?? 'Not assigned')
      : 'Not assigned',
    position: row?.job_title
      ? String((row.job_title as Record<string, unknown>).name ?? 'Not assigned')
      : 'Not assigned',
  };
}

/**
 * Resolves the approval flow preview for a leave request submission.
 * Returns null if no active flow is configured. Throws on error.
 */
export async function getLeaveApprovalPreview(
  companyId: string,
  employeeId: string,
): Promise<LeaveApprovalPreview | null> {
  const { data: flows, error: flowError } = await supabase
    .from('approval_flows')
    .select('id')
    .eq('company_id', companyId)
    .eq('entity_type', 'leave_request')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(2);
  if (flowError) throw new Error(flowError.message);
  if (!flows?.length) return null;
  if (flows.length > 1) throw new Error('Multiple active leave approval flows are configured.');

  const { data: steps, error: stepError } = await supabase
    .from('approval_steps')
    .select('id, step_order, name, approver_type, approver_role, approver_user_id')
    .eq('flow_id', String(flows[0].id))
    .order('step_order');
  if (stepError) throw new Error(stepError.message);
  if (!steps?.length) throw new Error('The active leave approval flow has no steps configured.');

  const fullFlow = await Promise.all(
    // TODO: Replace Record cast after approval_steps join shape is in Database types.
    (steps as Record<string, unknown>[]).map(step => approvalStepLabel(step, employeeId)),
  );
  return { nextStepLabel: fullFlow[0], fullFlow };
}

/**
 * Lists leave requests for a company with optional filters and approval history.
 * Throws on database error.
 */
export async function listLeaveRequests(
  companyId: string,
  opts?: {
    employeeId?: string;
    status?: LeaveStatus;
    includeApprovalHistory?: boolean;
    dateFrom?: string;
    dateTo?: string;
  },
): Promise<LeaveRequest[]> {
  let q = supabase
    .from('leave_requests')
    .select('*, employee:employees!leave_requests_employee_id_fkey(name), leave_types(name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts?.status)     q = q.eq('status', opts.status);
  if (opts?.dateFrom)   q = q.gte('end_date', opts.dateFrom);
  if (opts?.dateTo)     q = q.lte('start_date', opts.dateTo);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const identityMap = await resolveStoredEmployeeIdentities(
    (data ?? []).map(row => String(row.employee_id ?? '')),
  );

  const requestIds = (data ?? []).map(r => String(r.id));

  // Build approval meta map: entity_id -> approval instance row
  const approvalMeta = new Map<string, { id: string; entity_id: string | null; status: string | null;
    current_step_order: number | null; current_step_name: string | null;
    current_approver_role: string | null; current_approver_user_id: string | null }>();
  const approvalHistory = new Map<string, ApprovalDecision[]>();

  if (requestIds.length) {
    const { data: approvals, error: approvalError } = await supabase
      .from('approval_instances')
      .select('id, entity_id, status, current_step_order, current_step_name, current_approver_role, current_approver_user_id')
      .eq('entity_type', 'leave_request')
      .in('entity_id', requestIds);
    if (approvalError) throw new Error(approvalError.message);
    for (const a of approvals ?? []) {
      approvalMeta.set(String(a.entity_id), a);
    }

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

  // TODO: Replace Record cast after leave_requests + employees + leave_types join shape
  // is represented in Database types.
  return (data ?? []).map((r: Record<string, unknown>) => {
    const meta = approvalMeta.get(String(r.id));
    return {
      id:            String(r.id),
      companyId:     String(r.company_id),
      employeeId:    String(r.employee_id),
      employeeName:  (r.employee as Record<string, unknown> | null)?.name
        ? String((r.employee as Record<string, unknown>).name)
        : identityMap.get(String(r.employee_id))?.name,
      leaveTypeId:   String(r.leave_type_id),
      leaveTypeName: (r.leave_types as Record<string, unknown> | null)?.name
        ? String((r.leave_types as Record<string, unknown>).name)
        : undefined,
      startDate:     String(r.start_date),
      endDate:       String(r.end_date),
      days:          Number(r.days),
      dayPart:       (r.day_part as LeaveDayPart) ?? 'full_day',
      reason:        r.reason ? String(r.reason) : undefined,
      attachmentFileName: r.attachment_file_name ? String(r.attachment_file_name) : undefined,
      attachmentFilePath: r.attachment_file_path ? String(r.attachment_file_path) : undefined,
      attachmentFileSize: r.attachment_file_size != null ? Number(r.attachment_file_size) : undefined,
      attachmentMimeType: r.attachment_mime_type ? String(r.attachment_mime_type) : undefined,
      status:        (r.status as LeaveStatus) ?? 'pending',
      reviewedBy:    r.reviewed_by ? String(r.reviewed_by) : undefined,
      reviewedAt:    r.reviewed_at ? String(r.reviewed_at) : undefined,
      reviewerNote:  r.reviewer_note ? String(r.reviewer_note) : undefined,
      approvalInstanceId:       meta?.id ? String(meta.id) : undefined,
      approvalInstanceStatus:   meta?.status ? String(meta.status) as LeaveRequest['approvalInstanceStatus'] : undefined,
      currentApprovalStepOrder: meta?.current_step_order != null ? Number(meta.current_step_order) : undefined,
      currentApprovalStepName:  meta?.current_step_name ? String(meta.current_step_name) : undefined,
      currentApproverRole:      meta?.current_approver_role ? String(meta.current_approver_role) : undefined,
      currentApproverUserId:    meta?.current_approver_user_id ? String(meta.current_approver_user_id) : undefined,
      approvalHistory: meta?.id ? (approvalHistory.get(String(meta.id)) ?? []) : undefined,
      createdAt:     String(r.created_at),
      updatedAt:     String(r.updated_at),
    };
  });
}

/**
 * Returns the authenticated user's own leave requests, optionally filtered by date range.
 * Throws on database error.
 */
export async function getMyLeaveRequests(
  employeeId: string,
  companyId: string,
  dateRange?: { from: string; to: string },
): Promise<LeaveRequest[]> {
  let q = supabase
    .from('leave_requests')
    .select('*, leave_types(name)')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (dateRange?.from) q = q.gte('start_date', dateRange.from);
  if (dateRange?.to)   q = q.lte('end_date', dateRange.to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  // TODO: Replace Record cast after leave_requests + leave_types join shape is in Database types.
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:           String(r.id),
    companyId:    String(r.company_id),
    employeeId:   String(r.employee_id ?? ''),
    leaveTypeId:  String(r.leave_type_id),
    leaveTypeName: (r.leave_types as Record<string, unknown> | null)?.name
      ? String((r.leave_types as Record<string, unknown>).name)
      : undefined,
    startDate:    String(r.start_date),
    endDate:      String(r.end_date),
    days:         Number(r.days),
    dayPart:      (r.day_part as LeaveDayPart) ?? 'full_day',
    reason:       r.reason ? String(r.reason) : undefined,
    attachmentFileName: r.attachment_file_name ? String(r.attachment_file_name) : undefined,
    attachmentFilePath: r.attachment_file_path ? String(r.attachment_file_path) : undefined,
    attachmentFileSize: r.attachment_file_size != null ? Number(r.attachment_file_size) : undefined,
    attachmentMimeType: r.attachment_mime_type ? String(r.attachment_mime_type) : undefined,
    status:       (r.status as LeaveStatus) ?? 'pending',
    reviewedBy:   r.reviewed_by ? String(r.reviewed_by) : undefined,
    reviewedAt:   r.reviewed_at ? String(r.reviewed_at) : undefined,
    reviewerNote: r.reviewer_note ? String(r.reviewer_note) : undefined,
    createdAt:    String(r.created_at),
    updatedAt:    String(r.updated_at),
  }));
}

/**
 * Creates a leave request and bootstraps an approval instance if a flow is
 * configured. The attachment must be uploaded by the caller before this is
 * called. Returns the new leave request ID.
 * Throws on validation or database error.
 */
export async function createLeaveRequest(
  employeeId: string,
  companyId: string,
  payload: CreateLeaveRequestFormData & LeaveAttachmentPayload,
): Promise<string> {
  const requesterProfileId = await resolveRequiredProfileId(employeeId);
  const dayPart = payload.dayPart ?? 'full_day';
  const endDate = dayPart === 'full_day' ? payload.endDate : payload.startDate;
  const days = await calcLeaveDays(companyId, payload.startDate, endDate, dayPart);

  if (days <= 0) {
    throw new Error('The selected date range does not include any working leave days.');
  }

  // TODO: Replace untypedSupabase after leave_requests Insert type is verified (status enum).
  const { data, error } = await untypedSupabase.from('leave_requests').insert({
    company_id:    companyId,
    employee_id:   employeeId,
    leave_type_id: payload.leaveTypeId,
    start_date:    payload.startDate,
    end_date:      endDate,
    days,
    day_part:      dayPart,
    reason:        payload.reason ?? null,
    attachment_file_name: payload.attachmentFileName ?? null,
    attachment_file_path: payload.attachmentFilePath ?? null,
    attachment_file_size: payload.attachmentFileSize ?? null,
    attachment_mime_type: payload.attachmentMimeType ?? null,
    status:        'pending',
  }).select('id').single();
  if (error) throw new Error(error.message);

  const leaveRequestId = String((data as Record<string, unknown> | null)?.id ?? '');
  // TODO: Replace Record cast after untypedSupabase is replaced with typed client above.
  if (!leaveRequestId) throw new Error('Failed to create leave request. Missing identifier.');

  try {
    await bootstrapApprovalInstanceForEntity(companyId, 'leave_request', leaveRequestId, requesterProfileId);
  } catch (workflowError) {
    await supabase.from('leave_requests').delete().eq('id', leaveRequestId);
    throw workflowError;
  }

  return leaveRequestId;
}

/** Cancels a leave request and its approval instance. Throws on database error. */
export async function cancelLeaveRequest(requestId: string): Promise<void> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('leave_requests')
    .update({ status: 'cancelled', updated_at: updatedAt })
    .eq('id', requestId);
  if (error) throw new Error(error.message);

  const { error: workflowError } = await untypedSupabase
    // TODO: Replace untypedSupabase after approval_instances Update type accepts null columns.
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

// ─── HR leave-decision notification ──────────────────────────────────────────

/**
 * Sends an informational in-app notification to every user assigned an active
 * `hr`-category HRMS role in the company when a leave request reaches a final
 * decision (approved or rejected). Best-effort — callers should swallow errors.
 */
async function notifyHrUsersOfLeaveDecision(
  leaveRequestId: string,
  companyId: string,
  decision: 'approved' | 'rejected',
  requesterProfileId: string | null,
): Promise<void> {
  // 1. Fetch leave details for the notification message.
  const { data: leaveRow } = await supabase
    .from('leave_requests')
    .select('start_date, end_date, days, leave_types(name)')
    .eq('id', leaveRequestId)
    .maybeSingle();
  if (!leaveRow) return;

  // 2. Fetch requester's display name.
  let requesterName = 'An employee';
  if (requesterProfileId) {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', requesterProfileId)
      .maybeSingle();
    if (profileRow?.name) requesterName = String(profileRow.name);
  }

  // 3. Resolve all HR role IDs for this company.
  const { data: hrRoles } = await untypedSupabase
    .from('hrms_roles')
    .select('id')
    .eq('company_id', companyId)
    .eq('category', 'hr');
  const hrRoleIds = (hrRoles ?? []).map((r: Record<string, unknown>) => String(r.id));
  if (!hrRoleIds.length) return;

  // 4. Collect profile IDs of active HR assignees, excluding the requester.
  const now = new Date().toISOString();
  const { data: assignments } = await untypedSupabase
    .from('employee_hrms_role_assignments')
    .select('profile_id')
    .in('hrms_role_id', hrRoleIds)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  const hrProfileIds: string[] = Array.from(
    new Set<string>(
      (assignments ?? [])
        .map((a: Record<string, unknown>) => (a.profile_id ? String(a.profile_id) : null))
        .filter((id: string | null): id is string => Boolean(id) && id !== requesterProfileId),
    ),
  );
  if (!hrProfileIds.length) return;

  // 5. Build a concise notification message.
  const leaveTypeName =
    (leaveRow.leave_types as Record<string, unknown> | null)?.name
      ? String((leaveRow.leave_types as Record<string, unknown>).name)
      : 'Leave';
  const days = Number(leaveRow.days ?? 0);
  const dayLabel = days === 1 ? '1 day' : `${days} days`;
  const start = String(leaveRow.start_date ?? '');
  const end = String(leaveRow.end_date ?? '');
  const dateRange = start === end ? start : `${start} – ${end}`;
  const verb = decision === 'approved' ? 'approved' : 'rejected';
  const title = `Leave ${decision === 'approved' ? 'Approved' : 'Rejected'}`;
  const message = `${requesterName}'s ${dayLabel} ${leaveTypeName} (${dateRange}) has been ${verb}.`;

  // 6. Insert notifications for all HR users (best-effort — ignore insert errors).
  await supabase.from('notifications').insert(
    hrProfileIds.map((userId) => ({
      user_id: userId,
      title,
      message,
      type: decision === 'approved' ? ('info' as const) : ('warning' as const),
      read: false,
    })),
  );
}

// ─── Review ───────────────────────────────────────────────────────────────────

/**
 * Submits an approval decision for a leave request.
 *
 * Does NOT handle the legacy path (no approval instance → direct role check).
 * Callers that need the legacy path must check for an instance first and handle
 * the no-instance case before calling this function.
 *
 * Throws on any business rule violation or database error.
 *
 * @param auditAdapter        Optional adapter for emitting audit events.
 */
export async function reviewLeaveRequest(
  input: {
    requestId: string;
    reviewerId: string;
    decision: 'approved' | 'rejected';
    note?: string;
  },
  auditAdapter?: ApprovalAuditAdapter,
): Promise<void> {
  const { requestId, reviewerId, decision, note } = input;

  const { data: req, error: reqError } = await supabase
    .from('leave_requests')
    .select('employee_id, company_id')
    .eq('id', requestId)
    .single();
  if (reqError) throw new Error(reqError.message);

  const ownerId = String(req?.employee_id ?? '');
  const companyId = String(req?.company_id ?? '');
  const requesterId = await resolveRequiredProfileId(ownerId);

  await submitApprovalDecision(
    { entityType: 'leave_request', entityId: requestId, reviewerId, companyId, requesterId, decision, note },
    async (entityId, dec, rId, n, decidedAt) => {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: dec, reviewed_by: rId, reviewed_at: decidedAt, reviewer_note: n ?? null, updated_at: decidedAt })
        .eq('id', entityId);
      if (error) throw new Error(error.message);
      // Best-effort: notify HR users of the final decision without blocking the approval.
      void notifyHrUsersOfLeaveDecision(entityId, companyId, dec, requesterId).catch(() => undefined);
    },
    auditAdapter,
  );
}

// Re-export CreateLeaveRequestInput type so consumers of the package don't need
// to import it from @flc/types directly.
export type { CreateLeaveRequestInput };
