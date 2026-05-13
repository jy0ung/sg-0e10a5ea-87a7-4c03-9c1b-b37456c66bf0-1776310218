export interface PortalAccessSubject {
  role?: string | null;
  portal_access_only?: boolean | null;
  portalAccessOnly?: boolean | null;
}

const PORTAL_ONLY_ROLES = new Set(['portal_admin', 'portal_manager', 'portal_staff']);

export function isPortalOnlyUser(subject?: PortalAccessSubject | null): boolean {
  if (!subject) return false;
  if (subject.portal_access_only === true || subject.portalAccessOnly === true) return true;
  return typeof subject.role === 'string' && PORTAL_ONLY_ROLES.has(subject.role);
}

export function canAccessMainApp(subject?: PortalAccessSubject | null): boolean {
  return !isPortalOnlyUser(subject);
}

export function resolveAuthenticatedHomePath(subject?: PortalAccessSubject | null): string {
  return isPortalOnlyUser(subject) ? '/portal' : '/';
}