import {
  Calendar,
  Clock,
  CreditCard,
  GitMerge,
  Megaphone,
  Settings2,
  Star,
  UserCheck,
  UserRound,
  Users,
} from 'lucide-react';
import type { ElementType } from 'react';
import type { AppRole } from '@/types';
import {
  HRMS_ADMIN,
  HRMS_APPRAISALS,
  HRMS_APPROVAL_INBOX,
  HRMS_LEAVE,
  HRMS_PAYROLL,
  MANAGER_AND_UP,
} from '@/config/routeRoles';

export interface HrmsNavItem {
  label: string;
  path: string;
  icon: ElementType;
  group: string;
  roles?: readonly AppRole[];
}

export const hrmsNavItems: HrmsNavItem[] = [
  { label: 'Leave', path: '/leave', icon: Calendar, group: 'Self Service', roles: HRMS_LEAVE },
  { label: 'Approvals', path: '/approvals', icon: UserCheck, group: 'Self Service', roles: HRMS_APPROVAL_INBOX },
  { label: 'Appraisals', path: '/appraisals', icon: Star, group: 'Self Service', roles: HRMS_APPRAISALS },
  { label: 'Announcements', path: '/announcements', icon: Megaphone, group: 'Self Service', roles: MANAGER_AND_UP },
  { label: 'Profile', path: '/profile', icon: UserRound, group: 'Self Service' },
  { label: 'Attendance', path: '/attendance', icon: Clock, group: 'Workforce', roles: MANAGER_AND_UP },
  { label: 'Leave Calendar', path: '/leave/calendar', icon: Calendar, group: 'Workforce', roles: MANAGER_AND_UP },
  { label: 'Employees', path: '/employees', icon: Users, group: 'Workforce', roles: MANAGER_AND_UP },
  { label: 'Payroll', path: '/payroll', icon: CreditCard, group: 'Administration', roles: HRMS_PAYROLL },
  { label: 'Settings', path: '/settings', icon: Settings2, group: 'Administration', roles: HRMS_ADMIN },
  { label: 'Approval Flows', path: '/approval-flows', icon: GitMerge, group: 'Administration', roles: HRMS_ADMIN },
];