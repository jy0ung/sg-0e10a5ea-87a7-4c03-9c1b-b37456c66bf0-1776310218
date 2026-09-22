import * as pkg from '@flc/hrms-services';
import { logUserAction, type UserActionType, type UserActionMetadata } from '@/services/auditService';
import { inviteUser, deleteInvitedUser } from '@flc/auth';
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
  if (input.role === 'portal_admin' || input.role === 'portal_manager' || input.role === 'portal_staff') {
    return { error: 'Select a workforce role when creating an employee.' };
  }
  try {
    await pkg.createEmployeeRecord({
      id: input.id,
      companyId: input.companyId,
      name: input.name,
      role: input.role,
      branchId: input.branchId ?? null,
      managerId: input.managerId ?? null,
      staffCode: input.staffCode ?? null,
      workEmail: input.email || null,
      icNo: input.icNo ?? null,
      contactNo: input.contactNo ?? null,
      joinDate: input.joinDate ?? null,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  if (input.email && !input.email.endsWith('@company.local')) {
    const inviteResult = await inviteUser({
      email:            input.email,
      name:             input.name,
      role:             input.role,
      companyId:        input.companyId,
      branchId:         input.branchId ?? '',
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
    if (!companyId) return { error: 'Company is required for Employee mutation.' };
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
  try {
    const linkedProfile = await pkg.getLinkedEmployeeProfile(employeeId, companyId);

    if (linkedProfile && linkedProfile.status !== 'pending') {
      return {
        error:
          'Cannot hard-delete an employee with a linked user account. Mark the employee as resigned or manage the user account separately.',
      };
    }

    // Database history constraints are evaluated before any auth cleanup.
    await pkg.deleteEmployeeRecord(employeeId, companyId);

    if (actorId) {
      void logUserAction(actorId, 'delete', 'employee', employeeId, {});
    }

    if (linkedProfile?.status === 'pending') {
      const { error: authCleanupError } = await deleteInvitedUser(linkedProfile.id);
      if (authCleanupError) {
        try {
          await pkg.disableEmployeeProfileAccess(linkedProfile.id);
        } catch (disableError) {
          return {
            error:
              `Employee deleted, but pending user cleanup failed (${authCleanupError}) and the account could not be disabled: ${disableError instanceof Error ? disableError.message : String(disableError)}`,
          };
        }

        return {
          error:
            `Employee deleted, but pending user cleanup failed: ${authCleanupError}. The account was disabled; remove it from User Management.`,
        };
      }
    }

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function reInviteEmployee(
  employee: { id: string; email: string; name: string; role: AppRole; branchId?: string | null },
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
    branchId:         employee.branchId ?? '',
    employeeId:       employee.id,
    portalAccessOnly: true,
  });

  if (!result.error && actorId) {
    void logUserAction(actorId, 're_invite' as unknown as UserActionType, 'employee', employee.id,
      { email: employee.email } as unknown as UserActionMetadata);
  }
  return result;
}
