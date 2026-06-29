import { describe, expect, it } from 'vitest';
import {
  HRMS_GUARDED_ROUTE_DEFINITIONS,
  HRMS_NAV_ROUTES,
  HRMS_PROTECTED_ROUTE_PATHS,
  HRMS_ROUTE_CHROME,
  MAIN_NAV_ROUTES,
  PLATFORM_ROUTES,
  PLATFORM_SECTIONS,
  getFocusedPlatformSection,
  isFocusedPlatformPath,
  getModuleGateForPath,
  getModuleGateForSection,
  getPlatformRouteForPath,
  getPlatformUnavailableCopy,
  getProductionSmokeRoutes,
} from '@flc/shell';

describe('platformRegistry', () => {
  it('keeps route ids and shell paths unique enough for registry consumers', () => {
    const ids = PLATFORM_ROUTES.map((route) => route.id);
    expect(new Set(ids).size).toBe(ids.length);

    const shellPaths = PLATFORM_ROUTES.map((route) => `${route.shell}:${route.path}:${route.navShell ?? ''}:${route.smoke?.app ?? ''}`);
    expect(new Set(shellPaths).size).toBe(shellPaths.length);
  });

  it('drives main shell navigation from the shared route registry', () => {
    expect(MAIN_NAV_ROUTES.map((route) => route.path)).toEqual(expect.arrayContaining([
      '/home',
      '/inbox',
      '/auto-aging/vehicles',
      '/sales/pipeline',
      '/purchasing/orders',
      '/accounts/profit-loss',
      '/admin/settings',
    ]));
    expect(MAIN_NAV_ROUTES.map((route) => route.path)).not.toContain('/hrms/');
  });

  it('drives HRMS shell navigation and chrome from the shared route registry', () => {
    expect(HRMS_NAV_ROUTES.map((route) => route.path)).toEqual([
      '/dashboard',
      '/leave',
      '/attendance',
      '/appraisals',
      '/announcements',
      '/profile',
      '/employees',
      '/attendance',
      '/leave/team',
      '/leave/calendar',
      '/approvals',
      '/payroll',
      '/settings/leave-quota',
      '/settings',
    ]);
    expect(HRMS_NAV_ROUTES.map((route) => route.accessKey)).toEqual([
      'dashboard',
      'leave',
      'myAttendance',
      'appraisals',
      'announcements',
      'profile',
      'employees',
      'attendance',
      'teamLeave',
      'leaveCalendar',
      'approvals',
      'payroll',
      'leaveQuota',
      'settings',
    ]);
    expect(HRMS_ROUTE_CHROME.find((route) => route.title === 'My Leave')?.kicker).toBe('Applications and status history');
    expect(HRMS_PROTECTED_ROUTE_PATHS).toEqual([
      'dashboard',
      'profile',
      'leave',
      'leave/team',
      'leave/calendar',
      'attendance',
      'approvals',
      'appraisals',
      'announcements',
      'employees',
      'employees/:id',
      'payroll',
      'settings',
      'settings/leave-quota',
      'settings/:module',
      'unauthorized',
    ]);
    expect(HRMS_GUARDED_ROUTE_DEFINITIONS.map((route) => [route.path, route.accessKey, route.scope])).toEqual([
      ['dashboard', 'dashboard', 'Dashboard'],
      ['profile', 'profile', 'Profile'],
      ['leave', 'leave', 'Leave'],
      ['leave/team', 'teamLeave', 'Team Leave'],
      ['leave/calendar', 'leaveCalendar', 'Leave Calendar'],
      ['attendance', 'attendancePage', 'Attendance'],
      ['approvals', 'approvals', 'Approvals'],
      ['appraisals', 'appraisals', 'Appraisals'],
      ['announcements', 'announcements', 'Announcements'],
      ['employees', 'employees', 'Employees'],
      ['employees/:id', 'employees', 'Employee Profile'],
      ['payroll', 'payroll', 'Payroll'],
      ['settings', 'settings', 'Settings'],
      ['settings/leave-quota', 'leaveQuota', 'Leave Quota Settings'],
      ['settings/:module', 'settings', 'Settings Module'],
    ]);
  });

  it('resolves module gates for routes and sections', () => {
    expect(getModuleGateForPath('/auto-aging/vehicles/ABC123')).toBe('auto-aging');
    expect(getModuleGateForPath('/portal/queue')).toBe('support');
    expect(getModuleGateForPath('/admin/webhooks')).toBe('admin');
    expect(getModuleGateForPath('/admin/reconciliation/match-1')).toBe('admin');
    expect(getModuleGateForPath('/accounts/profit-loss')).toBeNull();
    expect(getModuleGateForSection('Purchasing')).toBe('purchasing');
    expect(getModuleGateForSection('Accounts')).toBeNull();
  });

  it('resolves longest-match route metadata for nested paths', () => {
    expect(getPlatformRouteForPath('/purchasing/orders/new')?.id).toBe('purchasing-order-new');
    expect(getPlatformRouteForPath('/purchasing/grn/grn-1')?.id).toBe('purchasing-grn-detail');
    expect(getPlatformRouteForPath('/admin/reconciliation/match-1')?.id).toBe('admin-reconciliation-detail');
    expect(getPlatformRouteForPath('/sales/lead-intake/person/raw-1')?.id).toBe('sales-lead-detail');
    expect(getPlatformRouteForPath('/employees/emp-1', ['hrms'])?.id).toBe('hrms-employee-detail');
    expect(getPlatformRouteForPath('/settings/roles', ['hrms'])?.id).toBe('hrms-settings-module');
    expect(getPlatformRouteForPath('/unknown/path')).toBeNull();
  });

  it('resolves focused sections for nested enterprise routes', () => {
    expect(getFocusedPlatformSection('/sales/deals/so-1')).toBe('Sales');
    expect(getFocusedPlatformSection('/portal/tickets/new')).toBe('Platform');
    expect(getFocusedPlatformSection('/admin/users')).toBe('Admin');
    expect(getFocusedPlatformSection('/admin/webhooks')).toBe('Admin');
  });

  it('keeps focused shell mode limited to standalone module paths', () => {
    expect(isFocusedPlatformPath('/sales/deals')).toBe(true);
    expect(isFocusedPlatformPath('/admin/users')).toBe(true);
    expect(isFocusedPlatformPath('/hrms/leave')).toBe(true);
    expect(isFocusedPlatformPath('/portal/tickets/new')).toBe(false);
    expect(isFocusedPlatformPath('/home')).toBe(false);
    expect(isFocusedPlatformPath('/modules')).toBe(false);
  });

  it('exports production smoke routes from the same registry', () => {
    const mainRoutes = getProductionSmokeRoutes('main');
    const hrmsRoutes = getProductionSmokeRoutes('hrms');

    expect(mainRoutes.find((route) => route.path === '/modules')?.name).toBe('Home legacy redirect');

    expect(mainRoutes.map((route) => route.path)).toEqual(expect.arrayContaining([
      '/',
      '/modules',
      '/home',
      '/portal/tickets/new',
      '/sales/pipeline',
      '/admin/reconciliation',
    ]));
    expect(hrmsRoutes.map((route) => route.path)).toEqual(expect.arrayContaining([
      '/',
      '/dashboard',
      '/leave',
      '/leave/team',
      '/approvals',
      '/settings/leave-quota',
      '/settings',
    ]));
  });

  it('builds unavailable-state copy from the route registry', () => {
    expect(getPlatformUnavailableCopy('/purchasing/orders', 'disabledModule')).toEqual({
      title: 'Purchase Orders unavailable',
      description: 'Purchase Orders is registered in the platform catalogue, but it is disabled for this company or gated behind an inactive feature flag. Control: phase3e.po-grn-v2.',
    });

    expect(getPlatformUnavailableCopy('/purchasing/orders/po-1', 'disabledModule', {
      routeId: 'purchasing-order-detail',
    })).toEqual({
      title: 'Purchase Order unavailable',
      description: 'Purchase Order is registered in the platform catalogue, but it is disabled for this company or gated behind an inactive feature flag. Control: phase3e.po-grn-v2.',
    });

    expect(getPlatformUnavailableCopy('/admin/kpi-studio', 'missingPermission')).toEqual({
      title: 'Access restricted',
      description: 'Your role does not include access to KPI Studio. Ask an administrator to review your role, section access, or column permissions.',
    });
  });

  it('keeps shell sections aligned with registry sections', () => {
    expect(PLATFORM_SECTIONS.map((section) => section.name)).toEqual(expect.arrayContaining([
      'Platform',
      'Auto Aging',
      'Sales',
      'Inventory',
      'Purchasing',
      'Accounts',
      'Reports',
      'HRMS',
      'Admin',
      'Internal Requests',
    ]));
  });
});
