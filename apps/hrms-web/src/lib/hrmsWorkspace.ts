// Compatibility wrapper: HRMS workspace path semantics are owned by @flc/shell.
import {
  getDedicatedHrmsWorkspacePath as resolveDedicatedHrmsWorkspacePath,
  HRMS_BASE_PATH,
} from '@flc/shell';

export {
  HRMS_BASE_PATH,
  HRMS_PATHS,
  isHrmsWorkspacePath,
} from '@flc/shell';
export type { HrmsPath } from '@flc/shell';

function getConfiguredHrmsAppUrl(): string | null {
  const configuredUrl = import.meta.env.VITE_HRMS_APP_URL?.trim();
  return configuredUrl || null;
}

export function getDedicatedHrmsWorkspacePath(
  pathname = HRMS_BASE_PATH,
  search = '',
  hash = '',
  appUrl = getConfiguredHrmsAppUrl(),
): string {
  return resolveDedicatedHrmsWorkspacePath(pathname, search, hash, appUrl);
}

export function openDedicatedHrmsWorkspace(pathname = HRMS_BASE_PATH, search = '', hash = ''): void {
  window.location.assign(getDedicatedHrmsWorkspacePath(pathname, search, hash));
}
