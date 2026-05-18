import * as pkg from '@flc/hrms-services';
import { logUserAction } from '@/services/auditService';
import { inviteUser, deleteInvitedUser } from '@/services/profileService';
import { Employee, EmployeeStatus, AppRole } from '@/types';
import { supabase } from '@/integrations/supabase/client';

export async function listEmployeeDirectory(companyId: string): Promise<{ data: Employee[]; error: string | null }> {
  try {
    const data = await pkg.listEmployeeDirectory(companyId);
    return { data: data as Employee[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export interface CreateEmployeeInput {
  id: string;
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

  if (input.email && !input.email.endsWith('@company.local')) {
    const inviteResult = await inviteUser({
      email:            input.email,
      name:             input.name,
      role:             input.role,
      companyId:        input.companyId,
      employeeId:       input.id,
      portalAccessOnly: true,
    });
    if (inviteResult.error) return { error: `Employee created but invite failed: ${inviteResult.error}` };
  }

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

export async function updateEmployee(id: string, input: UpdateEmployeeInput, actorId?: string, companyId?: string): Promise<{ error: string | null }> {
  try {
    await pkg.updateEmployee(id, input, companyId);
    if (actorId) {
      void logUserAction(actorId, 'update', 'employee', id, { changes: input as unknown as import('@/integrations/supabase/types').Json });
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resolveNamesToIds(companyId: string, names: string[]): Promise<Map<string, string>> {
  return pkg.resolveNamesToIds(companyId, names);
}

export async function deleteEmployee(
  employeeId: string,
  companyId: string,
  actorId?: string,
): Promise<{ error: string | null }> {
  // 1. Find linked profile (if any)
  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, status')
    .eq('employee_id', employeeId)
    .eq('company_id', companyId)
    .limit(1);
  const profile = (profileRows ?? [])[0] as { id: string; status: string } | undefined;

  // 2. Handle linked auth user before deleting the employee record
  if (profile) {
    if (profile.status === 'pending') {
      // Never signed in — hard-delete the auth user
      const { error: delAuthErr } = await deleteInvitedUser(profile.id);
      if (delAuthErr) return { error: `Could not remove pending invite: ${delAuthErr}` };
    } else {
      // Already signed in — just unlink employee_id from their profile
      await supabase.from('profiles').update({ employee_id: null }).eq('id', profile.id);
    }
  }

  // 3. Delete the employee row
  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', employeeId)
    .eq('company_id', companyId);

  if (error) {
    return {
      error: error.code === '23503'
        ? 'Cannot delete: this employee has linked records (leave requests, payroll, etc.). Mark them as resigned instead.'
        : error.message,
    };
  }

  if (actorId) void logUserAction(actorId, 'delete', 'employee', employeeId, {});
  return { error: null };
}

export async function reInviteEmployee(
  employee: { id: string; email: string; name: string; role: AppRole },
  companyId: string,
  actorId?: string,
): Promise<{ error: string | null }> {
  if (!employee.email || employee.email.endsWith('@company.local')) {
    return { error: 'No valid email address on record for this employee.' };
  }

  // Check if they already have an active (non-pending) account
  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, status')
    .eq('employee_id', employee.id)
    .eq('company_id', companyId)
    .limit(1);
  const profile = (profileRows ?? [])[0] as { id: string; status: string } | undefined;

  if (profile && profile.status !== 'pending') {
    return { error: 'This employee already has an active account and can sign in.' };
  }

  const result = await inviteUser({
    email:            employee.email,
    name:             employee.name,
    role:             employee.role,
    companyId,
    employeeId:       employee.id,
    portalAccessOnly: true,
  });

  if (!result.error && actorId) {
    void logUserAction(actorId, 're_invite', 'employee', employee.id,
      { email: employee.email } as unknown as import('@/integrations/supabase/types').Json);
  }
  return result;
}
