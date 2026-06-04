import { describe, expect, it } from 'vitest';
import {
  ACCOUNTS_AND_UP,
  ADMIN_ONLY,
  HRMS_APPRAISALS,
  HRMS_LEAVE,
  MANAGER_AND_UP,
  PORTAL_QUEUE_ROLES,
  PORTAL_SETUP_ROLES,
} from './routeRoles';
import {
  PORTAL_QUEUE_ROLES as ACCESS_PORTAL_QUEUE_ROLES,
  PORTAL_SETUP_ROLES as ACCESS_PORTAL_SETUP_ROLES,
} from './accessControl';

describe('routeRoles', () => {
  it('keeps route-level gates explicit and shared across app hosts', () => {
    expect(ADMIN_ONLY).toEqual(['super_admin', 'company_admin']);
    expect(MANAGER_AND_UP).toEqual(['super_admin', 'company_admin', 'director', 'general_manager', 'manager']);
    expect(ACCOUNTS_AND_UP).toContain('accounts');
    expect(HRMS_LEAVE).toContain('creator_updater');
    expect(HRMS_APPRAISALS).toContain('sales');
  });

  it('reuses portal role gates from access control', () => {
    expect(PORTAL_QUEUE_ROLES).toEqual(ACCESS_PORTAL_QUEUE_ROLES);
    expect(PORTAL_SETUP_ROLES).toEqual(ACCESS_PORTAL_SETUP_ROLES);
  });
});
