import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import { createLeaveRequest as createSharedLeaveRequest } from '@flc/hrms-services';
import {
  Employee, EmployeeStatus, AppRole,
  LeaveType, LeaveBalance, LeaveRequest, CreateLeaveRequestInput, LeaveStatus, ApprovalDecision, FlowEntityType,
  AttendanceRecord, UpsertAttendanceInput,
  PayrollRun, PayrollItem, PayrollRunStatus,
  Appraisal, AppraisalItem, AppraisalStatus, AppraisalCycle,
  Announcement, CreateAnnouncementInput,
} from '@/types';
import { HRMS_LEAVE_APPROVER_ROLES, HRMS_MANAGER_ROLES } from '@/config/hrmsConfig';
const DIRECTORY_EMPLOYEE_SELECT = 'id, company_id, branch_id, manager_employee_id, primary_role, status, staff_code, name, work_email, personal_email, ic_no, contact_no, join_date, resign_date, avatar_url, department_id, job_title_id, department:departments!employees_department_id_fkey(name), job_title:job_titles!employees_job_title_id_fkey(name)';

type ApprovalStepRecord = {
  id: string;
  stepOrder: number;
  name: string;
  approverType: 'role' | 'specific_user' | 'direct_manager';
  approverRole?: string;
  approverUserId?: string;
  allowSelfApproval: boolean;
};

type ApprovalInstanceRecord = {
  id: string;
  flowId: string;
  requesterId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  currentStepId?: string;
  currentStepOrder?: number;
  currentStepName?: string;
  currentApproverRole?: string;
  currentApproverUserId?: string;
};

type AppraisalItemRecord = {
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

function rowToApprovalStep(row: Record<string, unknown>): ApprovalStepRecord {
  return {
    id: String(row.id ?? ''),
    stepOrder: Number(row.step_order ?? 0),
    name: String(row.name ?? ''),
    approverType: (row.approver_type as ApprovalStepRecord['approverType']) ?? 'role',
    approverRole: row.approver_role ? String(row.approver_role) : undefined,
    approverUserId: row.approver_user_id ? String(row.approver_user_id) : undefined,
    allowSelfApproval: Boolean(row.allow_self_approval),
  };
}

function rowToApprovalInstance(row: Record<string, unknown>): ApprovalInstanceRecord {
  return {
    id: String(row.id ?? ''),
    flowId: String(row.flow_id ?? ''),
    requesterId: String(row.requester_id ?? ''),
    status: (row.status as ApprovalInstanceRecord['status']) ?? 'pending',
    currentStepId: row.current_step_id ? String(row.current_step_id) : undefined,
    currentStepOrder: row.current_step_order != null ? Number(row.current_step_order) : undefined,
    currentStepName: row.current_step_name ? String(row.current_step_name) : undefined,
    currentApproverRole: row.current_approver_role ? String(row.current_approver_role) : undefined,
    currentApproverUserId: row.current_approver_user_id ? String(row.current_approver_user_id) : undefined,
  };
}

function rowToApprovalDecision(row: Record<string, unknown>): ApprovalDecision {
  return {
    id: String(row.id ?? ''),
    instanceId: String(row.instance_id ?? ''),
    stepId: String(row.step_id ?? ''),
    stepOrder: Number(row.step_order ?? 0),
    approverId: String(row.approver_id ?? ''),
    approverName: row.approver ? String((row.approver as Record<string, unknown>)?.name ?? '') : undefined,
    stepName: row.step ? String((row.step as Record<string, unknown>)?.name ?? '') : undefined,
    decision: (row.decision as ApprovalDecision['decision']) ?? 'approved',
    note: row.note ? String(row.note) : undefined,
    decidedAt: String(row.decided_at ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

function rowToAppraisalItem(row: Record<string, unknown>): AppraisalItemRecord {
  return {
    id: String(row.id ?? ''),
    appraisalId: String(row.appraisal_id ?? ''),
    employeeId: String(row.employee_id ?? ''),
    reviewerId: row.reviewer_id ? String(row.reviewer_id) : undefined,
    rating: row.rating != null ? Number(row.rating) : undefined,
    goals: row.goals ? String(row.goals) : undefined,
    achievements: row.achievements ? String(row.achievements) : undefined,
    areasToImprove: row.areas_to_improve ? String(row.areas_to_improve) : undefined,
    reviewerComments: row.reviewer_comments ? String(row.reviewer_comments) : undefined,
    employeeComments: row.employee_comments ? String(row.employee_comments) : undefined,
    status: (row.status as AppraisalItem['status']) ?? 'pending',
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
  };
}

async function resolveDirectManagerApproverUserId(
  requesterId: string,
): Promise<{ data: string | null; error: string | null }> {
  const requesterProfileId = await resolveRequiredProfileId(requesterId);
  if (requesterProfileId.error) return { data: null, error: requesterProfileId.error };

  const requesterProfileResult = await supabase
    .from('profiles')
    .select('employee_id')
    .eq('id', requesterProfileId.data)
    .maybeSingle();

  if (requesterProfileResult.error) {
    return { data: null, error: requesterProfileResult.error.message };
  }

  const requesterProfile = requesterProfileResult.data as Record<string, unknown> | null;
  const requesterEmployeeId = requesterProfile?.employee_id ? String(requesterProfile.employee_id) : null;

  if (!requesterEmployeeId) {
    return {
      data: null,
      error: 'The requester must be linked to a workforce employee for direct-manager approval routing.',
    };
  }

  const { data: requesterEmployee, error: requesterEmployeeError } = await supabase
    .from('employees')
    .select('manager_employee_id')
    .eq('id', requesterEmployeeId)
    .maybeSingle();
  if (requesterEmployeeError) {
    return { data: null, error: requesterEmployeeError.message };
  }

  const managerEmployeeId = (requesterEmployee as Record<string, unknown> | null)?.manager_employee_id;
  if (!managerEmployeeId) {
    return {
      data: null,
      error: 'The requester does not have a reporting manager assigned for the next approval step.',
    };
  }

  const managerEmployeeIdText = String(managerEmployeeId);
  const { data: managerProfile, error: managerProfileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('employee_id', managerEmployeeIdText)
    .maybeSingle();
  if (managerProfileError) {
    return { data: null, error: managerProfileError.message };
  }
  if (!managerProfile?.id) {
    return {
      data: null,
      error: 'The requester reporting manager does not have a linked user profile.',
    };
  }

  return { data: String(managerProfile.id), error: null };
}

async function resolveStepRouting(
  step: ApprovalStepRecord,
  requesterId: string,
): Promise<{ approverRole: string | null; approverUserId: string | null; error: string | null }> {
  if (step.approverType === 'role') {
    return step.approverRole
      ? { approverRole: step.approverRole, approverUserId: null, error: null }
      : { approverRole: null, approverUserId: null, error: `Approval step '${step.name}' is missing an approver role.` };
  }

  if (step.approverType === 'specific_user') {
    return step.approverUserId
      ? { approverRole: null, approverUserId: step.approverUserId, error: null }
      : { approverRole: null, approverUserId: null, error: `Approval step '${step.name}' is missing a specific approver.` };
  }

  const managerApprover = await resolveDirectManagerApproverUserId(requesterId);
  return managerApprover.error
    ? { approverRole: null, approverUserId: null, error: managerApprover.error }
    : { approverRole: null, approverUserId: managerApprover.data, error: null };
}

async function bootstrapApprovalInstanceForEntity(
  companyId: string,
  entityType: FlowEntityType,
  entityId: string,
  requesterId: string,
): Promise<{ error: string | null }> {
  const { data: flows, error: flowError } = await supabase
    .from('approval_flows')
    .select('id')
    .eq('company_id', companyId)
    .eq('entity_type', entityType)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(2);
  if (flowError) return { error: flowError.message };
  if (!flows?.length) return { error: null };
  if (flows.length > 1) {
    return { error: `Multiple active approval flows found for ${entityType}. Deactivate extras before continuing.` };
  }

  const flowId = String(flows[0].id);
  const { data: steps, error: stepError } = await supabase
    .from('approval_steps')
    .select('id, step_order, name, approver_type, approver_role, approver_user_id, allow_self_approval')
    .eq('flow_id', flowId)
    .order('step_order');
  if (stepError) return { error: stepError.message };
  if (!steps?.length) return { error: `The active ${entityType} approval flow has no steps configured.` };

  const firstStep = rowToApprovalStep(steps[0] as Record<string, unknown>);
  const routing = await resolveStepRouting(firstStep, requesterId);
  if (routing.error) return { error: routing.error };

  const { error: instanceError } = await supabase.from('approval_instances').insert({
    company_id: companyId,
    flow_id: flowId,
    entity_type: entityType,
    entity_id: entityId,
    requester_id: requesterId,
    current_step_id: firstStep.id,
    current_step_order: firstStep.stepOrder,
    current_step_name: firstStep.name,
    current_approver_role: routing.approverRole,
    current_approver_user_id: routing.approverUserId,
    status: 'pending',
  });
  return { error: instanceError?.message ?? null };
}

async function seedAppraisalItemsForCycle(
  appraisalId: string,
  companyId: string,
  fallbackReviewerId: string,
): Promise<{ error: string | null }> {
  const { data: existingItems, error: existingItemsError } = await supabase
    .from('appraisal_items')
    .select('id')
    .eq('appraisal_id', appraisalId)
    .limit(1);
  if (existingItemsError) return { error: existingItemsError.message };
  if (existingItems?.length) return { error: null };

  const employeeDirectory = await listEmployeeDirectory(companyId);
  if (employeeDirectory.error) return { error: employeeDirectory.error };

  const activeEmployees = employeeDirectory.data.filter(employee => employee.status === 'active');
  if (!activeEmployees.length) return { error: 'No active employees are available for this appraisal cycle.' };

  const reviewerProfileIds = await resolveStoredProfileIds(activeEmployees.map(employee => employee.managerId ?? ''));
  if (reviewerProfileIds.error) return { error: reviewerProfileIds.error };

  const items = activeEmployees.map(employee => ({
    appraisal_id: appraisalId,
    employee_id: employee.id,
    reviewer_id: employee.managerId
      ? reviewerProfileIds.data.get(employee.managerId) ?? fallbackReviewerId
      : fallbackReviewerId,
    status: 'pending',
  }));

  const { error: itemError } = await supabase
    .from('appraisal_items')
    .insert(items);
  return { error: itemError?.message ?? null };
}

async function syncAppraisalCompletionStatus(appraisalId: string): Promise<{ error: string | null }> {
  const { data: items, error: itemError } = await supabase
    .from('appraisal_items')
    .select('status')
    .eq('appraisal_id', appraisalId);
  if (itemError) return { error: itemError.message };
  if (!items?.length || items.some(item => String(item.status ?? 'pending') !== 'acknowledged')) {
    return { error: null };
  }

  const { error: appraisalError } = await supabase
    .from('appraisals')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', appraisalId);
  return { error: appraisalError?.message ?? null };
}

async function getAppraisalItemActionContext(itemId: string): Promise<{
  data: { item: AppraisalItemRecord; appraisalStatus: AppraisalStatus } | null;
  error: string | null;
}> {
  const { data: itemRow, error: itemError } = await supabase
    .from('appraisal_items')
    .select('id, appraisal_id, employee_id, reviewer_id, rating, goals, achievements, areas_to_improve, reviewer_comments, employee_comments, status, reviewed_at')
    .eq('id', itemId)
    .single();
  if (itemError) return { data: null, error: itemError.message };

  const item = rowToAppraisalItem(itemRow as Record<string, unknown>);
  const { data: appraisalRow, error: appraisalError } = await supabase
    .from('appraisals')
    .select('status')
    .eq('id', item.appraisalId)
    .single();
  if (appraisalError) return { data: null, error: appraisalError.message };

  return {
    data: {
      item,
      appraisalStatus: ((appraisalRow as Record<string, unknown> | null)?.status as AppraisalStatus | undefined) ?? 'open',
    },
    error: null,
  };
}

function rowToDirectoryEmployee(row: Record<string, unknown>): Employee {
  return {
    id:             String(row.id ?? ''),
    email:          String(row.work_email ?? row.personal_email ?? ''),
    name:           String(row.name ?? ''),
    role:           (row.primary_role as AppRole) ?? 'analyst',
    companyId:      String(row.company_id ?? ''),
    branchId:       row.branch_id ? String(row.branch_id) : undefined,
    managerId:      row.manager_employee_id ? String(row.manager_employee_id) : undefined,
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

async function resolveRequiredProfileId(
  employeeId: string,
): Promise<{ data: string; error: string | null }> {
  if (!employeeId) return { data: employeeId, error: null };

  const { data: directProfile, error: directError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', employeeId)
    .maybeSingle();
  if (directError) return { data: employeeId, error: directError.message };
  if (directProfile?.id) return { data: String(directProfile.id), error: null };

  const { data: linkedProfile, error: linkedError } = await supabase
    .from('profiles')
    .select('id')
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (linkedError) return { data: employeeId, error: linkedError.message };
  if (!linkedProfile?.id) {
    return { data: employeeId, error: `No profile linked to employee '${employeeId}'.` };
  }

  return {
    data: String(linkedProfile.id),
    error: null,
  };
}

type StoredEmployeeIdentity = {
  name?: string;
};

async function resolveStoredEmployeeIdentities(
  storedEmployeeIds: string[],
): Promise<{ data: Map<string, StoredEmployeeIdentity>; error: string | null }> {
  const uniqueIds = [...new Set(storedEmployeeIds.filter(Boolean))];
  const identities = new Map<string, StoredEmployeeIdentity>();

  if (!uniqueIds.length) return { data: identities, error: null };

  const { data: employeeRows, error: employeeError } = await supabase
    .from('employees')
    .select('id, name')
    .in('id', uniqueIds);
  if (employeeError) return { data: identities, error: employeeError.message };

  for (const row of employeeRows ?? []) {
    identities.set(String(row.id), {
      name: row.name ? String(row.name) : undefined,
    });
  }

  return { data: identities, error: null };
}

async function resolveStoredProfileIds(
  candidateIds: string[],
): Promise<{ data: Map<string, string>; error: string | null }> {
  const uniqueIds = [...new Set(candidateIds.filter(Boolean))];
  const profileIds = new Map<string, string>();

  if (!uniqueIds.length) return { data: profileIds, error: null };

  const { data: directRows, error: directError } = await supabase
    .from('profiles')
    .select('id, employee_id')
    .in('id', uniqueIds);
  if (directError) return { data: profileIds, error: directError.message };

  for (const row of directRows ?? []) {
    profileIds.set(String(row.id), String(row.id));
    if (row.employee_id) profileIds.set(String(row.employee_id), String(row.id));
  }

  const unresolvedIds = uniqueIds.filter(id => !profileIds.has(id));
  if (!unresolvedIds.length) return { data: profileIds, error: null };

  const { data: linkedRows, error: linkedError } = await supabase
    .from('profiles')
    .select('id, employee_id')
    .in('employee_id', unresolvedIds);
  if (linkedError) return { data: profileIds, error: linkedError.message };

  for (const row of linkedRows ?? []) {
    if (row.employee_id) profileIds.set(String(row.employee_id), String(row.id));
    profileIds.set(String(row.id), String(row.id));
  }

  return { data: profileIds, error: null };
}

export async function listEmployeeDirectory(companyId: string): Promise<{ data: Employee[]; error: string | null }> {
  const { data, error } = await supabase
    .from('employees')
    .select(DIRECTORY_EMPLOYEE_SELECT)
    .eq('company_id', companyId)
    .order('name');

  if (error) return { data: [], error: error.message };

  return {
    data: (data ?? []).map((row: Record<string, unknown>) => rowToDirectoryEmployee(row)),
    error: null,
  };
}

export interface CreateEmployeeInput {
  id: string;       // must be pre-generated (crypto.randomUUID())
  email: string;
  name: string;
  role: AppRole;
  companyId: string;
  branchId?: string;
  managerId?: string;
  staffCode?: string;
  icNo?: string;
  contactNo?: string;
  joinDate?: string;
}

async function syncSalesAdvisorAssignment(
  employeeId: string,
  companyId: string,
  role: AppRole,
): Promise<{ error: string | null }> {
  if (role === 'sales') {
    const { error } = await supabase
      .from('employee_module_assignments')
      .upsert({
        company_id: companyId,
        employee_id: employeeId,
        module_key: 'sales',
        assignment_role: 'sales_advisor',
        is_primary: true,
        active: true,
        source: 'manual',
      }, { onConflict: 'employee_id,module_key,assignment_role' });
    return { error: error?.message ?? null };
  }

  const { error } = await supabase
    .from('employee_module_assignments')
    .update({ active: false, is_primary: false })
    .eq('employee_id', employeeId)
    .eq('module_key', 'sales')
    .eq('assignment_role', 'sales_advisor');

  return { error: error?.message ?? null };
}

export async function createEmployee(input: CreateEmployeeInput, actorId?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('employees').insert({
    id:                  input.id,
    company_id:          input.companyId,
    branch_id:           input.branchId ?? null,
    manager_employee_id: input.managerId ?? null,
    primary_role:        input.role,
    status:              'active',
    staff_code:          input.staffCode?.toUpperCase() ?? null,
    name:                input.name,
    work_email:          input.email || null,
    ic_no:               input.icNo ?? null,
    contact_no:          input.contactNo ?? null,
    join_date:           input.joinDate ?? null,
  });

  if (error) return { error: error.message };

  const assignment = await syncSalesAdvisorAssignment(input.id, input.companyId, input.role);
  if (assignment.error) return assignment;

  if (actorId) {
    void logUserAction(actorId, 'create', 'employee', input.id,
      { name: input.name, role: input.role, staffCode: input.staffCode });
  }
  return { error: null };
}

export interface UpdateEmployeeInput {
  name?: string;
  role?: AppRole;
  branchId?: string | null;
  managerId?: string | null;
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
  const payload: Record<string, unknown> = {};
  if (input.name         !== undefined) payload.name                = input.name;
  if (input.role         !== undefined) payload.primary_role        = input.role;
  if (input.branchId     !== undefined) payload.branch_id           = input.branchId;
  if (input.managerId    !== undefined) payload.manager_employee_id = input.managerId;
  if (input.staffCode    !== undefined) payload.staff_code          = input.staffCode?.toUpperCase();
  if (input.icNo         !== undefined) payload.ic_no               = input.icNo;
  if (input.contactNo    !== undefined) payload.contact_no          = input.contactNo;
  if (input.joinDate     !== undefined) payload.join_date           = input.joinDate;
  if (input.resignDate   !== undefined) payload.resign_date         = input.resignDate;
  if (input.status       !== undefined) payload.status              = input.status;
  if (input.departmentId !== undefined) payload.department_id       = input.departmentId;
  if (input.jobTitleId   !== undefined) payload.job_title_id        = input.jobTitleId;

  const { error } = await supabase.from('employees').update(payload).eq('id', id);
  if (error) return { error: error.message };

  if (input.role !== undefined) {
    const { data: employeeRow, error: employeeError } = await supabase
      .from('employees')
      .select('company_id')
      .eq('id', id)
      .single();
    if (employeeError) return { error: employeeError.message };
    if (employeeRow?.company_id) {
      const assignment = await syncSalesAdvisorAssignment(id, String(employeeRow.company_id), input.role);
      if (assignment.error) return assignment;
    }
  }

  if (actorId) {
    void logUserAction(actorId, 'update', 'employee', id, { changes: payload });
  }
  return { error: null };
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
    .eq('year', year)
    .eq('employee_id', employeeId);
  if (error) return { data: [], error: error.message };

  const mapped: LeaveBalance[] = (data ?? []).map(r => ({
    id:            String(r.id),
    employeeId:    String(r.employee_id ?? ''),
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
  opts?: { employeeId?: string; status?: LeaveStatus; includeApprovalHistory?: boolean },
): Promise<{ data: LeaveRequest[]; error: string | null }> {
  let q = supabase
    .from('leave_requests')
    .select('*, leave_types(name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts?.status)     q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };

  const identityMap = await resolveStoredEmployeeIdentities((data ?? []).map(row => String(row.employee_id ?? '')));
  if (identityMap.error) return { data: [], error: identityMap.error };

  const requestIds = (data ?? []).map(r => String(r.id));
  const approvalMeta = new Map<string, Record<string, unknown>>();
  const approvalHistory = new Map<string, ApprovalDecision[]>();

  if (requestIds.length) {
    const { data: approvals, error: approvalError } = await supabase
      .from('approval_instances')
      .select('id, entity_id, status, current_step_order, current_step_name, current_approver_role, current_approver_user_id')
      .eq('entity_type', 'leave_request')
      .in('entity_id', requestIds);
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

  const mapped: LeaveRequest[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:            String(r.id),
    companyId:     String(r.company_id),
    employeeId:    String(r.employee_id ?? ''),
    employeeName:  identityMap.data.get(String(r.employee_id ?? ''))?.name,
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
    approvalInstanceId:      approvalMeta.get(String(r.id))?.id ? String(approvalMeta.get(String(r.id))?.id) : undefined,
    approvalInstanceStatus:  approvalMeta.get(String(r.id))?.status ? String(approvalMeta.get(String(r.id))?.status) as LeaveRequest['approvalInstanceStatus'] : undefined,
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
  try {
    const requesterProfileId = await resolveRequiredProfileId(employeeId);
    if (requesterProfileId.error) return { error: requesterProfileId.error };

    const leaveRequestId = await createSharedLeaveRequest(employeeId, companyId, {
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason,
    });
    void logUserAction(requesterProfileId.data, 'create', 'leave_request', leaveRequestId, {
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      days: input.days,
    });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to create leave request.' };
  }
}

export async function reviewLeaveRequest(
  requestId: string,
  reviewerId: string,
  status: 'approved' | 'rejected',
  note?: string,
): Promise<{ error: string | null }> {
  const { data: req, error: requestError } = await supabase
    .from('leave_requests')
    .select('employee_id, company_id')
    .eq('id', requestId)
    .single();
  if (requestError) return { error: requestError.message };

  const requestOwnerId = String((req as Record<string, unknown> | null)?.employee_id ?? '');
  if (!requestOwnerId) return { error: 'Leave request not found.' };

  const requesterProfileId = await resolveRequiredProfileId(requestOwnerId);
  if (requesterProfileId.error) return { error: requesterProfileId.error };

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
    .eq('entity_type', 'leave_request')
    .eq('entity_id', requestId)
    .maybeSingle();
  if (approvalError) return { error: approvalError.message };

  if (!approvalInstance) {
    if (requesterProfileId.data === reviewerId) {
      return { error: 'You cannot approve or reject your own leave request.' };
    }
    if (!HRMS_LEAVE_APPROVER_ROLES.includes(reviewerRole as AppRole)) {
      return { error: 'You are not allowed to review this leave request.' };
    }

    const { error } = await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), reviewer_note: note ?? null })
      .eq('id', requestId);
    if (!error) {
      void logUserAction(reviewerId, 'update', 'leave_request', requestId,
        { status, reviewerNote: note ?? null, approvalMode: 'legacy' });
    }
    return { error: error?.message ?? null };
  }

  const instance = rowToApprovalInstance(approvalInstance as Record<string, unknown>);
  const approvalRequesterId = instance.requesterId || requesterProfileId.data;
  if (instance.status !== 'pending') {
    return { error: `This leave approval is already ${instance.status}.` };
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
  if (!currentStep) {
    return { error: 'The current approval step could not be resolved.' };
  }

  if (approvalRequesterId === reviewerId && !currentStep.allowSelfApproval) {
    return { error: 'You cannot approve or reject your own leave request.' };
  }

  const isAssignedApprover = currentStep.approverType === 'role'
    ? Boolean(instance.currentApproverRole) && instance.currentApproverRole === reviewerRole
    : Boolean(instance.currentApproverUserId) && instance.currentApproverUserId === reviewerId;

  if (!isAssignedApprover) {
    return { error: 'You are not the assigned approver for the current step.' };
  }

  const nextStep = status === 'approved'
    ? steps.find(step => step.stepOrder > currentStep.stepOrder)
    : undefined;
  const nextRouting = nextStep
    ? await resolveStepRouting(nextStep, approvalRequesterId)
    : { approverRole: null, approverUserId: null, error: null };
  if (nextRouting.error) return { error: nextRouting.error };

  const reviewedAt = new Date().toISOString();

  const { error: decisionError } = await supabase
    .from('approval_decisions')
    .insert({
      instance_id: instance.id,
      step_id: currentStep.id,
      step_order: currentStep.stepOrder,
      approver_id: reviewerId,
      decision: status,
      note: note ?? null,
      decided_at: reviewedAt,
    });
  if (decisionError) return { error: decisionError.message };

  if (status === 'rejected') {
    const [{ error: workflowError }, { error: leaveError }] = await Promise.all([
      supabase
        .from('approval_instances')
        .update({
          status: 'rejected',
          current_step_id: null,
          current_step_order: null,
          current_step_name: null,
          current_approver_role: null,
          current_approver_user_id: null,
          updated_at: reviewedAt,
        })
        .eq('id', instance.id),
      supabase
        .from('leave_requests')
        .update({ status, reviewed_by: reviewerId, reviewed_at: reviewedAt, reviewer_note: note ?? null, updated_at: reviewedAt })
        .eq('id', requestId),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (leaveError) return { error: leaveError.message };
  } else if (nextStep) {
    const { error: workflowError } = await supabase
      .from('approval_instances')
      .update({
        current_step_id: nextStep.id,
        current_step_order: nextStep.stepOrder,
        current_step_name: nextStep.name,
        current_approver_role: nextRouting.approverRole,
        current_approver_user_id: nextRouting.approverUserId,
        updated_at: reviewedAt,
      })
      .eq('id', instance.id);
    if (workflowError) return { error: workflowError.message };
  } else {
    const [{ error: workflowError }, { error: leaveError }] = await Promise.all([
      supabase
        .from('approval_instances')
        .update({
          status: 'approved',
          current_step_id: null,
          current_step_order: null,
          current_step_name: null,
          current_approver_role: null,
          current_approver_user_id: null,
          updated_at: reviewedAt,
        })
        .eq('id', instance.id),
      supabase
        .from('leave_requests')
        .update({ status, reviewed_by: reviewerId, reviewed_at: reviewedAt, reviewer_note: note ?? null, updated_at: reviewedAt })
        .eq('id', requestId),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (leaveError) return { error: leaveError.message };
  }

  void logUserAction(reviewerId, 'update', 'leave_request', requestId,
    {
      status,
      reviewerNote: note ?? null,
      approvalStep: currentStep.name,
      finalDecision: status === 'rejected' || !nextStep,
      nextApprovalStep: nextStep?.name ?? null,
    });
  return { error: null };
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
    .select('*')
    .eq('company_id', companyId)
    .order('date', { ascending: false });
  if (opts?.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts?.dateFrom)   q = q.gte('date', opts.dateFrom);
  if (opts?.dateTo)     q = q.lte('date', opts.dateTo);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  const identityMap = await resolveStoredEmployeeIdentities((data ?? []).map(row => String(row.employee_id ?? '')));
  if (identityMap.error) return { data: [], error: identityMap.error };

  const mapped: AttendanceRecord[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:           String(r.id),
    companyId:    String(r.company_id),
    employeeId:   String(r.employee_id ?? ''),
    employeeName: identityMap.data.get(String(r.employee_id ?? ''))?.name,
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

export async function listAppraisals(
  companyId: string,
  opts?: { includeApprovalHistory?: boolean },
): Promise<{ data: Appraisal[]; error: string | null }> {
  const { data, error } = await supabase
    .from('appraisals')
    .select('*')
    .eq('company_id', companyId)
    .order('period_start', { ascending: false });
  if (error) return { data: [], error: error.message };

  const appraisalIds = (data ?? []).map(r => String(r.id));
  const approvalMeta = new Map<string, Record<string, unknown>>();
  const approvalHistory = new Map<string, ApprovalDecision[]>();

  if (appraisalIds.length) {
    const { data: approvals, error: approvalError } = await supabase
      .from('approval_instances')
      .select('id, entity_id, status, current_step_order, current_step_name, current_approver_role, current_approver_user_id')
      .eq('entity_type', 'appraisal')
      .in('entity_id', appraisalIds);
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
          const mappedDecision = rowToApprovalDecision(decision as Record<string, unknown>);
          if (!approvalHistory.has(mappedDecision.instanceId)) approvalHistory.set(mappedDecision.instanceId, []);
          approvalHistory.get(mappedDecision.instanceId)!.push(mappedDecision);
        }
      }
    }
  }

  const mapped: Appraisal[] = (data ?? []).map(r => ({
    id:          String(r.id),
    companyId:   String(r.company_id),
    title:       String(r.title),
    cycle:       r.cycle as AppraisalCycle,
    periodStart: String(r.period_start),
    periodEnd:   String(r.period_end),
    status:      r.status as AppraisalStatus,
    approvalInstanceId: approvalMeta.get(String(r.id))?.id ? String(approvalMeta.get(String(r.id))?.id) : undefined,
    approvalInstanceStatus: approvalMeta.get(String(r.id))?.status
      ? String(approvalMeta.get(String(r.id))?.status) as Appraisal['approvalInstanceStatus']
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
  const { data: flows, error: flowError } = await supabase
    .from('approval_flows')
    .select('id')
    .eq('company_id', companyId)
    .eq('entity_type', 'appraisal')
    .eq('is_active', true)
    .limit(2);
  if (flowError) return { error: flowError.message };
  if ((flows?.length ?? 0) > 1) {
    return { error: 'Multiple active approval flows found for appraisal. Deactivate extras before continuing.' };
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
  if (error) return { error: error.message };

  const appraisalId = String(data.id);
  if (requiresApproval) {
    const bootstrapResult = await bootstrapApprovalInstanceForEntity(companyId, 'appraisal', appraisalId, createdBy);
    if (bootstrapResult.error) {
      await supabase.from('appraisals').delete().eq('id', appraisalId);
      return { error: bootstrapResult.error };
    }
  } else {
    const seedResult = await seedAppraisalItemsForCycle(appraisalId, companyId, createdBy);
    if (seedResult.error) {
      await supabase.from('appraisals').delete().eq('id', appraisalId);
      return { error: seedResult.error };
    }
  }

  void logUserAction(createdBy, 'create', 'appraisal', appraisalId, {
    title: input.title,
    cycle: input.cycle,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    approvalRequired: requiresApproval,
  });
  return { error: null };
}

export async function reviewAppraisalActivation(
  appraisalId: string,
  reviewerId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<{ error: string | null }> {
  const { data: appraisal, error: appraisalError } = await supabase
    .from('appraisals')
    .select('status, created_by')
    .eq('id', appraisalId)
    .single();
  if (appraisalError) return { error: appraisalError.message };

  const appraisalStatus = (appraisal?.status as AppraisalStatus | undefined) ?? 'open';
  if (appraisalStatus !== 'in_progress') {
    return { error: 'Only appraisal cycles pending activation can be reviewed.' };
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
    .eq('entity_type', 'appraisal')
    .eq('entity_id', appraisalId)
    .maybeSingle();
  if (approvalError) return { error: approvalError.message };
  if (!approvalInstance) {
    return { error: 'This appraisal cycle does not have an approval workflow.' };
  }

  const instance = rowToApprovalInstance(approvalInstance as Record<string, unknown>);
  if (instance.status !== 'pending') {
    return { error: `This appraisal approval is already ${instance.status}.` };
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
  if (!currentStep) return { error: 'The current appraisal approval step could not be resolved.' };

  const requesterId = instance.requesterId || String((appraisal as Record<string, unknown> | null)?.created_by ?? '');
  if (requesterId && requesterId === reviewerId && !currentStep.allowSelfApproval) {
    return { error: 'You cannot approve or reject your own appraisal cycle.' };
  }

  const isAssignedApprover = currentStep.approverType === 'role'
    ? Boolean(instance.currentApproverRole) && instance.currentApproverRole === reviewerRole
    : Boolean(instance.currentApproverUserId) && instance.currentApproverUserId === reviewerId;
  if (!isAssignedApprover) {
    return { error: 'You are not the assigned approver for the current appraisal step.' };
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
    const [{ error: workflowError }, { error: appraisalUpdateError }] = await Promise.all([
      supabase
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
        .eq('id', instance.id),
      supabase
        .from('appraisals')
        .update({ updated_at: decidedAt })
        .eq('id', appraisalId),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (appraisalUpdateError) return { error: appraisalUpdateError.message };
  } else if (nextStep) {
    const [{ error: workflowError }, { error: appraisalUpdateError }] = await Promise.all([
      supabase
        .from('approval_instances')
        .update({
          current_step_id: nextStep.id,
          current_step_order: nextStep.stepOrder,
          current_step_name: nextStep.name,
          current_approver_role: nextRouting.approverRole,
          current_approver_user_id: nextRouting.approverUserId,
          updated_at: decidedAt,
        })
        .eq('id', instance.id),
      supabase
        .from('appraisals')
        .update({ updated_at: decidedAt })
        .eq('id', appraisalId),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (appraisalUpdateError) return { error: appraisalUpdateError.message };
  } else {
    const seedResult = await seedAppraisalItemsForCycle(appraisalId, String((appraisal as Record<string, unknown> | null)?.company_id ?? ''), reviewerId);
    if (seedResult.error) return { error: seedResult.error };

    const [{ error: workflowError }, { error: appraisalUpdateError }] = await Promise.all([
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
        .from('appraisals')
        .update({ status: 'open', updated_at: decidedAt })
        .eq('id', appraisalId),
    ]);
    if (workflowError) return { error: workflowError.message };
    if (appraisalUpdateError) return { error: appraisalUpdateError.message };
  }

  void logUserAction(reviewerId, 'update', 'appraisal', appraisalId, {
    approvalDecision: decision,
    approvalStep: currentStep.name,
    reviewerNote: note ?? null,
    finalDecision: decision === 'rejected' || !nextStep,
    nextApprovalStep: nextStep?.name ?? null,
  });
  return { error: null };
}

export async function resubmitAppraisalActivation(
  appraisalId: string,
  requesterId: string,
): Promise<{ error: string | null }> {
  const { data: appraisal, error: appraisalError } = await supabase
    .from('appraisals')
    .select('status, created_by')
    .eq('id', appraisalId)
    .single();
  if (appraisalError) return { error: appraisalError.message };

  const appraisalStatus = (appraisal?.status as AppraisalStatus | undefined) ?? 'open';
  if (appraisalStatus !== 'in_progress') {
    return { error: 'Only appraisal cycles pending activation can be resubmitted.' };
  }

  const appraisalOwnerId = String((appraisal as Record<string, unknown> | null)?.created_by ?? '');
  if (!appraisalOwnerId || appraisalOwnerId !== requesterId) {
    return { error: 'Only the appraisal owner can resubmit this activation request.' };
  }

  const { data: approvalInstance, error: approvalError } = await supabase
    .from('approval_instances')
    .select('id, flow_id, requester_id, status')
    .eq('entity_type', 'appraisal')
    .eq('entity_id', appraisalId)
    .maybeSingle();
  if (approvalError) return { error: approvalError.message };
  if (!approvalInstance) {
    return { error: 'This appraisal cycle does not have an approval workflow.' };
  }

  const instance = rowToApprovalInstance(approvalInstance as Record<string, unknown>);
  if (instance.status !== 'rejected') {
    return { error: 'Only rejected appraisal approvals can be resubmitted.' };
  }

  const { data: stepRows, error: stepsError } = await supabase
    .from('approval_steps')
    .select('id, step_order, name, approver_type, approver_role, approver_user_id, allow_self_approval')
    .eq('flow_id', instance.flowId)
    .order('step_order');
  if (stepsError) return { error: stepsError.message };
  if (!stepRows?.length) return { error: 'The appraisal approval flow has no steps configured.' };

  const firstStep = rowToApprovalStep(stepRows[0] as Record<string, unknown>);
  const routing = await resolveStepRouting(firstStep, requesterId);
  if (routing.error) return { error: routing.error };

  const resubmittedAt = new Date().toISOString();
  const [{ error: workflowError }, { error: appraisalUpdateError }] = await Promise.all([
    supabase
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
      .eq('id', instance.id),
    supabase
      .from('appraisals')
      .update({ updated_at: resubmittedAt })
      .eq('id', appraisalId),
  ]);
  if (workflowError) return { error: workflowError.message };
  if (appraisalUpdateError) return { error: appraisalUpdateError.message };

  void logUserAction(requesterId, 'update', 'appraisal', appraisalId, {
    approvalResubmitted: true,
    approvalFlowId: instance.flowId,
    approvalStep: firstStep.name,
  });
  return { error: null };
}

export async function listAppraisalItems(appraisalId: string): Promise<{ data: AppraisalItem[]; error: string | null }> {
  let { data, error } = await supabase
    .from('appraisal_items')
    .select('*, reviewer:profiles!reviewer_id(name)')
    .eq('appraisal_id', appraisalId);
  if (error) return { data: [], error: error.message };

  if (!(data?.length)) {
    const { data: appraisalRow, error: appraisalError } = await supabase
      .from('appraisals')
      .select('company_id, created_by, status')
      .eq('id', appraisalId)
      .single();
    if (appraisalError) return { data: [], error: appraisalError.message };

    const appraisalStatus = String((appraisalRow as Record<string, unknown> | null)?.status ?? 'open');
    if (appraisalStatus === 'open') {
      const seedResult = await seedAppraisalItemsForCycle(
        appraisalId,
        String((appraisalRow as Record<string, unknown> | null)?.company_id ?? ''),
        String((appraisalRow as Record<string, unknown> | null)?.created_by ?? ''),
      );
      if (seedResult.error) return { data: [], error: seedResult.error };

      const refetch = await supabase
        .from('appraisal_items')
        .select('*, reviewer:profiles!reviewer_id(name)')
        .eq('appraisal_id', appraisalId);
      data = refetch.data;
      error = refetch.error;
      if (error) return { data: [], error: error.message };
    }
  }

  const identityMap = await resolveStoredEmployeeIdentities((data ?? []).map(row => String(row.employee_id ?? '')));
  if (identityMap.error) return { data: [], error: identityMap.error };

  const mapped: AppraisalItem[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:               String(r.id),
    appraisalId:      String(r.appraisal_id),
    employeeId:       String(r.employee_id ?? ''),
    employeeName:     identityMap.data.get(String(r.employee_id ?? ''))?.name,
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

export async function submitAppraisalSelfReview(
  itemId: string,
  employeeId: string,
  input: Pick<AppraisalItem, 'goals' | 'achievements' | 'areasToImprove' | 'employeeComments'>,
): Promise<{ error: string | null }> {
  const requesterProfileId = await resolveRequiredProfileId(employeeId);
  if (requesterProfileId.error) return { error: requesterProfileId.error };

  const context = await getAppraisalItemActionContext(itemId);
  if (context.error) return { error: context.error };
  if (!context.data) return { error: 'Appraisal item not found.' };

  const { item, appraisalStatus } = context.data;
  if (appraisalStatus !== 'open') return { error: 'Self review is only available for active appraisal cycles.' };
  if (item.employeeId !== employeeId) return { error: 'You can only submit your own appraisal self review.' };
  if (!['pending', 'self_reviewed'].includes(item.status)) {
    return { error: 'This appraisal item is no longer open for self review.' };
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('appraisal_items')
    .update({
      goals: input.goals ?? null,
      achievements: input.achievements ?? null,
      areas_to_improve: input.areasToImprove ?? null,
      employee_comments: input.employeeComments ?? null,
      status: 'self_reviewed',
      updated_at: updatedAt,
    })
    .eq('id', itemId);
  if (error) return { error: error.message };

  void logUserAction(requesterProfileId.data, 'update', 'appraisal_item', itemId, {
    action: 'self_review',
    appraisalId: item.appraisalId,
  });
  return { error: null };
}

export async function reviewAppraisalItem(
  itemId: string,
  reviewerId: string,
  input: Pick<AppraisalItem, 'rating' | 'reviewerComments'>,
): Promise<{ error: string | null }> {
  const context = await getAppraisalItemActionContext(itemId);
  if (context.error) return { error: context.error };
  if (!context.data) return { error: 'Appraisal item not found.' };

  const { item, appraisalStatus } = context.data;
  if (appraisalStatus !== 'open') return { error: 'Manager review is only available for active appraisal cycles.' };
  if (!item.reviewerId || item.reviewerId !== reviewerId) {
    return { error: 'You are not the assigned reviewer for this appraisal item.' };
  }
  if (!['self_reviewed', 'reviewed'].includes(item.status)) {
    return { error: 'The employee must complete self review before manager review.' };
  }

  const reviewedAt = new Date().toISOString();
  const { error } = await supabase
    .from('appraisal_items')
    .update({
      rating: input.rating ?? null,
      reviewer_comments: input.reviewerComments ?? null,
      status: 'reviewed',
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    })
    .eq('id', itemId);
  if (error) return { error: error.message };

  void logUserAction(reviewerId, 'update', 'appraisal_item', itemId, {
    action: 'manager_review',
    appraisalId: item.appraisalId,
    rating: input.rating ?? null,
  });
  return { error: null };
}

export async function acknowledgeAppraisalItem(
  itemId: string,
  employeeId: string,
  employeeComments?: string,
): Promise<{ error: string | null }> {
  const requesterProfileId = await resolveRequiredProfileId(employeeId);
  if (requesterProfileId.error) return { error: requesterProfileId.error };

  const context = await getAppraisalItemActionContext(itemId);
  if (context.error) return { error: context.error };
  if (!context.data) return { error: 'Appraisal item not found.' };

  const { item, appraisalStatus } = context.data;
  if (!['open', 'completed'].includes(appraisalStatus)) {
    return { error: 'Acknowledgement is only available for active appraisal cycles.' };
  }
  if (item.employeeId !== employeeId) {
    return { error: 'You can only acknowledge your own appraisal review.' };
  }
  if (!['reviewed', 'acknowledged'].includes(item.status)) {
    return { error: 'Manager review must be completed before acknowledgement.' };
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('appraisal_items')
    .update({
      employee_comments: employeeComments ?? item.employeeComments ?? null,
      status: 'acknowledged',
      updated_at: updatedAt,
    })
    .eq('id', itemId);
  if (error) return { error: error.message };

  const syncResult = await syncAppraisalCompletionStatus(item.appraisalId);
  if (syncResult.error) return syncResult;

  void logUserAction(requesterProfileId.data, 'update', 'appraisal_item', itemId, {
    action: 'acknowledge',
    appraisalId: item.appraisalId,
  });
  return { error: null };
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
