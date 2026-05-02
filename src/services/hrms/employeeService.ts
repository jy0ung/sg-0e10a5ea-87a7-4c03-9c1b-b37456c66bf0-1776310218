import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import { Employee, EmployeeStatus, AppRole } from '@/types';
import { DIRECTORY_EMPLOYEE_SELECT, rowToDirectoryEmployee } from './shared';

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
  managerId?: string | null;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput, actorId?: string, companyId?: string): Promise<{ error: string | null }> {
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

  let updateQuery = supabase.from('employees').update(payload).eq('id', id);
  if (companyId) updateQuery = updateQuery.eq('company_id', companyId);
  const { error } = await updateQuery;
  if (error) return { error: error.message };

  if (input.role !== undefined) {
    let employeeQuery = supabase
      .from('employees')
      .select('company_id')
      .eq('id', id);
    if (companyId) employeeQuery = employeeQuery.eq('company_id', companyId);
    const { data: employeeRow, error: employeeError } = await employeeQuery.single();
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
