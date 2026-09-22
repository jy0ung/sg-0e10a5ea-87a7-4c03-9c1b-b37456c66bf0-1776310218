import {
  createHrmsRole as createCanonicalHrmsRole,
  hrmsRoleHasAssignments as canonicalHrmsRoleHasAssignments,
  listAssignedHrmsRoles as listCanonicalAssignedHrmsRoles,
  listHrmsRoleAssignments as listCanonicalHrmsRoleAssignments,
  listHrmsRoles as listCanonicalHrmsRoles,
  replaceHrmsRoleEmployeeAssignments as replaceCanonicalHrmsRoleEmployeeAssignments,
  updateHrmsRole as updateCanonicalHrmsRole,
  userHasHrmsRole as canonicalUserHasHrmsRole,
} from '@flc/hrms-services';
import { logUserAction } from '@/services/auditService';
import type {
  CreateHrmsRoleInput,
  HrmsRole,
  HrmsRoleAssignment,
  UpdateHrmsRoleInput,
} from '@/types';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function listHrmsRoles(
  companyId: string,
): Promise<{ data: HrmsRole[]; error: string | null }> {
  try {
    return { data: await listCanonicalHrmsRoles(companyId), error: null };
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
}

export async function createHrmsRole(
  companyId: string,
  actorId: string,
  input: CreateHrmsRoleInput,
): Promise<{ data: HrmsRole | null; error: string | null }> {
  try {
    const data = await createCanonicalHrmsRole(companyId, actorId, input);
    void logUserAction(actorId, 'create', 'hrms_role', data.id, { name: input.name });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
}

export async function updateHrmsRole(
  companyId: string,
  roleId: string,
  actorId: string,
  input: UpdateHrmsRoleInput,
): Promise<{ error: string | null }> {
  try {
    await updateCanonicalHrmsRole(companyId, roleId, actorId, input);
    void logUserAction(actorId, 'update', 'hrms_role', roleId, { name: input.name });
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function listHrmsRoleAssignments(
  companyId: string,
  roleId: string,
): Promise<{ data: HrmsRoleAssignment[]; error: string | null }> {
  try {
    return {
      data: await listCanonicalHrmsRoleAssignments(companyId, roleId),
      error: null,
    };
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
}

export async function listAssignedHrmsRoles(
  companyId: string,
  profileId: string,
  employeeId?: string | null,
): Promise<{ data: HrmsRole[]; error: string | null }> {
  try {
    return {
      data: await listCanonicalAssignedHrmsRoles(companyId, profileId, employeeId),
      error: null,
    };
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
}

export async function replaceHrmsRoleEmployeeAssignments(
  companyId: string,
  roleId: string,
  actorId: string,
  employeeIds: string[],
): Promise<{ error: string | null }> {
  const uniqueEmployeeIds = [...new Set(employeeIds.filter(Boolean))];

  try {
    await replaceCanonicalHrmsRoleEmployeeAssignments(
      companyId,
      roleId,
      uniqueEmployeeIds,
    );
    void logUserAction(actorId, 'update', 'hrms_role_assignments', roleId, {
      assignedCount: uniqueEmployeeIds.length,
    });
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function userHasHrmsRole(
  companyId: string,
  profileId: string,
  hrmsRoleId: string,
): Promise<{ data: boolean; error: string | null }> {
  try {
    return {
      data: await canonicalUserHasHrmsRole(companyId, profileId, hrmsRoleId),
      error: null,
    };
  } catch (error) {
    return { data: false, error: errorMessage(error) };
  }
}

export async function hrmsRoleHasAssignments(
  companyId: string,
  hrmsRoleId: string,
): Promise<{ data: boolean; error: string | null }> {
  try {
    return {
      data: await canonicalHrmsRoleHasAssignments(companyId, hrmsRoleId),
      error: null,
    };
  } catch (error) {
    return { data: false, error: errorMessage(error) };
  }
}
