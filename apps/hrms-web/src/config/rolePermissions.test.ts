import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_SECTIONS } from './rolePermissions';
import { HRMS_SELF_SERVICE_ROLES } from './hrmsConfig';

describe('RBAC defaults', () => {
  it('keeps HRMS in the default section matrix for all self-service staff roles', () => {
    for (const role of HRMS_SELF_SERVICE_ROLES) {
      expect(DEFAULT_ROLE_SECTIONS[role]).toContain('HRMS');
    }
  });

  it('keeps management roles on the HRMS manager path', () => {
    expect(HRMS_SELF_SERVICE_ROLES).toEqual(
      expect.arrayContaining(['director', 'general_manager', 'manager'])
    );
  });
});
