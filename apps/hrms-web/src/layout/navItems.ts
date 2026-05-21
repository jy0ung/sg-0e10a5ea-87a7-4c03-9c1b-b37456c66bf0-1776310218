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
import type { HrmsRouteAccessKey } from '@/lib/hrms/access';

export interface HrmsNavItem {
  label: string;
  path: string;
  icon: ElementType;
  group: string;
  access?: HrmsRouteAccessKey;
  badgeCount?: number;
}

export const hrmsNavItems: HrmsNavItem[] = [
  // ── Self-Service ──────────────────────────────────────────────────────────
  { label: 'My Dashboard',   path: '/dashboard',        icon: LayoutDashboard, group: 'Self-Service', access: 'dashboard' },
  { label: 'Leave',          path: '/leave',            icon: Calendar,        group: 'Self-Service', access: 'leave' },
  { label: 'Announcements',  path: '/announcements',    icon: Megaphone,       group: 'Self-Service', access: 'announcements' },
  { label: 'Appraisals',     path: '/appraisals',       icon: Star,            group: 'Self-Service', access: 'appraisals' },
  { label: 'Profile',        path: '/profile',          icon: UserRound,       group: 'Self-Service', access: 'profile' },

  // ── Team ─────────────────────────────────────────────────────────────────
  { label: 'Employees',      path: '/employees',        icon: Users,           group: 'Team', access: 'employees' },
  { label: 'Attendance',     path: '/attendance',       icon: Clock,           group: 'Team', access: 'attendance' },
  { label: 'Leave Calendar', path: '/leave/calendar',   icon: CalendarDays,    group: 'Team', access: 'leaveCalendar' },

  // ── Approvals ────────────────────────────────────────────────────────────
  { label: 'Approval Inbox', path: '/approvals',        icon: Inbox,           group: 'Approvals', access: 'approvals' },

  // ── Administration ───────────────────────────────────────────────────────
  { label: 'Payroll',        path: '/payroll',          icon: CreditCard,      group: 'Administration', access: 'payroll' },
  { label: 'Leave Quota',    path: '/settings/leave-quota', icon: Gauge,       group: 'Administration', access: 'leaveQuota' },
  { label: 'Settings',       path: '/settings',         icon: Settings2,       group: 'Administration', access: 'settings' },
];
