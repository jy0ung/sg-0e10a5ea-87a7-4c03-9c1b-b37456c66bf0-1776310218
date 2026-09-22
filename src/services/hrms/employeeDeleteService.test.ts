import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  linkedProfileMock,
  deleteEmployeeRecordMock,
  disableProfileMock,
  deleteInvitedUserMock,
  auditMock,
} = vi.hoisted(() => ({
  linkedProfileMock: vi.fn(),
  deleteEmployeeRecordMock: vi.fn(),
  disableProfileMock: vi.fn(),
  deleteInvitedUserMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('@flc/hrms-services', () => ({
  listEmployeeDirectory: vi.fn(),
  updateEmployee: vi.fn(),
  resolveNamesToIds: vi.fn(),
  getLinkedEmployeeProfile: linkedProfileMock,
  deleteEmployeeRecord: deleteEmployeeRecordMock,
  disableEmployeeProfileAccess: disableProfileMock,
}));

vi.mock('@flc/auth', () => ({
  inviteUser: vi.fn(),
  deleteInvitedUser: deleteInvitedUserMock,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('@/services/auditService', () => ({
  logUserAction: auditMock,
}));

import { deleteEmployee } from './employeeService';

beforeEach(() => {
  vi.clearAllMocks();
  linkedProfileMock.mockResolvedValue(null);
  deleteEmployeeRecordMock.mockResolvedValue(undefined);
  disableProfileMock.mockResolvedValue(undefined);
  deleteInvitedUserMock.mockResolvedValue({ error: null });
});

describe('Employee deletion adapter', () => {
  it('blocks hard delete for a linked non-pending user account', async () => {
    linkedProfileMock.mockResolvedValue({
      id: 'profile-1',
      status: 'active',
      companyId: 'c1',
      accessScope: 'company',
    });

    const result = await deleteEmployee('employee-1', 'c1', 'actor-1');

    expect(result.error).toMatch(/linked user account/i);
    expect(deleteEmployeeRecordMock).not.toHaveBeenCalled();
    expect(deleteInvitedUserMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('does not touch auth when Employee deletion is blocked by history', async () => {
    linkedProfileMock.mockResolvedValue({
      id: 'profile-1',
      status: 'pending',
      companyId: 'c1',
      accessScope: 'company',
    });
    deleteEmployeeRecordMock.mockRejectedValue(
      new Error(
        'Cannot delete this employee because HR or business history exists. Mark the employee as resigned instead.',
      ),
    );

    const result = await deleteEmployee('employee-1', 'c1', 'actor-1');

    expect(result.error).toMatch(/history exists/i);
    expect(deleteInvitedUserMock).not.toHaveBeenCalled();
    expect(disableProfileMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('deletes an unused Employee and audits success', async () => {
    const result = await deleteEmployee('employee-1', 'c1', 'actor-1');

    expect(result.error).toBeNull();
    expect(deleteEmployeeRecordMock).toHaveBeenCalledWith('employee-1', 'c1');
    expect(deleteInvitedUserMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'delete', 'employee', 'employee-1', {},
    );
  });

  it('cleans up a pending invite only after Employee deletion succeeds', async () => {
    linkedProfileMock.mockResolvedValue({
      id: 'profile-1',
      status: 'pending',
      companyId: 'c1',
      accessScope: 'company',
    });

    const result = await deleteEmployee('employee-1', 'c1', 'actor-1');

    expect(result.error).toBeNull();
    expect(deleteEmployeeRecordMock).toHaveBeenCalledWith('employee-1', 'c1');
    expect(deleteInvitedUserMock).toHaveBeenCalledWith('profile-1');
    expect(auditMock).toHaveBeenCalled();
  });

  it('disables the orphaned pending Profile when auth cleanup fails', async () => {
    linkedProfileMock.mockResolvedValue({
      id: 'profile-1',
      status: 'pending',
      companyId: 'c1',
      accessScope: 'company',
    });
    deleteInvitedUserMock.mockResolvedValue({ error: 'auth cleanup unavailable' });

    const result = await deleteEmployee('employee-1', 'c1', 'actor-1');

    expect(result.error).toContain('Employee deleted');
    expect(result.error).toContain('account was disabled');
    expect(disableProfileMock).toHaveBeenCalledWith('profile-1', 'c1');
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'delete', 'employee', 'employee-1', {},
    );
  });
});
