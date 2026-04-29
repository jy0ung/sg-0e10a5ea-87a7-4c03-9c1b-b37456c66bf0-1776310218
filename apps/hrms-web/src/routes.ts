export const hrmsCompatibilityRedirects = [
  { path: 'leave-calendar', to: '/leave/calendar' },
  { path: 'admin', to: '/settings' },
  { path: 'hrms/leave', to: '/leave' },
  { path: 'hrms/leave-calendar', to: '/leave/calendar' },
  { path: 'hrms/attendance', to: '/attendance' },
  { path: 'hrms/approvals', to: '/approvals' },
  { path: 'hrms/appraisals', to: '/appraisals' },
  { path: 'hrms/announcements', to: '/announcements' },
  { path: 'hrms/employees', to: '/employees' },
  { path: 'hrms/payroll', to: '/payroll' },
  { path: 'hrms/admin', to: '/settings' },
  { path: 'hrms/approval-flows', to: '/approval-flows' },
];

export function getHrmsRouterBaseName(baseUrl: string): string {
  return baseUrl === '/' ? '/' : baseUrl.replace(/\/$/, '');
}

export const hrmsProtectedRoutePaths = [
  'profile',
  'leave',
  'leave/calendar',
  'attendance',
  'approvals',
  'appraisals',
  'announcements',
  'employees',
  'payroll',
  'settings',
  'approval-flows',
  'unauthorized',
] as const;