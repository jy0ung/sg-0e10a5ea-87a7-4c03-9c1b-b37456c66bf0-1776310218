import { describe, expect, it } from 'vitest';
import {
  canAccessMainApp,
  canAccessSection,
  canManagePortalQueue,
  canManagePortalSetup,
  hasAppRole,
  hasPortalSpecificRole,
  isPortalOnlyUser,
  resolveAuthenticatedHomePath,
} from './accessControl';

describe('accessControl', () => {
  it('applies role checks with super admin bypass by default', () => {
    expect(hasAppRole({ role: 'manager' }, ['manager'])).toBe(true);
    expect(hasAppRole({ role: 'manager' }, ['accounts'])).toBe(false);
    expect(hasAppRole({ role: 'super_admin' }, ['accounts'])).toBe(true);
    expect(hasAppRole({ role: 'super_admin' }, ['accounts'], { superAdminBypass: false })).toBe(false);
  });

  it('resolves section access from the supplied server-backed matrix', () => {
    const matrix = {
      manager: ['Platform', 'Sales'],
      portal_staff: [],
    };

    expect(canAccessSection({ role: 'manager' }, matrix, 'Sales')).toBe(true);
    expect(canAccessSection({ role: 'manager' }, matrix, 'Admin')).toBe(false);
    expect(canAccessSection({ role: 'portal_staff' }, matrix, 'Platform')).toBe(false);
  });

  it('recognizes portal-only users and preserves HRMS portal access flag behavior', () => {
    expect(isPortalOnlyUser({ role: 'portal_staff' })).toBe(true);
    expect(isPortalOnlyUser({ role: 'analyst', portal_access_only: true })).toBe(true);
    expect(isPortalOnlyUser({ role: 'company_admin' })).toBe(false);
    expect(canAccessMainApp({ role: 'portal_admin' })).toBe(false);
    expect(resolveAuthenticatedHomePath({ role: 'portal_admin' })).toBe('/portal');
  });

  it('separates queue and setup authorities for internal requests', () => {
    expect(canManagePortalQueue({ role: 'portal_admin' })).toBe(true);
    expect(canManagePortalQueue({ role: 'portal_staff' })).toBe(false);
    expect(canManagePortalSetup({ role: 'portal_admin' })).toBe(true);
    expect(canManagePortalSetup({ role: 'portal_staff' })).toBe(false);
    expect(hasPortalSpecificRole({ role: 'company_admin' })).toBe(false);
  });
});
