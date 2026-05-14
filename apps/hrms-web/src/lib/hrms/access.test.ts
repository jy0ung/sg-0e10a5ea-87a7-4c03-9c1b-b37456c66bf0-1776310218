import { describe, expect, it } from 'vitest';
import type { HrmsRole } from '@/types';
import { deriveHrmsAccess, matchesHrmsApproverRole } from './access';

function makeRole(overrides: Partial<HrmsRole> = {}): HrmsRole {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    companyId: overrides.companyId ?? 'company-1',
    code: overrides.code ?? 'staff',
    name: overrides.name ?? 'Staff',
    category: overrides.category ?? 'staff',
    scope: overrides.scope ?? 'self',
    authorityLevel: overrides.authorityLevel ?? 90,
    description: overrides.description,
    canApproveRequests: overrides.canApproveRequests ?? false,
    canManageEmployeeRecords: overrides.canManageEmployeeRecords ?? false,
    canViewHrmsReports: overrides.canViewHrmsReports ?? false,
    isActive: overrides.isActive ?? true,
    isSystemDefault: overrides.isSystemDefault ?? true,
    assignedUserCount: overrides.assignedUserCount ?? 0,
    lastUpdatedByName: overrides.lastUpdatedByName,
    createdAt: overrides.createdAt ?? '2026-05-13T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-13T00:00:00.000Z',
  };
}

describe('deriveHrmsAccess', () => {
  it('grants self-service routes to staff without exposing admin modules', () => {
    const access = deriveHrmsAccess([makeRole()]);

    expect(access.canAccessRoute('leave')).toBe(true);
    expect(access.canAccessRoute('profile')).toBe(true);
    expect(access.canAccessRoute('employees')).toBe(false);
    expect(access.canAccessRoute('payroll')).toBe(false);
    expect(access.canAccessRoute('settings')).toBe(false);
  });

  it('grants management routes from HRMS roles instead of any main-app role', () => {
    const access = deriveHrmsAccess([
      makeRole({
        code: 'department_manager',
        name: 'Department Manager',
        category: 'department',
        scope: 'department',
        authorityLevel: 40,
        canApproveRequests: true,
        canManageEmployeeRecords: true,
      }),
    ]);

    expect(access.canAccessRoute('employees')).toBe(true);
    expect(access.canAccessRoute('approvals')).toBe(true);
    expect(access.canManageEmployees).toBe(true);
  });
});

describe('matchesHrmsApproverRole', () => {
  it('matches the canonical staff role code', () => {
    expect(matchesHrmsApproverRole('staff', { hrmsRoleCodes: ['staff'] })).toBe(true);
  });

  it('maps the legacy employee code to staff assignments', () => {
    expect(matchesHrmsApproverRole('employee', { hrmsRoleCodes: ['staff'] })).toBe(true);
  });

  it('maps the legacy analyst main-app role to staff assignments for workflow compatibility', () => {
    expect(matchesHrmsApproverRole('analyst', { hrmsRoleCodes: ['staff'] })).toBe(true);
  });
});