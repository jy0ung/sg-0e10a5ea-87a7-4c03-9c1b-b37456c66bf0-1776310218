import type { AppShellRouteChrome, AppShellRouteChromeMatch } from './types';

export function resolveRouteChrome(
  pathname: string,
  matches: AppShellRouteChromeMatch[],
  fallback: AppShellRouteChrome,
): AppShellRouteChrome {
  return matches.find((match) => match.pattern.test(pathname)) ?? fallback;
}