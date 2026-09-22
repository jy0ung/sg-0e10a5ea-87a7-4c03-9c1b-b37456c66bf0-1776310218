import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createMock,
  listMock,
  replaceMock,
  updateMock,
  hasMock,
  auditMock,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  listMock: vi.fn(),
  replaceMock: vi.fn(),
  updateMock: vi.fn(),
  hasMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('@flc/hrms-services', () => ({
  createHrmsRole: createMock,
  hrmsRoleHasAssignments: hasMock,
  listAssignedHrmsRoles: vi.fn(),
  listHrmsRoleAssignments: vi.fn(),
  listHrmsRoles: listMock,
  replaceHrmsRoleEmployeeAssignments: replaceMock,
  updateHrmsRole: updateMock,
  userHasHrmsRole: vi.fn(),
}));

vi.mock('@/services/auditService', () => ({
  logUserAction: auditMock,
}));

import {
  createHrmsRole,
  replaceHrmsRoleEmployeeAssignments,
  updateHrmsRole,
} from './hrmsRoleService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HRMS role service adapter', () => {
  const input = {
    name: 'HR Manager',
    category: 'hr' as const,
    scope: 'company' as const,
    authorityLevel: 30,
    description: 'HR authority',
    canApproveRequests: true,
    canManageEmployeeRecords: true,
    canViewHrmsReports: true,
    isActive: true,
  };

  it('preserves create/update audit events', async () => {
    createMock.mockResolvedValue({ id: 'role-1', name: 'HR Manager' });
    updateMock.mockResolvedValue(undefined);

    const created = await createHrmsRole('c1', 'actor-1', input);
    const updated = await updateHrmsRole('c1', 'role-1', 'actor-1', input);

    expect(created.error).toBeNull();
    expect(updated.error).toBeNull();
    expect(createMock).toHaveBeenCalledWith('c1', 'actor-1', input);
    expect(updateMock).toHaveBeenCalledWith('c1', 'role-1', 'actor-1', input);
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'create', 'hrms_role', 'role-1', { name: 'HR Manager' },
    );
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'update', 'hrms_role', 'role-1', { name: 'HR Manager' },
    );
  });

  it('deduplicates assignment inputs and audits the canonical count', async () => {
    replaceMock.mockResolvedValue(undefined);

    const result = await replaceHrmsRoleEmployeeAssignments(
      'c1',
      'role-1',
      'actor-1',
      ['employee-1', 'employee-1', 'employee-2'],
    );

    expect(result.error).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith(
      'c1',
      'role-1',
      ['employee-1', 'employee-2'],
    );
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1',
      'update',
      'hrms_role_assignments',
      'role-1',
      { assignedCount: 2 },
    );
  });

  it('does not audit failed assignment replacement', async () => {
    replaceMock.mockRejectedValue(new Error('assignment rejected'));

    const result = await replaceHrmsRoleEmployeeAssignments(
      'c1',
      'role-1',
      'actor-1',
      ['employee-1'],
    );

    expect(result.error).toBe('assignment rejected');
    expect(auditMock).not.toHaveBeenCalled();
  });
});
