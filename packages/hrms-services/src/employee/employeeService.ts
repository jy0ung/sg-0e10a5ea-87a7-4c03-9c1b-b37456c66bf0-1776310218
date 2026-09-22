import { DEFAULT_APP_ROLE, type Employee, type EmployeeStatus, type AppRole } from '@flc/types';
import type { EmployeeRow } from '@flc/supabase';
import { supabase } from '../shared/supabaseClient';

// ─── Constants ────────────────────────────────────────────────────────────────

export const DIRECTORY_EMPLOYEE_SELECT =
  'id, company_id, branch_id, manager_employee_id, primary_role, status, ' +
  'staff_code, name, work_email, personal_email, ic_no, contact_no, join_date, ' +
  'resign_date, avatar_url, department_id, job_title_id, ' +
  'department:departments!employees_department_id_fkey(name), ' +
  'job_title:job_titles!employees_job_title_id_fkey(name)';

// ─── Row type ─────────────────────────────────────────────────────────────────
// DIRECTORY_EMPLOYEE_SELECT includes joined department and job_title objects.
// Define the shape explicitly since the join columns are not in the base Row.
type DirectoryEmployeeRow = Pick<EmployeeRow,
  'id' | 'company_id' | 'branch_id' | 'manager_employee_id' | 'primary_role' | 'status' |
  'staff_code' | 'name' | 'work_email' | 'personal_email' | 'ic_no' | 'contact_no' |
  'join_date' | 'resign_date' | 'avatar_url' | 'department_id' | 'job_title_id'
> & {
  department: { name: string } | null;
  job_title:  { name: string } | null;
  // Legacy: some callers may pass a row augmented with resolved manager info.
  manager_id?: string | null;
  managerName?: string | null;
};

// ─── Row mapper ───────────────────────────────────────────────────────────────

export function rowToDirectoryEmployee(row: DirectoryEmployeeRow): Employee {
  return {
    id:             String(row.id ?? ''),
    email:          String(row.work_email ?? row.personal_email ?? ''),
    name:           String(row.name ?? ''),
    role:           (row.primary_role as AppRole) ?? DEFAULT_APP_ROLE,
    companyId:      String(row.company_id ?? ''),
    branchId:       row.branch_id ? String(row.branch_id) : undefined,
    managerId:      row.manager_employee_id
      ? String(row.manager_employee_id)
      : row.manager_id ? String(row.manager_id) : undefined,
    staffCode:      row.staff_code ? String(row.staff_code) : undefined,
    icNo:           row.ic_no ? String(row.ic_no) : undefined,
    contactNo:      row.contact_no ? String(row.contact_no) : undefined,
    joinDate:       row.join_date ? String(row.join_date) : undefined,
    resignDate:     row.resign_date ? String(row.resign_date) : undefined,
    status:         (row.status as EmployeeStatus) ?? 'active',
    avatarUrl:      row.avatar_url ? String(row.avatar_url) : undefined,
    departmentId:   row.department_id ? String(row.department_id) : undefined,
    departmentName: row.department
      ? String(row.department?.name ?? '')
      : undefined,
    jobTitleId:     row.job_title_id ? String(row.job_title_id) : undefined,
    jobTitleName:   row.job_title
      ? String(row.job_title?.name ?? '')
      : undefined,
    managerName:    row.managerName ? String(row.managerName) : undefined,
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Returns all employees in the company directory, ordered by name.
 * Throws on database error.
 */
export async function listEmployeeDirectory(companyId: string): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('employees')
    .select(DIRECTORY_EMPLOYEE_SELECT)
    .eq('company_id', companyId)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => rowToDirectoryEmployee(row as unknown as DirectoryEmployeeRow));
}

export interface CreateEmployeeRecordInput {
  id: string;
  companyId: string;
  name: string;
  role: AppRole;
  branchId?: string | null;
  managerId?: string | null;
  staffCode?: string | null;
  workEmail?: string | null;
  icNo?: string | null;
  contactNo?: string | null;
  joinDate?: string | null;
  departmentId?: string | null;
  jobTitleId?: string | null;
}

export interface UpdateEmployeeInput {
  name?: string;
  role?: AppRole;
  branchId?: string | null;
  managerId?: string | null;
  staffCode?: string | null;
  icNo?: string | null;
  contactNo?: string | null;
  joinDate?: string | null;
  resignDate?: string | null;
  status?: EmployeeStatus;
  departmentId?: string | null;
  jobTitleId?: string | null;
}

interface EmployeeMutationRpc {
  rpc(
    name: 'mutate_employee_with_assignments',
    args: {
      p_company_id: string;
      p_employee_id: string;
      p_create: boolean;
      p_changes: Record<string, unknown>;
    },
  ): Promise<{
    data: string | null;
    error: { message: string } | null;
  }>;
}

const employeeMutationRpc = supabase as unknown as EmployeeMutationRpc;

function compactChanges(
  entries: Array<[string, unknown]>,
): Record<string, unknown> {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

async function mutateEmployeeWithAssignments(
  companyId: string,
  employeeId: string,
  create: boolean,
  changes: Record<string, unknown>,
): Promise<void> {
  if (!companyId) throw new Error('Company is required for Employee mutation.');

  const { error } = await employeeMutationRpc.rpc('mutate_employee_with_assignments', {
    p_company_id: companyId,
    p_employee_id: employeeId,
    p_create: create,
    p_changes: changes,
  });

  if (error) throw new Error(error.message);
}

/**
 * Creates a canonical Employee through the database-owned mutation command.
 * The command keeps primary_role and the canonical Sales Advisor assignment
 * consistent in the same transaction.
 */
export async function createEmployeeRecord(
  input: CreateEmployeeRecordInput,
): Promise<void> {
  await mutateEmployeeWithAssignments(
    input.companyId,
    input.id,
    true,
    compactChanges([
      ['name', input.name],
      ['primary_role', input.role],
      ['branch_id', input.branchId],
      ['manager_employee_id', input.managerId],
      ['staff_code', input.staffCode],
      ['work_email', input.workEmail],
      ['ic_no', input.icNo],
      ['contact_no', input.contactNo],
      ['join_date', input.joinDate],
      ['status', 'active'],
      ['department_id', input.departmentId],
      ['job_title_id', input.jobTitleId],
    ]),
  );
}

/**
 * Updates an Employee through the database-owned mutation command.
 * Role changes and Sales Advisor assignment changes commit atomically.
 * Note: audit logging is the caller's responsibility.
 */
export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
  companyId?: string,
): Promise<void> {
  if (!companyId) throw new Error('Company is required for Employee mutation.');

  await mutateEmployeeWithAssignments(
    companyId,
    id,
    false,
    compactChanges([
      ['name', input.name],
      ['primary_role', input.role],
      ['branch_id', input.branchId],
      ['manager_employee_id', input.managerId],
      ['staff_code', input.staffCode],
      ['ic_no', input.icNo],
      ['contact_no', input.contactNo],
      ['join_date', input.joinDate],
      ['resign_date', input.resignDate],
      ['status', input.status],
      ['department_id', input.departmentId],
      ['job_title_id', input.jobTitleId],
    ]),
  );
}

/**
 * Batch-resolves salesman names to profile IDs for a given company.
 * Returns a Map from original name string → profile UUID.
 */
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

  const byName = new Map<string, string>();
  for (const row of data ?? []) {
    byName.set(String(row.name ?? '').trim().toLowerCase(), String(row.id));
  }

  const result = new Map<string, string>();
  for (const original of names) {
    const id = byName.get(original.trim().toLowerCase());
    if (id) result.set(original, id);
  }
  return result;
}

export interface LinkedEmployeeProfile {
  id: string;
  status: string;
  companyId: string | null;
  accessScope: string | null;
}

/**
 * Resolves the single login Profile linked to a canonical Employee.
 * No mutation is performed.
 */
export async function getLinkedEmployeeProfile(
  employeeId: string,
  companyId: string,
): Promise<LinkedEmployeeProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, status, company_id, access_scope')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const profileCompanyId = data.company_id ? String(data.company_id) : null;
  const accessScope = data.access_scope ? String(data.access_scope) : null;
  if (
    profileCompanyId !== null
    && profileCompanyId !== companyId
    && accessScope !== 'global'
  ) {
    throw new Error('Linked user Profile does not belong to the Employee company.');
  }

  return {
    id: String(data.id),
    status: String(data.status ?? ''),
    companyId: profileCompanyId,
    accessScope,
  };
}

/**
 * Hard-deletes an Employee only when database history constraints allow it.
 * Historical HR tables use ON DELETE RESTRICT; this helper translates the
 * foreign-key violation into the lifecycle guidance shown by the UI.
 */
export async function deleteEmployeeRecord(
  employeeId: string,
  companyId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('employees')
    .delete()
    .eq('id', employeeId)
    .eq('company_id', companyId)
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23503') {
      throw new Error(
        'Cannot delete this employee because HR history exists. Mark the employee as resigned instead.',
      );
    }
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Employee was not found in the requested company.');
  }
}

/**
 * Safety fallback when post-delete auth cleanup fails.
 * The Employee FK has already SET NULL on profiles.employee_id.
 */
export async function disableEmployeeProfileAccess(
  profileId: string,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'inactive', employee_id: null })
    .eq('id', profileId);
  if (error) throw new Error(error.message);
}

