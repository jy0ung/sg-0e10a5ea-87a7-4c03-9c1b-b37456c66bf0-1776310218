import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listDepartmentsMock,
  createDepartmentMock,
  updateDepartmentMock,
  deleteDepartmentMock,
  auditMock,
} = vi.hoisted(() => ({
  listDepartmentsMock: vi.fn(),
  createDepartmentMock: vi.fn(),
  updateDepartmentMock: vi.fn(),
  deleteDepartmentMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('@flc/hrms-services', () => ({
  listDepartments: listDepartmentsMock,
  createDepartment: createDepartmentMock,
  updateDepartment: updateDepartmentMock,
  deleteDepartment: deleteDepartmentMock,
  listJobTitles: vi.fn(),
  createJobTitle: vi.fn(),
  updateJobTitle: vi.fn(),
  deleteJobTitle: vi.fn(),
  listPublicHolidays: vi.fn(),
  createPublicHoliday: vi.fn(),
  updatePublicHoliday: vi.fn(),
  deletePublicHoliday: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('@/services/auditService', () => ({
  logUserAction: auditMock,
}));

import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} from './hrmsAdminService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UBS Department admin adapter', () => {
  it('lists through the package-owned canonical service', async () => {
    listDepartmentsMock.mockResolvedValue([{
      id: 'dept-1',
      companyId: 'c1',
      name: 'Sales',
      headEmployeeId: 'employee-1',
      headEmployeeName: 'Aisyah Rahman',
      isActive: true,
    }]);

    await expect(listDepartments('c1')).resolves.toEqual({
      data: [expect.objectContaining({
        id: 'dept-1',
        headEmployeeId: 'employee-1',
        headEmployeeName: 'Aisyah Rahman',
      })],
      error: null,
    });
    expect(listDepartmentsMock).toHaveBeenCalledWith('c1');
  });

  it('preserves audit logging after canonical create', async () => {
    createDepartmentMock.mockResolvedValue({
      id: 'dept-1',
      companyId: 'c1',
      name: 'Sales',
      headEmployeeId: 'employee-1',
      headEmployeeName: 'Aisyah Rahman',
      isActive: true,
    });

    const input = {
      name: 'Sales',
      headEmployeeId: 'employee-1',
      costCentre: 'CC-SALES',
      isActive: true,
    };

    const result = await createDepartment('c1', 'actor-1', input);

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      id: 'dept-1',
      headEmployeeName: 'Aisyah Rahman',
    });
    expect(createDepartmentMock).toHaveBeenCalledWith('c1', input);
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'create', 'department', 'dept-1', { name: 'Sales' },
    );
  });

  it('preserves audit logging after canonical update', async () => {
    updateDepartmentMock.mockResolvedValue(undefined);
    const input = {
      name: 'Sales',
      headEmployeeId: 'employee-1',
      costCentre: 'CC-SALES',
      isActive: true,
    };

    const result = await updateDepartment('c1', 'dept-1', 'actor-1', input);

    expect(result.error).toBeNull();
    expect(updateDepartmentMock).toHaveBeenCalledWith('c1', 'dept-1', input);
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'update', 'department', 'dept-1', { name: 'Sales' },
    );
  });

  it('surfaces the canonical Employee assignment guard on delete', async () => {
    deleteDepartmentMock.mockRejectedValue(
      new Error('Cannot delete: 2 employee(s) are assigned to this department. Reassign them first.'),
    );

    const result = await deleteDepartment('c1', 'dept-1', 'actor-1');

    expect(result.error).toBe(
      'Cannot delete: 2 employee(s) are assigned to this department. Reassign them first.',
    );
    expect(auditMock).not.toHaveBeenCalledWith(
      'actor-1', 'delete', 'department', 'dept-1', {},
    );
  });
});
