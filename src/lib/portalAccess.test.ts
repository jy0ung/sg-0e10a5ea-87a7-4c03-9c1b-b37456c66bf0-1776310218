import { describe, expect, it } from 'vitest';

import { canAccessMainApp, isPortalOnlyUser, resolveAuthenticatedHomePath } from './portalAccess';

describe('portalAccess', () => {
  it('treats explicit portal_access_only flag as portal-only', () => {
    expect(isPortalOnlyUser({ role: 'analyst', portal_access_only: true })).toBe(true);
    expect(canAccessMainApp({ role: 'analyst', portal_access_only: true })).toBe(false);
    expect(resolveAuthenticatedHomePath({ role: 'analyst', portal_access_only: true })).toBe('/portal');
  });

  it('accepts camelCase portalAccessOnly flag for frontend profile objects', () => {
    expect(isPortalOnlyUser({ role: 'analyst', portalAccessOnly: true })).toBe(true);
  });

  it('recognizes future portal-specific roles as portal-only users', () => {
    expect(isPortalOnlyUser({ role: 'portal_staff' })).toBe(true);
    expect(resolveAuthenticatedHomePath({ role: 'portal_manager' })).toBe('/portal');
  });

  it('keeps existing platform roles on the main app home path', () => {
    expect(isPortalOnlyUser({ role: 'company_admin' })).toBe(false);
    expect(canAccessMainApp({ role: 'company_admin' })).toBe(true);
    expect(resolveAuthenticatedHomePath({ role: 'company_admin' })).toBe('/');
  });
});