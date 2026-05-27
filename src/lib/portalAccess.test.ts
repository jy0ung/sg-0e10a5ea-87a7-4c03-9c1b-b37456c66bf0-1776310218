import { describe, expect, it } from 'vitest';

import {
  canAccessMainApp,
  canManagePortalQueue,
  canManagePortalSetup,
  hasPortalSpecificRole,
  isPortalOnlyUser,
  resolveAuthenticatedHomePath,
} from './portalAccess';

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

  describe('hasPortalSpecificRole', () => {
    it('matches the three portal-specific roles', () => {
      expect(hasPortalSpecificRole({ role: 'portal_admin' })).toBe(true);
      expect(hasPortalSpecificRole({ role: 'portal_manager' })).toBe(true);
      expect(hasPortalSpecificRole({ role: 'portal_staff' })).toBe(true);
    });

    it('rejects platform admins even though they can also manage the portal queue', () => {
      // company_admin has PORTAL_QUEUE access via canManagePortalQueue but is
      // a main-app user, so this predicate (which drives the /portal redirect)
      // must reject them.
      expect(hasPortalSpecificRole({ role: 'company_admin' })).toBe(false);
      expect(hasPortalSpecificRole({ role: 'super_admin' })).toBe(false);
    });

    it('rejects portal_access_only users without a portal-specific role', () => {
      // These are the HRMS-only users — they hit the /hrms redirect, not /portal.
      expect(hasPortalSpecificRole({ role: 'analyst', portal_access_only: true })).toBe(false);
    });

    it('handles null/undefined subjects', () => {
      expect(hasPortalSpecificRole(null)).toBe(false);
      expect(hasPortalSpecificRole(undefined)).toBe(false);
      expect(hasPortalSpecificRole({})).toBe(false);
    });
  });

  describe('canManagePortalQueue', () => {
    it('matches the PORTAL_QUEUE_ROLES set', () => {
      expect(canManagePortalQueue({ role: 'super_admin' })).toBe(true);
      expect(canManagePortalQueue({ role: 'company_admin' })).toBe(true);
      expect(canManagePortalQueue({ role: 'portal_admin' })).toBe(true);
      expect(canManagePortalQueue({ role: 'portal_manager' })).toBe(true);
    });

    it('rejects roles that should only submit requests', () => {
      expect(canManagePortalQueue({ role: 'portal_staff' })).toBe(false);
      expect(canManagePortalQueue({ role: 'sales' })).toBe(false);
      expect(canManagePortalQueue({ role: 'accounts' })).toBe(false);
    });

    it('handles missing role gracefully', () => {
      expect(canManagePortalQueue(null)).toBe(false);
      expect(canManagePortalQueue({})).toBe(false);
    });
  });

  describe('canManagePortalSetup', () => {
    it('grants setup to super_admin, company_admin, and portal_admin only', () => {
      expect(canManagePortalSetup({ role: 'super_admin' })).toBe(true);
      expect(canManagePortalSetup({ role: 'company_admin' })).toBe(true);
      expect(canManagePortalSetup({ role: 'portal_admin' })).toBe(true);
    });

    it('does not grant setup to portal_manager (queue-only by design)', () => {
      // portal_manager can triage but not write categories/templates/routing
      // until a read-only setup view is built.
      expect(canManagePortalSetup({ role: 'portal_manager' })).toBe(false);
    });

    it('rejects everyone else', () => {
      expect(canManagePortalSetup({ role: 'portal_staff' })).toBe(false);
      expect(canManagePortalSetup({ role: 'manager' })).toBe(false);
      expect(canManagePortalSetup(null)).toBe(false);
    });
  });
});