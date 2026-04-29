const HRMS_BASE_PATH = '/hrms';

const HRMS_ROUTE_ALIASES: Record<string, string> = {
  '/admin': '/settings',
  '/leave-calendar': '/leave/calendar',
};

function normalizePath(pathname: string): string {
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const withoutHrmsBase = withLeadingSlash === HRMS_BASE_PATH
    ? '/'
    : withLeadingSlash.startsWith(`${HRMS_BASE_PATH}/`)
      ? withLeadingSlash.slice(HRMS_BASE_PATH.length) || '/'
      : withLeadingSlash;

  return HRMS_ROUTE_ALIASES[withoutHrmsBase] ?? withoutHrmsBase;
}

function getConfiguredHrmsAppUrl(): string | null {
  const configuredUrl = import.meta.env.VITE_HRMS_APP_URL?.trim();
  return configuredUrl || null;
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
  appUrl = getConfiguredHrmsAppUrl(),
): string {
  const normalizedPath = normalizePath(pathname);
  if (appUrl) return buildAbsoluteWorkspaceUrl(appUrl, normalizedPath, search, hash);

  const workspacePath = normalizedPath === '/'
    ? `${HRMS_BASE_PATH}/`
    : `${HRMS_BASE_PATH}${normalizedPath}`;

  return `${workspacePath}${search}${hash}`;
}

export function openDedicatedHrmsWorkspace(pathname = HRMS_BASE_PATH, search = '', hash = ''): void {
  window.location.assign(getDedicatedHrmsWorkspacePath(pathname, search, hash));
}