export { AppShell } from './AppShell';
export { AppShellSidebar } from './AppShellSidebar';
export { AppShellTopbar } from './AppShellTopbar';
export { AppShellNavLink } from './AppShellNavLink';
// Pure helpers + types now live in @flc/shell so both apps share one
// source of truth. JSX components remain app-local until @flc/ui is
// extracted from the shadcn primitives.
export { isAppShellNavItemActive, resolveRouteChrome } from '@flc/shell';
export type {
  AppShellAction,
  AppShellBackLink,
  AppShellBrand,
  AppShellCommandItem,
  AppShellCommandSearch,
  AppShellNavItem,
  AppShellNavSection,
  AppShellRouteChrome,
  AppShellRouteChromeMatch,
  AppShellUser,
  AppShellWidthMode,
} from '@flc/shell';
