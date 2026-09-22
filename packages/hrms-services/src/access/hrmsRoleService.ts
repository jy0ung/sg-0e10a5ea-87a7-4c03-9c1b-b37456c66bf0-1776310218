/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Canonical HRMS organisational-role data access.
 *
 * HRMS roles are separate from application roles. Employee is the canonical
 * workforce identity; Profile is retained only as the authenticated identity
 * bridge required by compatibility callers and workflow routing.
 */
import type {
  CreateHrmsRoleInput,
  HrmsRole,
  HrmsRoleAssignment,
  UpdateHrmsRoleInput,
} from '@flc/types';
import { supabase } from '../shared/supabaseClient';

const db = supabase as any;

function toRoleCode(name: string): string {
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
    lastUpdatedByName: row.updated_by_profile?.name
      ? String(row.updated_by_profile.name)
      : undefined,
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

export async function listHrmsRoles(companyId: string): Promise<HrmsRole[]> {
  const { data, error } = await db
    .from('hrms_roles')
    .select('*, updated_by_profile:profiles!hrms_roles_updated_by_fkey(name)')
    .eq('company_id', companyId)
    .order('authority_level', { ascending: true })
    .order('name');
  if (error) throw new Error(error.message);

  const roleRows = (data ?? []) as Record<string, any>[];
  const roleIds = roleRows.map(row => String(row.id));
  const counts = new Map<string, number>();

  if (roleIds.length > 0) {
    const { data: assignments, error: countError } = await db
      .from('employee_hrms_role_assignments')
      .select('hrms_role_id')
      .eq('company_id', companyId)
      .in('hrms_role_id', roleIds);
    if (countError) throw new Error(countError.message);

    for (const assignment of assignments ?? []) {
      const roleId = String(assignment.hrms_role_id);
      counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
    }
  }

  return roleRows.map(row => rowToHrmsRole({
    ...row,
    assigned_user_count: counts.get(String(row.id)) ?? 0,
  }));
}

export async function createHrmsRole(
  companyId: string,
  actorProfileId: string,
  input: CreateHrmsRoleInput,
): Promise<HrmsRole> {
  const code = toRoleCode(input.name);
  if (!code) {
    throw new Error('Role name must contain letters or numbers.');
  }

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
      is_system_default: false,
      created_by: actorProfileId,
      updated_by: actorProfileId,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  return rowToHrmsRole(data as Record<string, any>);
}

export async function updateHrmsRole(
  companyId: string,
  roleId: string,
  actorProfileId: string,
  input: UpdateHrmsRoleInput,
): Promise<void> {
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
      updated_by: actorProfileId,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', roleId);
  if (error) throw new Error(error.message);
}

export async function listHrmsRoleAssignments(
  companyId: string,
  roleId: string,
): Promise<HrmsRoleAssignment[]> {
  const { data, error } = await db
    .from('employee_hrms_role_assignments')
    .select(
      '*, employee:employees!employee_hrms_role_assignments_employee_id_fkey(name), profile:profiles!employee_hrms_role_assignments_profile_id_fkey(name)',
    )
    .eq('company_id', companyId)
    .eq('hrms_role_id', roleId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: Record<string, any>) => rowToAssignment(row));
}

export async function listAssignedHrmsRoles(
  companyId: string,
  profileId: string,
  employeeId?: string | null,
): Promise<HrmsRole[]> {
  let query = db
    .from('employee_hrms_role_assignments')
    .select(
      'hrms_role:hrms_roles!employee_hrms_role_assignments_hrms_role_id_fkey(*)',
    )
    .eq('company_id', companyId);

  query = employeeId
    ? query.or(`profile_id.eq.${profileId},employee_id.eq.${employeeId}`)
    : query.eq('profile_id', profileId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const roles = (data ?? [])
    .map((row: Record<string, any>) => row.hrms_role as Record<string, any> | null)
    .filter(Boolean)
    .map((row: Record<string, any>) => rowToHrmsRole(row));

  return roles.filter(
    (role, index) => roles.findIndex(candidate => candidate.id === role.id) === index,
  );
}

export async function replaceHrmsRoleEmployeeAssignments(
  companyId: string,
  roleId: string,
  employeeIds: string[],
): Promise<void> {
  const uniqueEmployeeIds = [...new Set(employeeIds.filter(Boolean))];

  const { error } = await db.rpc('replace_hrms_role_employee_assignments', {
    p_company_id: companyId,
    p_hrms_role_id: roleId,
    p_employee_ids: uniqueEmployeeIds,
  });
  if (error) throw new Error(error.message);
}

export async function userHasHrmsRole(
  companyId: string,
  profileId: string,
  hrmsRoleId: string,
): Promise<boolean> {
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('employee_id')
    .eq('id', profileId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const employeeId = profile?.employee_id ? String(profile.employee_id) : null;
  let query = db
    .from('employee_hrms_role_assignments')
    .select('id')
    .eq('company_id', companyId)
    .eq('hrms_role_id', hrmsRoleId)
    .limit(1);

  query = employeeId
    ? query.or(`profile_id.eq.${profileId},employee_id.eq.${employeeId}`)
    : query.eq('profile_id', profileId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function hrmsRoleHasAssignments(
  companyId: string,
  hrmsRoleId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('employee_hrms_role_assignments')
    .select('id')
    .eq('company_id', companyId)
    .eq('hrms_role_id', hrmsRoleId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
