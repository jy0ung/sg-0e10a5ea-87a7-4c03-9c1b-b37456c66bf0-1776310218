import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_SECTIONS } from './rolePermissions';
import { HRMS_SELF_SERVICE_ROLES } from './hrmsConfig';

describe('RBAC defaults', () => {
  it('keeps HRMS out of UBS default sections for self-service staff roles', () => {
    for (const role of HRMS_SELF_SERVICE_ROLES) {
      expect(DEFAULT_ROLE_SECTIONS[role]).not.toContain('HRMS');
    }
  });

  it('keeps management roles on the HRMS manager path', () => {
    expect(HRMS_SELF_SERVICE_ROLES).toEqual(
      expect.arrayContaining(['director', 'general_manager', 'manager'])
    );
  });
});
