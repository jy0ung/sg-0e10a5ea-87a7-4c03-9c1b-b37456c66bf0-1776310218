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
import { HRMS_LEAVE_APPROVER_ROLES } from '@/config/hrmsConfig';

// Disambiguate the profiles→departments embed: departments also has a FK
// back to profiles (departments.head_employee_id), so PostgREST refuses to
// pick one without a hint. Use the specific FK name.
const PROFILE_SELECT = 'id, email, name, role, company_id, branch_id, manager_id, status, staff_code, ic_no, contact_no, join_date, resign_date, avatar_url, department_id, job_title_id, department:departments!profiles_department_id_fkey(name), job_title:job_titles!profiles_job_title_id_fkey(name)';

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

  const { data, error } = await supabase
    .from('profiles')
    .select('manager_id')
    .eq('id', requesterId)
    .single();
  if (error) {
    return { approverRole: null, approverUserId: null, error: error.message };
  }

  const managerId = (data as Record<string, unknown> | null)?.manager_id;
  return managerId
    ? { approverRole: null, approverUserId: String(managerId), error: null }
    : {
        approverRole: null,
        approverUserId: null,
        error: 'The requester does not have a reporting manager assigned for the next approval step.',
      };
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

function rowToEmployee(row: Record<string, unknown>): Employee {
  return {
    id:             String(row.id ?? ''),
    email:          String(row.email ?? ''),
    name:           String(row.name ?? ''),
    role:           (row.role as AppRole) ?? 'analyst',
    companyId:      String(row.company_id ?? ''),
    branchId:       row.branch_id ? String(row.branch_id) : undefined,
    managerId:      row.manager_id ? String(row.manager_id) : undefined,
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
  managerId?: string;
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
    manager_id:  input.managerId ?? null,
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
  // Build the update payload, only including defined fields
  const payload: Record<string, unknown> = {};
  if (input.name         !== undefined) payload.name          = input.name;
  if (input.role         !== undefined) payload.role          = input.role;
  if (input.branchId     !== undefined) payload.branch_id     = input.branchId;
  if (input.managerId    !== undefined) payload.manager_id    = input.managerId;
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
  opts?: { employeeId?: string; status?: LeaveStatus; includeApprovalHistory?: boolean },
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
    const leaveRequestId = await createSharedLeaveRequest(employeeId, companyId, {
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason,
    });
    void logUserAction(employeeId, 'create', 'leave_request', leaveRequestId, {
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

  const requesterId = String((req as Record<string, unknown> | null)?.employee_id ?? '');
  if (!requesterId) return { error: 'Leave request not found.' };

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
    if (requesterId === reviewerId) {
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

  if (requesterId === reviewerId && !currentStep.allowSelfApproval) {
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
    ? await resolveStepRouting(nextStep, requesterId)
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

  const runIds = (data ?? []).map(run => String(run.id));
  const approvalMeta = new Map<string, Record<string, unknown>>();

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
