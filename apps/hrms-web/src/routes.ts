import { HRMS_PROTECTED_ROUTE_PATHS } from '@flc/shell';

export const hrmsCompatibilityRedirects = [
  { path: 'leave-calendar', to: '/leave/calendar' },
  { path: 'admin', to: '/settings' },
  { path: 'approval-flows', to: '/settings' },
  { path: 'hrms/leave', to: '/leave' },
  { path: 'hrms/leave-calendar', to: '/leave/calendar' },
  { path: 'hrms/attendance', to: '/attendance' },
  { path: 'hrms/approvals', to: '/approvals' },
  { path: 'hrms/appraisals', to: '/appraisals' },
  { path: 'hrms/announcements', to: '/announcements' },
  { path: 'hrms/employees', to: '/employees' },
  { path: 'hrms/payroll', to: '/payroll' },
  { path: 'hrms/admin', to: '/settings' },
  { path: 'hrms/approval-flows', to: '/settings' },
];

export function getHrmsRouterBaseName(baseUrl: string): string {
  return baseUrl === '/' ? '/' : baseUrl.replace(/\/$/, '');
}

export const hrmsProtectedRoutePaths = HRMS_PROTECTED_ROUTE_PATHS;
