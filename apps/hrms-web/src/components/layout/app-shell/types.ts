import type { ElementType, ReactNode } from 'react';

export type AppShellWidthMode = 'contained' | 'wide' | 'full';

export interface AppShellBrand {
  title: string;
  subtitle?: string;
  logoSrc?: string;
  logoAlt?: string;
}

export interface AppShellRouteChrome {
  title: string;
  kicker?: string;
}

export interface AppShellRouteChromeMatch extends AppShellRouteChrome {
  pattern: RegExp;
}

export interface AppShellUser {
  name?: string | null;
  email?: string | null;
  role?: string | null;
  profilePath?: string;
}

export interface AppShellAction {
  label: string;
  icon?: ElementType;
  to?: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  badge?: boolean | ReactNode;
  className?: string;
  render?: ReactNode;
}

export interface AppShellNavItem {
  label: string;
  path: string;
  icon: ElementType;
  group?: string;
  external?: boolean;
  href?: string;
  end?: boolean;
  badgeCount?: number;
  activeMatch?: (pathname: string) => boolean;
}

export interface AppShellNavSection {
  name: string;
  icon?: ElementType;
  path?: string;
  href?: string;
  external?: boolean;
  items: AppShellNavItem[];
  showHeader?: boolean;
  showItems?: boolean;
  showGroupLabels?: boolean;
  activeMatch?: (pathname: string) => boolean;
}

export interface AppShellBackLink {
  label: string;
  to?: string;
  href?: string;
  icon?: ElementType;
}