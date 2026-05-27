import { PORTAL_QUEUE_ROLES, PORTAL_SETUP_ROLES } from '@/config/routeRoles';

export interface PortalAccessSubject {
  role?: string | null;
  portal_access_only?: boolean | null;
  portalAccessOnly?: boolean | null;
}

/**
 * Portal-specific roles — users whose account exists only to serve the
 * `/portal` Internal Service Request module (no main-app access).
 * Distinct from PORTAL_QUEUE_ROLES (which also includes super_admin /
 * company_admin who can manage the queue but live in the main app).
 */
const PORTAL_ONLY_ROLES = new Set<string>([
  'portal_admin',
  'portal_manager',
  'portal_staff',
]);

const PORTAL_QUEUE_ROLE_SET = new Set<string>(PORTAL_QUEUE_ROLES);
const PORTAL_SETUP_ROLE_SET = new Set<string>(PORTAL_SETUP_ROLES);

function subjectRole(subject?: PortalAccessSubject | null): string {
  return typeof subject?.role === 'string' ? subject.role : '';
}

export function isPortalOnlyUser(subject?: PortalAccessSubject | null): boolean {
  if (!subject) return false;
  if (subject.portal_access_only === true || subject.portalAccessOnly === true) return true;
  return PORTAL_ONLY_ROLES.has(subjectRole(subject));
}

export function canAccessMainApp(subject?: PortalAccessSubject | null): boolean {
  return !isPortalOnlyUser(subject);
}

export function resolveAuthenticatedHomePath(subject?: PortalAccessSubject | null): string {
  return isPortalOnlyUser(subject) ? '/portal' : '/';
}

/**
 * True when the user holds a role granted by PORTAL_QUEUE_ROLES — i.e. they
 * may triage, assign, and resolve incoming requests on /portal/queue. Used
 * by PortalLanding to decide whether to surface the queue shortcut.
 */
export function canManagePortalQueue(subject?: PortalAccessSubject | null): boolean {
  return PORTAL_QUEUE_ROLE_SET.has(subjectRole(subject));
}

/**
 * True when the user holds a role granted by PORTAL_SETUP_ROLES — i.e. they
 * may write categories, templates, form fields, routing rules, announcements,
 * or documents. Used by every admin-only UI affordance on the portal pages.
 */
export function canManagePortalSetup(subject?: PortalAccessSubject | null): boolean {
  return PORTAL_SETUP_ROLE_SET.has(subjectRole(subject));
}

/**
 * True when the user's role is one of the three portal-specific roles
 * (portal_admin, portal_manager, portal_staff). Distinct from
 * isPortalOnlyUser which also considers the portal_access_only flag — this
 * helper is for the subset of portal-only users that should be sent to
 * /portal rather than the HRMS workspace.
 */
export function hasPortalSpecificRole(subject?: PortalAccessSubject | null): boolean {
  return PORTAL_ONLY_ROLES.has(subjectRole(subject));
}
