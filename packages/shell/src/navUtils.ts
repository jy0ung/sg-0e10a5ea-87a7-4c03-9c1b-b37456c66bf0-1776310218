import type { AppShellNavItem } from './types';

export function isAppShellNavItemActive(item: AppShellNavItem, pathname: string): boolean {
  if (item.activeMatch) return item.activeMatch(pathname);
  if (item.path === '/') return pathname === '/';
  const normalizedPath = item.path.endsWith('/') ? item.path.slice(0, -1) : item.path;
  if (item.end) return pathname === normalizedPath;
  return pathname === normalizedPath || pathname.startsWith(`${normalizedPath}/`);
}