/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin settings service — departments, job titles, leave-type config,
 * holiday config, approval flows, and HRMS roles.
 *
 * Naming note: hrms_roles and employee_hrms_role_assignments are NOT in the
 * generated Database types, so those queries use `(supabase as any)`.
 *
 * All functions throw on error (consistent with the rest of @flc/hrms-services).
 */
import type {
  Department,
  CreateDepartmentInput,
  UpdateDepartmentInput,
  JobTitle,
  CreateJobTitleInput,
  UpdateJobTitleInput,
  LeaveType,
  CreateLeaveTypeInput,
  PublicHoliday,  CreateHolidayInput,
  UpdateHolidayInput,
  HrmsRole,
  CreateHrmsRoleInput,
  UpdateHrmsRoleInput,
  HrmsRoleAssignment,
  ApprovalFlow,
  CreateApprovalFlowInput,
  UpdateApprovalFlowInput,
} from '@flc/types';
import { supabase } from '../shared/supabaseClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToDepartment(r: Record<string, unknown>): Department {
  return {
    id:               String(r.id ?? ''),
    companyId:        String(r.company_id ?? ''),
    name:             String(r.name ?? ''),
    description:      r.description ? String(r.description) : undefined,
    headEmployeeId:   r.head_employee_id ? String(r.head_employee_id) : undefined,
    headEmployeeName: r.head_name ? String(r.head_name) : undefined,
    costCentre:       r.cost_centre ? String(r.cost_centre) : undefined,
    isActive:         Boolean(r.is_active),
    createdAt:        String(r.created_at ?? ''),
    updatedAt:        String(r.updated_at ?? ''),
  };
}

function rowToJobTitle(r: Record<string, unknown>): JobTitle {
  const dept = r.department as Record<string, unknown> | null;
  return {
    id:             String(r.id ?? ''),
    companyId:      String(r.company_id ?? ''),
    name:           String(r.name ?? ''),
    departmentId:   r.department_id ? String(r.department_id) : undefined,
    departmentName: dept?.name ? String(dept.name) : undefined,
    level:          r.level ? (r.level as JobTitle['level']) : undefined,
    description:    r.description ? String(r.description) : undefined,
    isActive:       Boolean(r.is_active),
    createdAt:      String(r.created_at ?? ''),
    updatedAt:      String(r.updated_at ?? ''),
  };
}

function rowToLeaveType(r: Record<string, unknown>): LeaveType {
  return {
    id:          String(r.id ?? ''),
    companyId:   String(r.company_id ?? ''),
    name:        String(r.name ?? ''),
    code:        String(r.code ?? ''),
    daysPerYear: Number(r.days_per_year ?? r.default_days ?? 0),
    defaultDays: Number(r.default_days ?? 0),
    carryForward:Boolean(r.carry_forward),
    isPaid:      Boolean(r.is_paid ?? true),
    active:      Boolean(r.active),
    createdAt:   String(r.created_at ?? ''),
    updatedAt:   String(r.updated_at ?? ''),
  };
}

function rowToHoliday(r: Record<string, unknown>): PublicHoliday {
  return {
    id:          String(r.id ?? ''),
    companyId:   String(r.company_id ?? ''),
    name:        String(r.name ?? ''),
    date:        String(r.date ?? ''),
    holidayType: (r.holiday_type ?? 'public') as PublicHoliday['holidayType'],
    isRecurring: Boolean(r.is_recurring),
    createdAt:   String(r.created_at ?? ''),
    updatedAt:   String(r.updated_at ?? ''),
  };
}

function rowToHrmsRole(r: Record<string, any>): HrmsRole {
  return {
    id:                      String(r.id ?? ''),
    companyId:               String(r.company_id ?? ''),
    code:                    String(r.code ?? ''),
    name:                    String(r.name ?? ''),
    category:                r.category as HrmsRole['category'],
    scope:                   r.scope as HrmsRole['scope'],
    authorityLevel:          Number(r.authority_level ?? 0),
    description:             r.description ? String(r.description) : undefined,
    canApproveRequests:      Boolean(r.can_approve_requests),
    canManageEmployeeRecords:Boolean(r.can_manage_employee_records),
    canViewHrmsReports:      Boolean(r.can_view_hrms_reports),
    isActive:                Boolean(r.is_active),
    isSystemDefault:         Boolean(r.is_system_default),
    assignedUserCount:       Number(r.assigned_user_count ?? r._assigned_count ?? 0),
    lastUpdatedByName:       r.last_updated_by_name ? String(r.last_updated_by_name) : undefined,
    createdAt:               String(r.created_at ?? ''),
    updatedAt:               String(r.updated_at ?? ''),
  };
}

function rowToHrmsRoleAssignment(r: Record<string, any>): HrmsRoleAssignment {
  return {
    id:           String(r.id ?? ''),
    companyId:    String(r.company_id ?? ''),
    hrmsRoleId:   String(r.hrms_role_id ?? ''),
    employeeId:   r.employee_id ? String(r.employee_id) : undefined,
    profileId:    r.profile_id ? String(r.profile_id) : undefined,
    employeeName: r.employee_name ? String(r.employee_name) : undefined,
    profileName:  r.profile_name ? String(r.profile_name) : undefined,
    isPrimary:    Boolean(r.is_primary),
    createdAt:    String(r.created_at ?? ''),
    updatedAt:    String(r.updated_at ?? ''),
  };
}

function rowToApprovalFlow(r: Record<string, unknown>): ApprovalFlow {
  const steps = Array.isArray(r.approval_steps) ? r.approval_steps : [];
  return {
    id:          String(r.id ?? ''),
    companyId:   String(r.company_id ?? ''),
    name:        String(r.name ?? ''),
    description: r.description ? String(r.description) : undefined,
    entityType:  r.entity_type as ApprovalFlow['entityType'],
    isActive:    Boolean(r.is_active),
    createdBy:   r.created_by ? String(r.created_by) : undefined,
    steps:       (steps as Record<string, unknown>[]).map(s => ({
      id:                   String(s.id ?? ''),
      flowId:               String(s.flow_id ?? ''),
      stepOrder:            Number(s.step_order ?? 0),
      name:                 String(s.name ?? ''),
      approverType:         s.approver_type as ApprovalFlow['steps'][number]['approverType'],
      approverRoleName:     s.approver_role_name ? String(s.approver_role_name) : undefined,
      approverRole:         s.approver_role ? String(s.approver_role) : undefined,
      approverUserId:       s.approver_user_id ? String(s.approver_user_id) : undefined,
      approverUserName:     s.approver_user_name ? String(s.approver_user_name) : undefined,
      fallbackApproverUserId: s.fallback_approver_user_id ? String(s.fallback_approver_user_id) : undefined,
      fallbackApproverUserName: s.fallback_approver_user_name ? String(s.fallback_approver_user_name) : undefined,
      escalationRule:       s.escalation_rule ? String(s.escalation_rule) : undefined,
      conditionRule:        s.condition_rule ? String(s.condition_rule) : undefined,
      isActive:             Boolean(s.is_active ?? true),
      allowSelfApproval:    Boolean(s.allow_self_approval),
    })),
    createdAt:   String(r.created_at ?? ''),
    updatedAt:   String(r.updated_at ?? ''),
  };
}

// ─── Departments ──────────────────────────────────────────────────────────────

export async function listDepartments(companyId: string): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => rowToDepartment(r as Record<string, unknown>));
}

export async function createDepartment(
  companyId: string,
  input: CreateDepartmentInput,
): Promise<Department> {
  const { data, error } = await supabase
    .from('departments')
    .insert({
      company_id:       companyId,
      name:             input.name,
      description:      input.description ?? null,
      head_employee_id: input.headEmployeeId ?? null,
      cost_centre:      input.costCentre ?? null,
      is_active:        input.isActive,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToDepartment(data as Record<string, unknown>);
}

export async function updateDepartment(
  companyId: string,
  id: string,
  input: UpdateDepartmentInput,
): Promise<void> {
  const { error } = await supabase
    .from('departments')
    .update({
      name:             input.name,
      description:      input.description ?? null,
      head_employee_id: input.headEmployeeId ?? null,
      cost_centre:      input.costCentre ?? null,
      is_active:        input.isActive,
      updated_at:       new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteDepartment(companyId: string, id: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('department_id', id);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error(`Cannot delete: ${count} employee(s) are assigned to this department. Reassign them first.`);
  }
  const { error } = await supabase
    .from('departments')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Job titles ───────────────────────────────────────────────────────────────

export async function listJobTitles(companyId: string): Promise<JobTitle[]> {
  const { data, error } = await supabase
    .from('job_titles')
    .select('*, department:departments(name)')
    .eq('company_id', companyId)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => rowToJobTitle(r as Record<string, unknown>));
}

export async function createJobTitle(
  companyId: string,
  input: CreateJobTitleInput,
): Promise<JobTitle> {
  const { data, error } = await supabase
    .from('job_titles')
    .insert({
      company_id:    companyId,
      name:          input.name,
      department_id: input.departmentId ?? null,
      level:         input.level || null,
      description:   input.description ?? null,
      is_active:     input.isActive,
    })
    .select('*, department:departments(name)')
    .single();
  if (error) throw new Error(error.message);
  return rowToJobTitle(data as Record<string, unknown>);
}

export async function updateJobTitle(
  companyId: string,
  id: string,
  input: UpdateJobTitleInput,
): Promise<void> {
  const { error } = await supabase
    .from('job_titles')
    .update({
      name:          input.name,
      department_id: input.departmentId ?? null,
      level:         input.level || null,
      description:   input.description ?? null,
      is_active:     input.isActive,
      updated_at:    new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteJobTitle(companyId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from('job_titles')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Leave types (admin) ──────────────────────────────────────────────────────

export async function listAllLeaveTypes(companyId: string): Promise<LeaveType[]> {
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => rowToLeaveType(r as Record<string, unknown>));
}

export async function createLeaveType(
  companyId: string,
  input: CreateLeaveTypeInput,
): Promise<LeaveType> {
  const { data, error } = await supabase
    .from('leave_types')
    .insert({
      company_id:   companyId,
      name:         input.name,
      code:         input.code,
      days_per_year:input.daysPerYear,
      default_days: input.defaultDays ?? input.daysPerYear,
      carry_forward:input.carryForward ?? false,
      is_paid:      input.isPaid,
      active:       input.active,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToLeaveType(data as Record<string, unknown>);
}

export async function updateLeaveType(
  companyId: string,
  id: string,
  input: Partial<CreateLeaveTypeInput>,
): Promise<void> {
  const { error } = await supabase
    .from('leave_types')
    .update({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.code !== undefined && { code: input.code }),
      ...(input.daysPerYear !== undefined && { days_per_year: input.daysPerYear, default_days: input.daysPerYear }),
      ...(input.defaultDays !== undefined && { default_days: input.defaultDays }),
      ...(input.carryForward !== undefined && { carry_forward: input.carryForward }),
      ...(input.isPaid !== undefined && { is_paid: input.isPaid }),
      ...(input.active !== undefined && { active: input.active }),
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteLeaveType(companyId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from('leave_types')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Public holidays (admin) ──────────────────────────────────────────────────

export async function listPublicHolidays(companyId: string): Promise<PublicHoliday[]> {
  const { data, error } = await supabase
    .from('public_holidays')
    .select('*')
    .eq('company_id', companyId)
    .order('date');
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => rowToHoliday(r as Record<string, unknown>));
}

export async function createPublicHoliday(
  companyId: string,
  input: CreateHolidayInput,
): Promise<PublicHoliday> {
  const { data, error } = await supabase
    .from('public_holidays')
    .insert({
      company_id:   companyId,
      name:         input.name,
      date:         input.date,
      holiday_type: input.holidayType,
      is_recurring: input.isRecurring,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToHoliday(data as Record<string, unknown>);
}

export async function updatePublicHoliday(
  companyId: string,
  id: string,
  input: UpdateHolidayInput,
): Promise<void> {
  const { error } = await supabase
    .from('public_holidays')
    .update({
      name:         input.name,
      date:         input.date,
      holiday_type: input.holidayType,
      is_recurring: input.isRecurring,
      updated_at:   new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePublicHoliday(companyId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from('public_holidays')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── HRMS roles ───────────────────────────────────────────────────────────────
// Note: hrms_roles and employee_hrms_role_assignments are NOT in the generated
// Database types — hence the (supabase as any) casts below.

export async function listHrmsRoles(companyId: string): Promise<HrmsRole[]> {
  const { data, error } = await (supabase as any)
    .from('hrms_roles')
    .select('*')
    .eq('company_id', companyId)
    .order('authority_level', { ascending: false });
  if (error) throw new Error((error as { message: string }).message);
  return (data ?? []).map((r: Record<string, any>) => rowToHrmsRole(r));
}

export async function createHrmsRole(
  companyId: string,
  input: CreateHrmsRoleInput,
): Promise<HrmsRole> {
  const code = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const { data, error } = await (supabase as any)
    .from('hrms_roles')
    .insert({
      company_id:                  companyId,
      code,
      name:                        input.name,
      category:                    input.category,
      scope:                       input.scope,
      authority_level:             input.authorityLevel,
      description:                 input.description ?? null,
      can_approve_requests:        input.canApproveRequests,
      can_manage_employee_records: input.canManageEmployeeRecords,
      can_view_hrms_reports:       input.canViewHrmsReports,
      is_active:                   input.isActive,
      is_system_default:           false,
    })
    .select('*')
    .single();
  if (error) throw new Error((error as { message: string }).message);
  return rowToHrmsRole(data as Record<string, any>);
}

export async function updateHrmsRole(
  companyId: string,
  id: string,
  input: UpdateHrmsRoleInput,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('hrms_roles')
    .update({
      name:                        input.name,
      category:                    input.category,
      scope:                       input.scope,
      authority_level:             input.authorityLevel,
      description:                 input.description ?? null,
      can_approve_requests:        input.canApproveRequests,
      can_manage_employee_records: input.canManageEmployeeRecords,
      can_view_hrms_reports:       input.canViewHrmsReports,
      is_active:                   input.isActive,
      updated_at:                  new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error((error as { message: string }).message);
}

export async function deleteHrmsRole(companyId: string, id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('hrms_roles')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('is_system_default', false);
  if (error) throw new Error((error as { message: string }).message);
}

export async function listHrmsRoleAssignments(companyId: string): Promise<HrmsRoleAssignment[]> {
  const { data, error } = await (supabase as any)
    .from('employee_hrms_role_assignments')
    .select('*, employees(name), profiles(name)')
    .eq('company_id', companyId);
  if (error) throw new Error((error as { message: string }).message);
  return (data ?? []).map((r: Record<string, any>) => rowToHrmsRoleAssignment(r));
}

export async function replaceHrmsRoleEmployees(
  companyId: string,
  hrmsRoleId: string,
  employeeIds: string[],
): Promise<void> {
  const { error: deleteError } = await (supabase as any)
    .from('employee_hrms_role_assignments')
    .delete()
    .eq('company_id', companyId)
    .eq('hrms_role_id', hrmsRoleId);
  if (deleteError) throw new Error((deleteError as { message: string }).message);
  if (employeeIds.length === 0) return;
  const rows = employeeIds.map(eid => ({
    company_id:    companyId,
    hrms_role_id:  hrmsRoleId,
    employee_id:   eid,
    is_primary:    false,
  }));
  const { error: insertError } = await (supabase as any)
    .from('employee_hrms_role_assignments')
    .insert(rows);
  if (insertError) throw new Error((insertError as { message: string }).message);
}

// ─── Approval flows ───────────────────────────────────────────────────────────

export async function listApprovalFlows(companyId: string): Promise<ApprovalFlow[]> {
  const { data, error } = await supabase
    .from('approval_flows')
    .select('*, approval_steps(*)')
    .eq('company_id', companyId)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => rowToApprovalFlow(r as Record<string, unknown>));
}

export async function createApprovalFlow(
  companyId: string,
  actorId: string,
  input: CreateApprovalFlowInput,
): Promise<ApprovalFlow> {
  const { data: flow, error: flowError } = await supabase
    .from('approval_flows')
    .insert({
      company_id:  companyId,
      name:        input.name,
      description: input.description ?? null,
      entity_type: input.entityType,
      is_active:   input.isActive,
      created_by:  actorId,
    })
    .select('*')
    .single();
  if (flowError) throw new Error(flowError.message);

  if (input.steps.length > 0) {
    const stepRows = input.steps.map((s, idx) => ({
      flow_id:                    flow.id,
      step_order:                 s.stepOrder ?? idx + 1,
      name:                       s.name,
      approver_type:              s.approverType,
      approver_role:              s.approverRole ?? null,
      approver_user_id:           s.approverUserId ?? null,
      fallback_approver_user_id:  s.fallbackApproverUserId ?? null,
      escalation_rule:            s.escalationRule ?? null,
      condition_rule:             s.conditionRule ?? null,
      is_active:                  s.isActive ?? true,
      allow_self_approval:        s.allowSelfApproval ?? false,
    }));
    // approval_steps has extra columns not in generated types — use any cast
    const { error: stepsError } = await (supabase as any)
      .from('approval_steps')
      .insert(stepRows);
    if (stepsError) throw new Error((stepsError as { message: string }).message);
  }

  return listApprovalFlows(companyId).then(flows =>
    flows.find(f => f.id === flow.id) ?? rowToApprovalFlow(flow as Record<string, unknown>),
  );
}

export async function updateApprovalFlow(
  companyId: string,
  id: string,
  input: UpdateApprovalFlowInput,
): Promise<void> {
  const { error } = await supabase
    .from('approval_flows')
    .update({
      name:        input.name,
      description: input.description ?? null,
      entity_type: input.entityType,
      is_active:   input.isActive,
      updated_at:  new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);

  // Replace steps
  // approval_steps has extra columns not in generated types — use any cast
  const { error: deleteStepsError } = await (supabase as any)
    .from('approval_steps')
    .delete()
    .eq('flow_id', id);
  if (deleteStepsError) throw new Error((deleteStepsError as { message: string }).message);

  if (input.steps.length > 0) {
    const stepRows = input.steps.map((s, idx) => ({
      flow_id:                    id,
      step_order:                 s.stepOrder ?? idx + 1,
      name:                       s.name,
      approver_type:              s.approverType,
      approver_role:              s.approverRole ?? null,
      approver_user_id:           s.approverUserId ?? null,
      fallback_approver_user_id:  s.fallbackApproverUserId ?? null,
      escalation_rule:            s.escalationRule ?? null,
      condition_rule:             s.conditionRule ?? null,
      is_active:                  s.isActive ?? true,
      allow_self_approval:        s.allowSelfApproval ?? false,
    }));
    // approval_steps has extra columns not in generated types — use any cast
    const { error: stepsError } = await (supabase as any)
      .from('approval_steps')
      .insert(stepRows);
    if (stepsError) throw new Error((stepsError as { message: string }).message);
  }
}

export async function deleteApprovalFlow(companyId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from('approval_flows')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function toggleApprovalFlowActive(
  companyId: string,
  id: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('approval_flows')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(error.message);
}
