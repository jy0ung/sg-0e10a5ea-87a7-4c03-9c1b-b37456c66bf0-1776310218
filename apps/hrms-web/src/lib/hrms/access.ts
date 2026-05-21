import type { HrmsRole, HrmsRoleCategory } from '@/types';

export type HrmsRouteAccessKey =
  | 'dashboard'
  | 'profile'
  | 'leave'
  | 'leaveCalendar'
  | 'attendance'
  | 'approvals'
  | 'appraisals'
  | 'announcements'
  | 'employees'
  | 'payroll'
  | 'settings'
  | 'leaveQuota';

export type HrmsApproverIdentity = {
  id?: string | null;
  hrmsRoleIds?: string[];
  hrmsRoleCodes?: string[];
  canApproveRequests?: boolean;
} | null | undefined;

type DerivedHrmsAccess = {
  roles: HrmsRole[];
  roleIds: string[];
  roleCodes: string[];
  roleNames: string[];
  primaryRole: HrmsRole | null;
  primaryRoleLabel: string | null;
  hasSelfServiceAccess: boolean;
  canApproveRequests: boolean;
  canAccessAttendance: boolean;
  canManageAttendance: boolean;
  canAccessEmployees: boolean;
  canManageEmployees: boolean;
  canAccessPayroll: boolean;
  canAccessSettings: boolean;
  canManageLeaveQuota: boolean;
  canAccessAnnouncements: boolean;
  canManageAnnouncements: boolean;
  canAccessAppraisals: boolean;
  canViewPii: boolean;
  canAccessRoute: (route: HrmsRouteAccessKey) => boolean;
  matchesApproverRole: (currentApproverRole?: string | null) => boolean;
};

const SUPERVISORY_CATEGORIES: readonly HrmsRoleCategory[] = [
  'executive',
  'hr',
  'department',
  'line_management',
  'attendance',
  'payroll',
];

const LEGACY_APP_ROLE_TO_HRMS_ROLE_CODES: Record<string, string[]> = {
  super_admin: ['hr_manager'],
  company_admin: ['hr_manager'],
  director: ['director'],
  general_manager: ['general_manager'],
  manager: ['department_manager', 'line_manager'],
  accounts: ['payroll_officer'],
  sales: ['staff'],
  analyst: ['staff'],
  creator_updater: ['staff'],
  employee: ['staff'],
};

export function normalizeHrmsRoleCode(code?: string | null): string {
  if (!code) return '';
  const normalized = String(code).trim().toLowerCase();
  return normalized === 'employee' ? 'staff' : normalized;
}

export function isHrmsRoleId(value?: string | null): boolean {
  return Boolean(value && /^[0-9a-f-]{24,}$/i.test(value));
}

function dedupeRoles(roles: HrmsRole[]): HrmsRole[] {
  const seen = new Set<string>();
  return roles.filter((role) => {
    if (!role.id || seen.has(role.id)) return false;
    seen.add(role.id);
    return true;
  });
}

function matchesLegacyRoleCode(currentApproverRole: string, roleCodes: string[]): boolean {
  const normalizedRole = normalizeHrmsRoleCode(currentApproverRole);
  if (roleCodes.includes(normalizedRole)) return true;

  const mappedCodes = LEGACY_APP_ROLE_TO_HRMS_ROLE_CODES[normalizedRole] ?? [];
  return mappedCodes.some((code) => roleCodes.includes(code));
}

export function matchesHrmsApproverRole(
  currentApproverRole: string | null | undefined,
  approver: HrmsApproverIdentity,
): boolean {
  if (!currentApproverRole || !approver) return false;

  const roleIds = approver.hrmsRoleIds ?? [];
  const roleCodes = (approver.hrmsRoleCodes ?? []).map(normalizeHrmsRoleCode).filter(Boolean);

  if (isHrmsRoleId(currentApproverRole)) {
    return roleIds.includes(currentApproverRole);
  }

  return matchesLegacyRoleCode(currentApproverRole, roleCodes);
}

export function deriveHrmsAccess(roles: HrmsRole[]): DerivedHrmsAccess {
  const activeRoles = dedupeRoles(roles.filter((role) => role.isActive));
  const roleIds = activeRoles.map((role) => role.id);
  const roleCodes = activeRoles.map((role) => normalizeHrmsRoleCode(role.code)).filter(Boolean);
  const roleNames = activeRoles.map((role) => role.name).filter(Boolean);
  const primaryRole = [...activeRoles].sort(
    (left, right) => left.authorityLevel - right.authorityLevel || left.name.localeCompare(right.name),
  )[0] ?? null;

  const hasSelfServiceAccess = activeRoles.length > 0;
  const canApproveRequests = activeRoles.some((role) => role.canApproveRequests);
  const hasHrmsAdminRole = activeRoles.some((role) => {
    const code = normalizeHrmsRoleCode(role.code);
    return code === 'hr_manager'
      || code === 'hr_officer'
      || (role.canManageEmployeeRecords && (role.canViewHrmsReports || role.canApproveRequests));
  });
  const hasSupervisoryRole = activeRoles.some((role) => {
    const code = normalizeHrmsRoleCode(role.code);
    if (code === 'staff') return false;
    return role.canManageEmployeeRecords
      || role.canApproveRequests
      || role.canViewHrmsReports
      || SUPERVISORY_CATEGORIES.includes(role.category)
      || role.scope !== 'self';
  });
  const canManageAttendance = activeRoles.some((role) => {
    const code = normalizeHrmsRoleCode(role.code);
    return code === 'attendance_officer' || role.canManageEmployeeRecords;
  }) || hasHrmsAdminRole;
  const canAccessPayroll = activeRoles.some((role) => {
    const code = normalizeHrmsRoleCode(role.code);
    return code === 'payroll_officer' || role.category === 'payroll';
  }) || hasHrmsAdminRole;
  const canAccessAnnouncements = hasSelfServiceAccess;
  const canManageAnnouncements = hasSupervisoryRole || hasHrmsAdminRole;
  const canAccessAppraisals = hasSelfServiceAccess;
  const canAccessAttendance = hasSupervisoryRole;
  const canAccessEmployees = hasSupervisoryRole;
  const canManageEmployees = activeRoles.some((role) => role.canManageEmployeeRecords) || hasHrmsAdminRole;
  const canAccessSettings = hasHrmsAdminRole;
  const canManageLeaveQuota = hasHrmsAdminRole
    || activeRoles.some((role) => role.canApproveRequests && SUPERVISORY_CATEGORIES.includes(role.category));
  const canViewPii = hasHrmsAdminRole;

  const canAccessRoute = (route: HrmsRouteAccessKey) => {
    switch (route) {
      case 'dashboard':
      case 'profile':
      case 'leave':
        return hasSelfServiceAccess;
      case 'leaveCalendar':
        return hasSupervisoryRole;
      case 'attendance':
        return canAccessAttendance;
      case 'approvals':
        return canApproveRequests;
      case 'appraisals':
        return canAccessAppraisals;
      case 'announcements':
        return canAccessAnnouncements;
      case 'employees':
        return canAccessEmployees;
      case 'payroll':
        return canAccessPayroll;
      case 'settings':
        return canAccessSettings;
      case 'leaveQuota':
        return canManageLeaveQuota;
      default:
        return false;
    }
  };

  return {
    roles: activeRoles,
    roleIds,
    roleCodes,
    roleNames,
    primaryRole,
    primaryRoleLabel: primaryRole?.name ?? null,
    hasSelfServiceAccess,
    canApproveRequests,
    canAccessAttendance,
    canManageAttendance,
    canAccessEmployees,
    canManageEmployees,
    canAccessPayroll,
    canAccessSettings,
    canManageLeaveQuota,
    canAccessAnnouncements,
    canManageAnnouncements,
    canAccessAppraisals,
    canViewPii,
    canAccessRoute,
    matchesApproverRole: (currentApproverRole?: string | null) => matchesHrmsApproverRole(currentApproverRole, {
      hrmsRoleIds: roleIds,
      hrmsRoleCodes: roleCodes,
    }),
  };
}

/** Returns full HRMS access for super_admin / company_admin — bypasses HRMS role assignments. */
export function deriveFullHrmsAccess(): DerivedHrmsAccess {
  return {
    roles: [],
    roleIds: [],
    roleCodes: [],
    roleNames: [],
    primaryRole: null,
    primaryRoleLabel: 'Administrator',
    hasSelfServiceAccess: true,
    canApproveRequests: true,
    canAccessAttendance: true,
    canManageAttendance: true,
    canAccessEmployees: true,
    canManageEmployees: true,
    canAccessPayroll: true,
    canAccessSettings: true,
    canManageLeaveQuota: true,
    canAccessAnnouncements: true,
    canManageAnnouncements: true,
    canAccessAppraisals: true,
    canViewPii: true,
    canAccessRoute: () => true,
    matchesApproverRole: () => true,
  };
}
