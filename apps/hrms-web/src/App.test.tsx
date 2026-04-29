import { describe, expect, it } from 'vitest';
import {
  getHrmsRouterBaseName,
  hrmsCompatibilityRedirects,
  hrmsProtectedRoutePaths,
} from './routes';

describe('HRMS web route metadata', () => {
  it('normalizes the Vite base path for local and mounted deployments', () => {
    expect(getHrmsRouterBaseName('/')).toBe('/');
    expect(getHrmsRouterBaseName('/hrms/')).toBe('/hrms');
    expect(getHrmsRouterBaseName('/hrms')).toBe('/hrms');
  });

  it('keeps the dedicated protected route surface explicit', () => {
    expect(hrmsProtectedRoutePaths).toEqual([
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
    ]);
  });

  it('redirects legacy nested HRMS paths to dedicated-app paths', () => {
    expect(hrmsCompatibilityRedirects).toContainEqual({ path: 'leave-calendar', to: '/leave/calendar' });
    expect(hrmsCompatibilityRedirects).toContainEqual({ path: 'admin', to: '/settings' });
    expect(hrmsCompatibilityRedirects).toContainEqual({ path: 'hrms/leave', to: '/leave' });
    expect(hrmsCompatibilityRedirects).toContainEqual({ path: 'hrms/admin', to: '/settings' });
    expect(hrmsCompatibilityRedirects).toContainEqual({ path: 'hrms/approval-flows', to: '/approval-flows' });
    expect(hrmsCompatibilityRedirects.every((route) => !route.to.startsWith('/hrms'))).toBe(true);
  });
});