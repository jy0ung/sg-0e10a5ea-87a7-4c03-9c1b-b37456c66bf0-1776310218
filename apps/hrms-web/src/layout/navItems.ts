import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  Clock,
  CreditCard,
  Gauge,
  Inbox,
  Megaphone,
  Settings2,
  Star,
  UserRound,
  Users,
} from 'lucide-react';
import type { ElementType } from 'react';
import { HRMS_NAV_ROUTES, type PlatformIconKey } from '@flc/shell';
import type { HrmsRouteAccessKey } from '@/lib/hrms/access';

export interface HrmsNavItem {
  label: string;
  path: string;
  icon: ElementType;
  group: string;
  access?: HrmsRouteAccessKey;
  badgeCount?: number;
}

const ICONS: Partial<Record<PlatformIconKey, ElementType>> = {
  'layout-dashboard': LayoutDashboard,
  calendar: Calendar,
  timer: Clock,
  sparkles: Star,
  bell: Megaphone,
  'user-check': UserRound,
  users: Users,
  inbox: Inbox,
  'dollar-sign': CreditCard,
  gauge: Gauge,
  settings: Settings2,
};

function resolveIcon(route: { icon: PlatformIconKey; path: string; label: string }) {
  if (route.path.startsWith('/leave/') || route.label === 'Team Leave') return CalendarDays;
  return ICONS[route.icon] ?? Calendar;
}

export const hrmsNavItems: HrmsNavItem[] = HRMS_NAV_ROUTES.map((route) => ({
  label: route.label,
  path: route.path,
  icon: resolveIcon(route),
  group: route.group,
  access: route.accessKey as HrmsRouteAccessKey,
}));
