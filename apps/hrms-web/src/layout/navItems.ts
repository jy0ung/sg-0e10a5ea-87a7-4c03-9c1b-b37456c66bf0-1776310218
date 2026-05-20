import {
  Calendar,
  Clock,
  CreditCard,
  Megaphone,
  Settings2,
  Star,
  UserCheck,
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
  { label: 'Leave', path: '/leave', icon: Calendar, group: 'Self Service', access: 'leave' },
  { label: 'Approvals', path: '/approvals', icon: UserCheck, group: 'Self Service', access: 'approvals' },
  { label: 'Appraisals', path: '/appraisals', icon: Star, group: 'Self Service', access: 'appraisals' },
  { label: 'Announcements', path: '/announcements', icon: Megaphone, group: 'Self Service', access: 'announcements' },
  { label: 'Profile', path: '/profile', icon: UserRound, group: 'Self Service', access: 'profile' },
  { label: 'Attendance', path: '/attendance', icon: Clock, group: 'Workforce', access: 'attendance' },
  { label: 'Leave Calendar', path: '/leave/calendar', icon: Calendar, group: 'Workforce', access: 'leaveCalendar' },
  { label: 'Employees', path: '/employees', icon: Users, group: 'Workforce', access: 'employees' },
  { label: 'Payroll', path: '/payroll', icon: CreditCard, group: 'Administration', access: 'payroll' },
  { label: 'Settings', path: '/settings', icon: Settings2, group: 'Administration', access: 'settings' },
];
