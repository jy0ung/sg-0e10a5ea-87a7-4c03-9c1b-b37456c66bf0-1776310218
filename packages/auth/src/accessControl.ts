import type { AppRole } from '@flc/types';

export interface AccessSubject {
  role?: AppRole | string | null;
  portal_access_only?: boolean | null;
  portalAccessOnly?: boolean | null;
}

export const PORTAL_ONLY_ROLES = ['portal_admin', 'portal_staff'] as const;
export const PORTAL_QUEUE_ROLES = ['super_admin', 'company_admin', 'portal_admin'] as const;
export const PORTAL_SETUP_ROLES = ['super_admin', 'company_admin', 'portal_admin'] as const;

const PORTAL_ONLY_ROLE_SET = new Set<string>(PORTAL_ONLY_ROLES);
const PORTAL_QUEUE_ROLE_SET = new Set<string>(PORTAL_QUEUE_ROLES);
const PORTAL_SETUP_ROLE_SET = new Set<string>(PORTAL_SETUP_ROLES);

export function getSubjectRole(subject?: AccessSubject | null): string {
  return typeof subject?.role === 'string' ? subject.role : '';
}

export function hasAppRole(
  subject: AccessSubject | string | null | undefined,
  allowedRoles: readonly (AppRole | string)[],
  options: { superAdminBypass?: boolean } = {},
): boolean {
  const role = typeof subject === 'string' ? subject : getSubjectRole(subject);
  if (!role) return false;
  if (options.superAdminBypass !== false && role === 'super_admin') return true;
  return allowedRoles.includes(role);
}

export function canAccessSection(
  subject: AccessSubject | string | null | undefined,
  sectionMatrix: Record<string, readonly string[] | undefined>,
  section: string,
): boolean {
  const role = typeof subject === 'string' ? subject : getSubjectRole(subject);
  if (!role) return false;
  return sectionMatrix[role]?.includes(section) ?? false;
}

export function isPortalOnlyUser(subject?: AccessSubject | null): boolean {
  if (!subject) return false;
  if (subject.portal_access_only === true || subject.portalAccessOnly === true) return true;
  return PORTAL_ONLY_ROLE_SET.has(getSubjectRole(subject));
}

export function canAccessMainApp(subject?: AccessSubject | null): boolean {
  return !isPortalOnlyUser(subject);
}

export function resolveAuthenticatedHomePath(subject?: AccessSubject | null): string {
  return isPortalOnlyUser(subject) ? '/portal' : '/';
}

export function canManagePortalQueue(subject?: AccessSubject | null): boolean {
  return PORTAL_QUEUE_ROLE_SET.has(getSubjectRole(subject));
}

export function canManagePortalSetup(subject?: AccessSubject | null): boolean {
  return PORTAL_SETUP_ROLE_SET.has(getSubjectRole(subject));
}

export function hasPortalSpecificRole(subject?: AccessSubject | null): boolean {
  return PORTAL_ONLY_ROLE_SET.has(getSubjectRole(subject));
}
