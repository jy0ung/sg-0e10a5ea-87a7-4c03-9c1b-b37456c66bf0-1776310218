import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listMock,
  createMock,
  updateMock,
  deleteMock,
  auditMock,
} = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('@flc/hrms-services', () => ({
  listDepartments: vi.fn(),
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
  deleteDepartment: vi.fn(),
  listJobTitles: vi.fn(),
  createJobTitle: vi.fn(),
  updateJobTitle: vi.fn(),
  deleteJobTitle: vi.fn(),
  listAllLeaveTypes: vi.fn(),
  createLeaveType: vi.fn(),
  updateLeaveType: vi.fn(),
  deleteLeaveType: vi.fn(),
  listPublicHolidays: listMock,
  createPublicHoliday: createMock,
  updatePublicHoliday: updateMock,
  deletePublicHoliday: deleteMock,
}));

vi.mock('@/services/auditService', () => ({
  logUserAction: auditMock,
}));

import {
  createHoliday,
  deleteHoliday,
  listHolidays,
  updateHoliday,
} from './hrmsAdminService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UBS Public Holiday admin adapter', () => {
  const input = {
    name: 'Malaysia Day',
    date: '2026-09-16',
    holidayType: 'public' as const,
    isRecurring: true,
  };

  it('lists through the package-owned canonical service', async () => {
    listMock.mockResolvedValue([{
      id: 'holiday-1',
      companyId: 'c1',
      name: 'Malaysia Day',
      date: '2026-09-16',
      holidayType: 'public',
      isRecurring: true,
      createdAt: '',
      updatedAt: '',
    }]);

    await expect(listHolidays('c1')).resolves.toEqual({
      data: [expect.objectContaining({
        id: 'holiday-1',
        name: 'Malaysia Day',
      })],
      error: null,
    });
    expect(listMock).toHaveBeenCalledWith('c1');
  });

  it('preserves create and update audit events', async () => {
    createMock.mockResolvedValue({
      id: 'holiday-1',
      companyId: 'c1',
      ...input,
      createdAt: '',
      updatedAt: '',
    });
    updateMock.mockResolvedValue(undefined);

    const created = await createHoliday('c1', 'actor-1', input);
    const updated = await updateHoliday('c1', 'holiday-1', 'actor-1', input);

    expect(created.error).toBeNull();
    expect(updated.error).toBeNull();
    expect(createMock).toHaveBeenCalledWith('c1', input);
    expect(updateMock).toHaveBeenCalledWith('c1', 'holiday-1', input);
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'create', 'holiday', 'holiday-1',
      { name: 'Malaysia Day', date: '2026-09-16' },
    );
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'update', 'holiday', 'holiday-1', { name: 'Malaysia Day' },
    );
  });

  it('audits delete only after canonical success', async () => {
    deleteMock.mockResolvedValue(undefined);

    const result = await deleteHoliday('c1', 'holiday-1', 'actor-1');

    expect(result.error).toBeNull();
    expect(deleteMock).toHaveBeenCalledWith('c1', 'holiday-1');
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'delete', 'holiday', 'holiday-1', {},
    );
  });

  it('surfaces package errors without false success audit', async () => {
    deleteMock.mockRejectedValue(new Error('holiday delete denied'));

    const result = await deleteHoliday('c1', 'holiday-1', 'actor-1');

    expect(result.error).toBe('holiday delete denied');
    expect(auditMock).not.toHaveBeenCalled();
  });
});
