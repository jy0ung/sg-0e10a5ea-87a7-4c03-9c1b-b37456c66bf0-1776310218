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

async function syncSalesAdvisorAssignment(
  employeeId: string,
  companyId: string,
  role: AppRole,
): Promise<void> {
  if (role === 'sales') {
    const { error } = await supabase
      .from('employee_module_assignments')
      .upsert({
        company_id:      companyId,
        employee_id:     employeeId,
        module_key:      'sales',
        assignment_role: 'sales_advisor',
        is_primary:      true,
        active:          true,
        source:          'manual',
      }, { onConflict: 'employee_id,module_key,assignment_role' });
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from('employee_module_assignments')
    .update({ active: false, is_primary: false })
    .eq('employee_id', employeeId)
    .eq('module_key', 'sales')
    .eq('assignment_role', 'sales_advisor');
  if (error) throw new Error(error.message);
}

/**
 * Updates an employee record and syncs the sales module assignment if the
 * primary role changed.
 * Note: audit logging is the caller's responsibility.
 * Throws on database error or invalid transition.
 */
export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
  companyId?: string,
): Promise<void> {
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

  let updateQuery = supabase.from('employees').update(payload as never).eq('id', id);
  if (companyId) updateQuery = updateQuery.eq('company_id', companyId);
  const { error } = await updateQuery;
  if (error) throw new Error(error.message);

  if (input.role !== undefined) {
    let q = supabase.from('employees').select('company_id').eq('id', id);
    if (companyId) q = q.eq('company_id', companyId);
    const { data: employeeRow, error: empError } = await q.single();
    if (empError) throw new Error(empError.message);
    if (employeeRow?.company_id) {
      await syncSalesAdvisorAssignment(id, String(employeeRow.company_id), input.role);
    }
  }
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
  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', employeeId)
    .eq('company_id', companyId);

  if (!error) return;

  if (error.code === '23503') {
    throw new Error(
      'Cannot delete this employee because HR or business history exists. Mark the employee as resigned instead.',
    );
  }

  throw new Error(error.message);
}

/**
 * Safety fallback when post-delete auth cleanup fails.
 * The Employee FK has already SET NULL on profiles.employee_id.
 */
export async function disableEmployeeProfileAccess(
  profileId: string,
  companyId: string | null,
): Promise<void> {
  let query = supabase
    .from('profiles')
    .update({ status: 'inactive', employee_id: null })
    .eq('id', profileId);

  if (companyId) query = query.eq('company_id', companyId);

  const { error } = await query;
  if (error) throw new Error(error.message);
}

