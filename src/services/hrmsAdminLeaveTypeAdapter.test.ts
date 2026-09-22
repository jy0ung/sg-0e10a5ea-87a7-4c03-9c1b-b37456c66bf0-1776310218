import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listLeaveTypesMock,
  createLeaveTypeMock,
  updateLeaveTypeMock,
  deleteLeaveTypeMock,
  auditMock,
} = vi.hoisted(() => ({
  listLeaveTypesMock: vi.fn(),
  createLeaveTypeMock: vi.fn(),
  updateLeaveTypeMock: vi.fn(),
  deleteLeaveTypeMock: vi.fn(),
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
  listAllLeaveTypes: listLeaveTypesMock,
  createLeaveType: createLeaveTypeMock,
  updateLeaveType: updateLeaveTypeMock,
  deleteLeaveType: deleteLeaveTypeMock,
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
  createLeaveType,
  deleteLeaveType,
  listAllLeaveTypes,
  updateLeaveType,
} from './hrmsAdminService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UBS Leave Type admin adapter', () => {
  const input = {
    name: 'Annual Leave',
    code: 'al',
    daysPerYear: 14,
    defaultDays: 14,
    carryForward: true,
    isPaid: true,
    requiresBalance: true,
    minAdvanceNoticeDays: 7,
    active: true,
  };

  it('lists through the canonical package service', async () => {
    listLeaveTypesMock.mockResolvedValue([{
      id: 'lt-1',
      companyId: 'c1',
      name: 'Annual Leave',
      code: 'AL',
      daysPerYear: 14,
      defaultDays: 14,
      carryForward: true,
      isPaid: true,
      requiresBalance: true,
      minAdvanceNoticeDays: 7,
      active: true,
    }]);

    const result = await listAllLeaveTypes('c1');

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      id: 'lt-1',
      code: 'AL',
      requiresBalance: true,
      minAdvanceNoticeDays: 7,
    });
    expect(listLeaveTypesMock).toHaveBeenCalledWith('c1');
  });

  it('preserves create and update audit events', async () => {
    createLeaveTypeMock.mockResolvedValue({
      id: 'lt-1',
      companyId: 'c1',
      ...input,
      code: 'AL',
    });
    updateLeaveTypeMock.mockResolvedValue(undefined);

    const created = await createLeaveType('c1', 'actor-1', input);
    const updated = await updateLeaveType('c1', 'lt-1', 'actor-1', input);

    expect(created.error).toBeNull();
    expect(updated.error).toBeNull();
    expect(createLeaveTypeMock).toHaveBeenCalledWith('c1', input);
    expect(updateLeaveTypeMock).toHaveBeenCalledWith('c1', 'lt-1', input);
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'create', 'leave_type', 'lt-1', { name: 'Annual Leave', code: 'al' },
    );
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'update', 'leave_type', 'lt-1', { name: 'Annual Leave' },
    );
  });

  it('audits referenced removal as deactivation', async () => {
    deleteLeaveTypeMock.mockResolvedValue('deactivated');

    const result = await deleteLeaveType('c1', 'lt-1', 'actor-1');

    expect(result.error).toBeNull();
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'update', 'leave_type', 'lt-1', { action: 'deactivated' },
    );
  });

  it('audits unreferenced removal as delete', async () => {
    deleteLeaveTypeMock.mockResolvedValue('deleted');

    const result = await deleteLeaveType('c1', 'lt-1', 'actor-1');

    expect(result.error).toBeNull();
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'delete', 'leave_type', 'lt-1', {},
    );
  });

  it('surfaces canonical delete errors without auditing success', async () => {
    deleteLeaveTypeMock.mockRejectedValue(new Error('Could not deactivate: denied'));

    const result = await deleteLeaveType('c1', 'lt-1', 'actor-1');

    expect(result.error).toBe('Could not deactivate: denied');
    expect(auditMock).not.toHaveBeenCalled();
  });
});
