import { describe, expect, it } from 'vitest';
import {
  MAIN_NAV_ROUTES,
  PLATFORM_ROUTES,
  PLATFORM_SECTIONS,
  getFocusedPlatformSection,
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
    expect(getPlatformRouteForPath('/unknown/path')).toBeNull();
  });

  it('resolves focused sections for nested enterprise routes', () => {
    expect(getFocusedPlatformSection('/sales/orders/so-1')).toBe('Sales');
    expect(getFocusedPlatformSection('/portal/tickets/new')).toBe('Platform');
    expect(getFocusedPlatformSection('/admin/users')).toBe('Admin');
    expect(getFocusedPlatformSection('/admin/webhooks')).toBe('Admin');
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
      '/leave',
      '/approvals',
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
