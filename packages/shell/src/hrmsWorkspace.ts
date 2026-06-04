export const HRMS_BASE_PATH = '/hrms';

/**
 * Canonical HRMS module paths used by the main app when building deep links
 * into the dedicated HRMS workspace.
 */
export const HRMS_PATHS = {
  root: HRMS_BASE_PATH,
  leave: `${HRMS_BASE_PATH}/leave`,
  leaveCalendar: `${HRMS_BASE_PATH}/leave/calendar`,
  attendance: `${HRMS_BASE_PATH}/attendance`,
  approvals: `${HRMS_BASE_PATH}/approvals`,
  appraisals: `${HRMS_BASE_PATH}/appraisals`,
  announcements: `${HRMS_BASE_PATH}/announcements`,
  employees: `${HRMS_BASE_PATH}/employees`,
  payroll: `${HRMS_BASE_PATH}/payroll`,
  settings: `${HRMS_BASE_PATH}/settings`,
  login: `${HRMS_BASE_PATH}/login`,
} as const;

export type HrmsPath = (typeof HRMS_PATHS)[keyof typeof HRMS_PATHS];

const HRMS_ROUTE_ALIASES: Record<string, string> = {
  '/admin': '/settings',
  '/leave-calendar': '/leave/calendar',
};

function normalizeHrmsWorkspacePath(pathname: string): string {
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const withoutHrmsBase = withLeadingSlash === HRMS_BASE_PATH
    ? '/'
    : withLeadingSlash.startsWith(`${HRMS_BASE_PATH}/`)
      ? withLeadingSlash.slice(HRMS_BASE_PATH.length) || '/'
      : withLeadingSlash;

  return HRMS_ROUTE_ALIASES[withoutHrmsBase] ?? withoutHrmsBase;
}

function buildAbsoluteWorkspaceUrl(baseUrl: string, pathname: string, search: string, hash: string): string {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname === '/' ? `${basePath || ''}/` : `${basePath}${pathname}`;
  url.search = search;
  url.hash = hash;
  return url.toString();
}

export function isHrmsWorkspacePath(pathname?: string | null): boolean {
  if (!pathname) return false;
  return pathname === HRMS_BASE_PATH || pathname.startsWith(`${HRMS_BASE_PATH}/`);
}

export function getDedicatedHrmsWorkspacePath(
  pathname = HRMS_BASE_PATH,
  search = '',
  hash = '',
  appUrl?: string | null,
): string {
  const normalizedPath = normalizeHrmsWorkspacePath(pathname);
  if (appUrl) return buildAbsoluteWorkspaceUrl(appUrl, normalizedPath, search, hash);

  const workspacePath = normalizedPath === '/'
    ? `${HRMS_BASE_PATH}/`
    : `${HRMS_BASE_PATH}${normalizedPath}`;

  return `${workspacePath}${search}${hash}`;
}
