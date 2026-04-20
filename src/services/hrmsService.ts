import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import {
  Employee, EmployeeStatus, AppRole,
  LeaveType, LeaveBalance, LeaveRequest, CreateLeaveRequestInput, LeaveStatus,
  AttendanceRecord, UpsertAttendanceInput,
  PayrollRun, PayrollItem, PayrollRunStatus,
  Appraisal, AppraisalItem, AppraisalStatus, AppraisalCycle,
  Announcement, CreateAnnouncementInput,
} from '@/types';

const PROFILE_SELECT = 'id, email, name, role, company_id, branch_id, status, staff_code, ic_no, contact_no, join_date, resign_date, avatar_url, department_id, job_title_id, department:departments(name), job_title:job_titles(name)';

function rowToEmployee(row: Record<string, unknown>): Employee {
  return {
    id:             String(row.id ?? ''),
    email:          String(row.email ?? ''),
    name:           String(row.name ?? ''),
    role:           (row.role as AppRole) ?? 'analyst',
    companyId:      String(row.company_id ?? ''),
    branchId:       row.branch_id ? String(row.branch_id) : undefined,
    staffCode:      row.staff_code ? String(row.staff_code) : undefined,
    icNo:           row.ic_no ? String(row.ic_no) : undefined,
    contactNo:      row.contact_no ? String(row.contact_no) : undefined,
    joinDate:       row.join_date ? String(row.join_date) : undefined,
    resignDate:     row.resign_date ? String(row.resign_date) : undefined,
    status:         (row.status as EmployeeStatus) ?? 'active',
    avatarUrl:      row.avatar_url ? String(row.avatar_url) : undefined,
    departmentId:   row.department_id ? String(row.department_id) : undefined,
    departmentName: row.department ? String((row.department as Record<string, unknown>)?.name ?? '') : undefined,
    jobTitleId:     row.job_title_id ? String(row.job_title_id) : undefined,
    jobTitleName:   row.job_title ? String((row.job_title as Record<string, unknown>)?.name ?? '') : undefined,
  };
}

/** Fetch all employees (all roles) for a company, ordered by name. */
export async function listEmployees(companyId: string): Promise<{ data: Employee[]; error: string | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('company_id', companyId)
    .order('name');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(r => rowToEmployee(r as Record<string, unknown>)), error: null };
}

/** Look up a profile by exact name (case-insensitive) — used to resolve salesman_name → salesman_id during import. */
export async function findEmployeeByName(
  companyId: string,
  name: string,
): Promise<Employee | null> {
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('company_id', companyId)
    .ilike('name', name.trim())
    .limit(1)
    .single();
  return data ? rowToEmployee(data as Record<string, unknown>) : null;
}

export interface CreateEmployeeInput {
  id: string;       // must be pre-generated (crypto.randomUUID())
  email: string;
  name: string;
  role: AppRole;
  companyId: string;
  branchId?: string;
  staffCode?: string;
  icNo?: string;
  contactNo?: string;
  joinDate?: string;
}

export async function createEmployee(input: CreateEmployeeInput, actorId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles').insert({
    id:          input.id,
    email:       input.email,
    name:        input.name,
    role:        input.role,
    company_id:  input.companyId,
    branch_id:   input.branchId ?? null,
    access_scope: 'self',
    status:      'active',
    staff_code:  input.staffCode?.toUpperCase() ?? null,
    ic_no:       input.icNo ?? null,
    contact_no:  input.contactNo ?? null,
    join_date:   input.joinDate ?? null,
  });
  if (!error) {
    void logUserAction(actorId, 'create', 'employee', input.id,
      { name: input.name, role: input.role, staffCode: input.staffCode });
  }
  return { error: error?.message ?? null };
}

export interface UpdateEmployeeInput {
  name?: string;
  role?: AppRole;
  branchId?: string | null;
  staffCode?: string;
  icNo?: string;
  contactNo?: string;
  joinDate?: string;
  resignDate?: string | null;
  status?: EmployeeStatus;
  departmentId?: string | null;
  jobTitleId?: string | null;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput, actorId?: string): Promise<{ error: string | null }> {
  // Build the update payload, only including defined fields
  const payload: Record<string, unknown> = {};
  if (input.name         !== undefined) payload.name          = input.name;
  if (input.role         !== undefined) payload.role          = input.role;
  if (input.branchId     !== undefined) payload.branch_id     = input.branchId;
  if (input.staffCode    !== undefined) payload.staff_code    = input.staffCode?.toUpperCase();
  if (input.icNo         !== undefined) payload.ic_no         = input.icNo;
  if (input.contactNo    !== undefined) payload.contact_no    = input.contactNo;
  if (input.joinDate     !== undefined) payload.join_date     = input.joinDate;
  if (input.resignDate   !== undefined) payload.resign_date   = input.resignDate;
  if (input.status       !== undefined) payload.status        = input.status;
  if (input.departmentId !== undefined) payload.department_id = input.departmentId;
  if (input.jobTitleId   !== undefined) payload.job_title_id  = input.jobTitleId;

  const { error } = await supabase.from('profiles').update(payload).eq('id', id);
  if (!error && actorId) {
    void logUserAction(actorId, 'update', 'employee', id, { changes: payload });
  }
  return { error: error?.message ?? null };
}

/** Batch-resolve salesman names → profile IDs for a given company. */
export async function resolveNamesToIds(
  companyId: string,
  names: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(names.map(n => n.trim().toLowerCase()).filter(Boolean))];
  if (!unique.length) return new Map();

  const { data } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('company_id', companyId);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const key = String(row.name ?? '').trim().toLowerCase();
    map.set(key, String(row.id));
  }

  const result = new Map<string, string>();
  for (const original of names) {
    const id = map.get(original.trim().toLowerCase());
    if (id) result.set(original, id);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEAVE
// ═══════════════════════════════════════════════════════════════════════════════

export async function listLeaveTypes(companyId: string): Promise<{ data: LeaveType[]; error: string | null }> {
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('name');
  if (error) return { data: [], error: error.message };
  const mapped: LeaveType[] = (data ?? []).map(r => ({
    id:           String(r.id),
    companyId:    String(r.company_id),
    name:         String(r.name),
    code:         String(r.code),
    daysPerYear:  Number(r.days_per_year),
    isPaid:       Boolean(r.is_paid),
    active:       Boolean(r.active),
    createdAt:    String(r.created_at),
    updatedAt:    String(r.updated_at),
  }));
  return { data: mapped, error: null };
}

export async function listLeaveBalances(employeeId: string, year: number): Promise<{ data: LeaveBalance[]; error: string | null }> {
  const { data, error } = await supabase
    .from('leave_balances')
    .select('*, leave_types(name)')
    .eq('employee_id', employeeId)
    .eq('year', year);
  if (error) return { data: [], error: error.message };
  const mapped: LeaveBalance[] = (data ?? []).map(r => ({
    id:            String(r.id),
    employeeId:    String(r.employee_id),
    leaveTypeId:   String(r.leave_type_id),
    year:          Number(r.year),
    entitledDays:  Number(r.entitled_days),
    usedDays:      Number(r.used_days),
    remainingDays: Number(r.entitled_days) - Number(r.used_days),
  }));
  return { data: mapped, error: null };
}

export async function listLeaveRequests(
  companyId: string,
  opts?: { employeeId?: string; status?: LeaveStatus },
): Promise<{ data: LeaveRequest[]; error: string | null }> {
  let q = supabase
    .from('leave_requests')
    .select('*, profiles(name), leave_types(name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts?.status)     q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  const mapped: LeaveRequest[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:            String(r.id),
    companyId:     String(r.company_id),
    employeeId:    String(r.employee_id),
    employeeName:  (r.profiles as Record<string, unknown> | null)?.name ? String((r.profiles as Record<string, unknown>).name) : undefined,
    leaveTypeId:   String(r.leave_type_id),
    leaveTypeName: (r.leave_types as Record<string, unknown> | null)?.name ? String((r.leave_types as Record<string, unknown>).name) : undefined,
    startDate:     String(r.start_date),
    endDate:       String(r.end_date),
    days:          Number(r.days),
    reason:        r.reason ? String(r.reason) : undefined,
    status:        (r.status as LeaveStatus) ?? 'pending',
    reviewedBy:    r.reviewed_by ? String(r.reviewed_by) : undefined,
    reviewedAt:    r.reviewed_at ? String(r.reviewed_at) : undefined,
    reviewerNote:  r.reviewer_note ? String(r.reviewer_note) : undefined,
    createdAt:     String(r.created_at),
    updatedAt:     String(r.updated_at),
  }));
  return { data: mapped, error: null };
}

export async function createLeaveRequest(
  employeeId: string,
  companyId: string,
  input: CreateLeaveRequestInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('leave_requests').insert({
    company_id:     companyId,
    employee_id:    employeeId,
    leave_type_id:  input.leaveTypeId,
    start_date:     input.startDate,
    end_date:       input.endDate,
    days:           input.days,
    reason:         input.reason ?? null,
  });
  return { error: error?.message ?? null };
}

export async function reviewLeaveRequest(
  requestId: string,
  reviewerId: string,
  status: 'approved' | 'rejected',
  note?: string,
): Promise<{ error: string | null }> {
  // Self-approval guard: fetch the request to confirm reviewer !== employee
  const { data: req } = await supabase
    .from('leave_requests')
    .select('employee_id')
    .eq('id', requestId)
    .single();

  if (req?.employee_id === reviewerId) {
    return { error: 'You cannot approve or reject your own leave request.' };
  }

  const { error } = await supabase
    .from('leave_requests')
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), reviewer_note: note ?? null })
    .eq('id', requestId);
  if (!error) {
    void logUserAction(reviewerId, 'update', 'leave_request', requestId,
      { status, reviewerNote: note ?? null });
  }
  return { error: error?.message ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════

export async function listAttendanceRecords(
  companyId: string,
  opts?: { employeeId?: string; dateFrom?: string; dateTo?: string },
): Promise<{ data: AttendanceRecord[]; error: string | null }> {
  let q = supabase
    .from('attendance_records')
    .select('*, profiles(name)')
    .eq('company_id', companyId)
    .order('date', { ascending: false });
  if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts?.dateFrom)   q = q.gte('date', opts.dateFrom);
  if (opts?.dateTo)     q = q.lte('date', opts.dateTo);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  const mapped: AttendanceRecord[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:           String(r.id),
    companyId:    String(r.company_id),
    employeeId:   String(r.employee_id),
    employeeName: (r.profiles as Record<string, unknown> | null)?.name ? String((r.profiles as Record<string, unknown>).name) : undefined,
    date:         String(r.date),
    clockIn:      r.clock_in ? String(r.clock_in) : undefined,
    clockOut:     r.clock_out ? String(r.clock_out) : undefined,
    hoursWorked:  r.hours_worked != null ? Number(r.hours_worked) : undefined,
    status:       r.status as AttendanceRecord['status'],
    notes:        r.notes ? String(r.notes) : undefined,
    createdAt:    String(r.created_at),
    updatedAt:    String(r.updated_at),
  }));
  return { data: mapped, error: null };
}

export async function upsertAttendance(
  companyId: string,
  input: UpsertAttendanceInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('attendance_records').upsert({
    company_id:   companyId,
    employee_id:  input.employeeId,
    date:         input.date,
    clock_in:     input.clockIn ?? null,
    clock_out:    input.clockOut ?? null,
    hours_worked: input.hoursWorked ?? null,
    status:       input.status,
    notes:        input.notes ?? null,
  }, { onConflict: 'employee_id,date' });
  return { error: error?.message ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYROLL
// ═══════════════════════════════════════════════════════════════════════════════

export async function listPayrollRuns(companyId: string): Promise<{ data: PayrollRun[]; error: string | null }> {
  const { data, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('company_id', companyId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });
  if (error) return { data: [], error: error.message };
  const mapped: PayrollRun[] = (data ?? []).map(r => ({
    id:             String(r.id),
    companyId:      String(r.company_id),
    periodYear:     Number(r.period_year),
    periodMonth:    Number(r.period_month),
    status:         r.status as PayrollRunStatus,
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
  return {
    data: {
      id: String(data.id), companyId: String(data.company_id),
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
  const { data: current } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('id', runId)
    .single();

  const currentStatus = current?.status as PayrollRunStatus | undefined;
  if (currentStatus && !VALID_PAYROLL_TRANSITIONS[currentStatus]?.includes(status)) {
    return { error: `Cannot transition payroll from '${currentStatus}' to '${status}'.` };
  }

  const { error } = await supabase.from('payroll_runs').update({ status }).eq('id', runId);
  if (!error && actorId) {
    void logUserAction(actorId, 'update', 'payroll_run', runId,
      { status, previousStatus: currentStatus });
  }
  return { error: error?.message ?? null };
}

export async function listPayrollItems(runId: string): Promise<{ data: PayrollItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from('payroll_items')
    .select('*, profiles(name)')
    .eq('payroll_run_id', runId)
    .order('profiles(name)');
  if (error) return { data: [], error: error.message };
  const mapped: PayrollItem[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:              String(r.id),
    payrollRunId:    String(r.payroll_run_id),
    employeeId:      String(r.employee_id),
    employeeName:    (r.profiles as Record<string, unknown> | null)?.name ? String((r.profiles as Record<string, unknown>).name) : undefined,
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
  return { data: mapped, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPRAISALS
// ═══════════════════════════════════════════════════════════════════════════════

export async function listAppraisals(companyId: string): Promise<{ data: Appraisal[]; error: string | null }> {
  const { data, error } = await supabase
    .from('appraisals')
    .select('*')
    .eq('company_id', companyId)
    .order('period_start', { ascending: false });
  if (error) return { data: [], error: error.message };
  const mapped: Appraisal[] = (data ?? []).map(r => ({
    id:          String(r.id),
    companyId:   String(r.company_id),
    title:       String(r.title),
    cycle:       r.cycle as AppraisalCycle,
    periodStart: String(r.period_start),
    periodEnd:   String(r.period_end),
    status:      r.status as AppraisalStatus,
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
  const { error } = await supabase.from('appraisals').insert({
    company_id:   companyId,
    title:        input.title,
    cycle:        input.cycle,
    period_start: input.periodStart,
    period_end:   input.periodEnd,
    created_by:   createdBy,
  });
  return { error: error?.message ?? null };
}

export async function listAppraisalItems(appraisalId: string): Promise<{ data: AppraisalItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from('appraisal_items')
    .select('*, profiles!employee_id(name), reviewer:profiles!reviewer_id(name)')
    .eq('appraisal_id', appraisalId);
  if (error) return { data: [], error: error.message };
  const mapped: AppraisalItem[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:               String(r.id),
    appraisalId:      String(r.appraisal_id),
    employeeId:       String(r.employee_id),
    employeeName:     (r.profiles as Record<string, unknown> | null)?.name ? String((r.profiles as Record<string, unknown>).name) : undefined,
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

// ═══════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

export async function listAnnouncements(
  companyId: string,
  opts?: { limit?: number },
): Promise<{ data: Announcement[]; error: string | null }> {
  let q = supabase
    .from('announcements')
    .select('*, profiles(name)')
    .eq('company_id', companyId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  const mapped: Announcement[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:          String(r.id),
    companyId:   String(r.company_id),
    title:       String(r.title),
    body:        String(r.body),
    category:    r.category as Announcement['category'],
    priority:    r.priority as Announcement['priority'],
    pinned:      Boolean(r.pinned),
    publishedAt: r.published_at ? String(r.published_at) : undefined,
    expiresAt:   r.expires_at ? String(r.expires_at) : undefined,
    authorId:    r.author_id ? String(r.author_id) : undefined,
    authorName:  (r.profiles as Record<string, unknown> | null)?.name ? String((r.profiles as Record<string, unknown>).name) : undefined,
    createdAt:   String(r.created_at),
    updatedAt:   String(r.updated_at),
  }));
  return { data: mapped, error: null };
}

export async function createAnnouncement(
  companyId: string,
  authorId: string,
  input: CreateAnnouncementInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('announcements').insert({
    company_id:   companyId,
    author_id:    authorId,
    title:        input.title,
    body:         input.body,
    category:     input.category,
    priority:     input.priority,
    pinned:       input.pinned ?? false,
    published_at: input.publishedAt ?? new Date().toISOString(),
    expires_at:   input.expiresAt ?? null,
  });
  if (!error) {
    void logUserAction(authorId, 'create', 'announcement', undefined,
      { title: input.title, category: input.category, priority: input.priority });
  }
  return { error: error?.message ?? null };
}

export async function deleteAnnouncement(id: string, actorId?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (!error && actorId) {
    void logUserAction(actorId, 'delete', 'announcement', id);
  }
  return { error: error?.message ?? null };
}
