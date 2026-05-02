import { supabase } from '@/integrations/supabase/client';
import { AppraisalItem, ApprovalDecision, Employee, EmployeeStatus, AppRole, FlowEntityType } from '@/types';

export const DIRECTORY_EMPLOYEE_SELECT = 'id, company_id, branch_id, manager_employee_id, primary_role, status, staff_code, name, work_email, personal_email, ic_no, contact_no, join_date, resign_date, avatar_url, department_id, job_title_id, department:departments!employees_department_id_fkey(name), job_title:job_titles!employees_job_title_id_fkey(name)';

export type ApprovalStepRecord = {
  id: string;
  stepOrder: number;
  name: string;
  approverType: 'role' | 'specific_user' | 'direct_manager';
  approverRole?: string;
  approverUserId?: string;
  allowSelfApproval: boolean;
};

// PostgREST 14.8 does not resolve self-referential FK joins (profiles→profiles).
// manager_id is included so listEmployees can resolve managerName client-side.
export const PROFILE_SELECT = 'id, email, name, role, company_id, branch_id, status, staff_code, ic_no, contact_no, join_date, resign_date, avatar_url, department_id, job_title_id, manager_id, department:departments!profiles_department_id_fkey(name), job_title:job_titles(name)';

export type ApprovalInstanceRecord = {
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

export type AppraisalItemRecord = {
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

export function rowToApprovalStep(row: Record<string, unknown>): ApprovalStepRecord {
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

export function rowToApprovalInstance(row: Record<string, unknown>): ApprovalInstanceRecord {
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

export function rowToApprovalDecision(row: Record<string, unknown>): ApprovalDecision {
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

export function rowToAppraisalItem(row: Record<string, unknown>): AppraisalItemRecord {
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

export async function resolveStepRouting(
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

export async function bootstrapApprovalInstanceForEntity(
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


export function rowToDirectoryEmployee(row: Record<string, unknown>): Employee {
  return {
    id:             String(row.id ?? ''),
    email:          String(row.work_email ?? row.personal_email ?? ''),
    name:           String(row.name ?? ''),
    role:           (row.primary_role as AppRole) ?? 'analyst',
    companyId:      String(row.company_id ?? ''),
    branchId:       row.branch_id ? String(row.branch_id) : undefined,
    managerId:      row.manager_employee_id ? String(row.manager_employee_id) : (row.manager_id ? String(row.manager_id) : undefined),
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
    managerName:    row.managerName ? String(row.managerName) : undefined,
  };
}

export async function resolveRequiredProfileId(
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

export type StoredEmployeeIdentity = {
  name?: string;
};

export async function resolveStoredEmployeeIdentities(
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

export async function resolveStoredProfileIds(
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

