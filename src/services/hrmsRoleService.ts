/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import type {
  CreateHrmsRoleInput,
  HrmsRole,
  HrmsRoleAssignment,
  UpdateHrmsRoleInput,
} from '@/types';

// hrms_roles and employee_hrms_role_assignments are not in the generated Database types.
const db = supabase as any;

function toRoleCode(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function rowToHrmsRole(row: Record<string, any>): HrmsRole {
  return {
    id: String(row.id ?? ''),
    companyId: String(row.company_id ?? ''),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    category: row.category ?? 'custom',
    scope: row.scope ?? 'company',
    authorityLevel: Number(row.authority_level ?? 50),
    description: row.description ? String(row.description) : undefined,
    canApproveRequests: Boolean(row.can_approve_requests),
    canManageEmployeeRecords: Boolean(row.can_manage_employee_records),
    canViewHrmsReports: Boolean(row.can_view_hrms_reports),
    isActive: Boolean(row.is_active),
    isSystemDefault: Boolean(row.is_system_default),
    assignedUserCount: Number(row.assigned_user_count ?? 0),
    lastUpdatedByName: row.updated_by_profile?.name ? String(row.updated_by_profile.name) : undefined,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function rowToAssignment(row: Record<string, any>): HrmsRoleAssignment {
  return {
    id: String(row.id ?? ''),
    companyId: String(row.company_id ?? ''),
    hrmsRoleId: String(row.hrms_role_id ?? ''),
    employeeId: row.employee_id ? String(row.employee_id) : undefined,
    profileId: row.profile_id ? String(row.profile_id) : undefined,
    employeeName: row.employee?.name ? String(row.employee.name) : undefined,
    profileName: row.profile?.name ? String(row.profile.name) : undefined,
    isPrimary: Boolean(row.is_primary),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function listHrmsRoles(companyId: string): Promise<{ data: HrmsRole[]; error: string | null }> {
  const { data, error } = await db
    .from('hrms_roles')
    .select('*, updated_by_profile:profiles!hrms_roles_updated_by_fkey(name)')
    .eq('company_id', companyId)
    .order('authority_level', { ascending: true })
    .order('name');
  if (error) return { data: [], error: error.message };

  const roleRows = (data ?? []) as Record<string, any>[];
  const roleIds = roleRows.map(row => String(row.id));
  const counts = new Map<string, number>();
  if (roleIds.length) {
    const { data: assignments, error: countError } = await db
      .from('employee_hrms_role_assignments')
      .select('hrms_role_id')
      .eq('company_id', companyId)
      .in('hrms_role_id', roleIds);
    if (countError) return { data: [], error: countError.message };
    for (const assignment of assignments ?? []) {
      const roleId = String(assignment.hrms_role_id);
      counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
    }
  }

  return {
    data: roleRows.map(row => rowToHrmsRole({ ...row, assigned_user_count: counts.get(String(row.id)) ?? 0 })),
    error: null,
  };
}

export async function createHrmsRole(
  companyId: string,
  actorId: string,
  input: CreateHrmsRoleInput,
): Promise<{ data: HrmsRole | null; error: string | null }> {
  const code = toRoleCode(input.name);
  if (!code) return { data: null, error: 'Role name must contain letters or numbers.' };
  const { data, error } = await db
    .from('hrms_roles')
    .insert({
      company_id: companyId,
      code,
      name: input.name.trim(),
      category: input.category,
      scope: input.scope,
      authority_level: input.authorityLevel,
      description: input.description?.trim() || null,
      can_approve_requests: input.canApproveRequests,
      can_manage_employee_records: input.canManageEmployeeRecords,
      can_view_hrms_reports: input.canViewHrmsReports,
      is_active: input.isActive,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  void logUserAction(actorId, 'create', 'hrms_role', String(data.id), { name: input.name });
  return { data: rowToHrmsRole(data as Record<string, any>), error: null };
}

export async function updateHrmsRole(
  companyId: string,
  roleId: string,
  actorId: string,
  input: UpdateHrmsRoleInput,
): Promise<{ error: string | null }> {
  const { error } = await db
    .from('hrms_roles')
    .update({
      name: input.name.trim(),
      category: input.category,
      scope: input.scope,
      authority_level: input.authorityLevel,
      description: input.description?.trim() || null,
      can_approve_requests: input.canApproveRequests,
      can_manage_employee_records: input.canManageEmployeeRecords,
      can_view_hrms_reports: input.canViewHrmsReports,
      is_active: input.isActive,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', roleId);
  if (!error) void logUserAction(actorId, 'update', 'hrms_role', roleId, { name: input.name });
  return { error: error?.message ?? null };
}

export async function listHrmsRoleAssignments(
  companyId: string,
  roleId: string,
): Promise<{ data: HrmsRoleAssignment[]; error: string | null }> {
  const { data, error } = await db
    .from('employee_hrms_role_assignments')
    .select('*, employee:employees!employee_hrms_role_assignments_employee_id_fkey(name), profile:profiles!employee_hrms_role_assignments_profile_id_fkey(name)')
    .eq('company_id', companyId)
    .eq('hrms_role_id', roleId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((row: Record<string, any>) => rowToAssignment(row)), error: null };
}

export async function replaceHrmsRoleEmployeeAssignments(
  companyId: string,
  roleId: string,
  actorId: string,
  employeeIds: string[],
): Promise<{ error: string | null }> {
  const uniqueEmployeeIds = [...new Set(employeeIds.filter(Boolean))];
  const { error: deleteError } = await db
    .from('employee_hrms_role_assignments')
    .delete()
    .eq('company_id', companyId)
    .eq('hrms_role_id', roleId);
  if (deleteError) return { error: deleteError.message };

  if (uniqueEmployeeIds.length) {
    const { error: insertError } = await db
      .from('employee_hrms_role_assignments')
      .insert(uniqueEmployeeIds.map((employeeId, index) => ({
        company_id: companyId,
        hrms_role_id: roleId,
        employee_id: employeeId,
        is_primary: index === 0,
        assigned_by: actorId,
      })));
    if (insertError) return { error: insertError.message };
  }

  void logUserAction(actorId, 'update', 'hrms_role_assignments', roleId, { assignedCount: uniqueEmployeeIds.length });
  return { error: null };
}

export async function userHasHrmsRole(
  companyId: string,
  profileId: string,
  hrmsRoleId: string,
): Promise<{ data: boolean; error: string | null }> {
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('employee_id')
    .eq('id', profileId)
    .maybeSingle();
  if (profileError) return { data: false, error: profileError.message };

  const employeeId = profile?.employee_id ? String(profile.employee_id) : null;
  let query = db
    .from('employee_hrms_role_assignments')
    .select('id')
    .eq('company_id', companyId)
    .eq('hrms_role_id', hrmsRoleId)
    .limit(1);

  if (employeeId) {
    query = query.or(`profile_id.eq.${profileId},employee_id.eq.${employeeId}`);
  } else {
    query = query.eq('profile_id', profileId);
  }

  const { data, error } = await query;
  if (error) return { data: false, error: error.message };
  return { data: (data ?? []).length > 0, error: null };
}

export async function hrmsRoleHasAssignments(
  companyId: string,
  hrmsRoleId: string,
): Promise<{ data: boolean; error: string | null }> {
  const { data, error } = await db
    .from('employee_hrms_role_assignments')
    .select('id')
    .eq('company_id', companyId)
    .eq('hrms_role_id', hrmsRoleId)
    .limit(1);
  if (error) return { data: false, error: error.message };
  return { data: (data ?? []).length > 0, error: null };
}
