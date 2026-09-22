import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listMock,
  createMock,
  updateMock,
  toggleMock,
  deleteMock,
  approversMock,
  departmentsMock,
  auditMock,
} = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  toggleMock: vi.fn(),
  deleteMock: vi.fn(),
  approversMock: vi.fn(),
  departmentsMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('@flc/hrms-services', () => ({
  listApprovalFlows: listMock,
  createApprovalFlow: createMock,
  updateApprovalFlow: updateMock,
  toggleApprovalFlowActive: toggleMock,
  deleteApprovalFlow: deleteMock,
  listApprovalApproverProfiles: approversMock,
  listApprovalDepartments: departmentsMock,
}));

vi.mock('@/services/auditService', () => ({
  logUserAction: auditMock,
}));

import {
  createApprovalFlow,
  deleteApprovalFlow,
  listApprovalFlows,
  listDepartmentsForSelect,
  listEmployeesForSelect,
  toggleApprovalFlowActive,
  updateApprovalFlow,
} from './approvalFlowService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Approval Flow app adapter', () => {
  const input = {
    name: 'Leave Approval',
    entityType: 'leave_request' as const,
    isActive: true,
    departmentId: null,
    isDefault: true,
    steps: [{
      stepOrder: 1,
      name: 'Manager',
      approverType: 'direct_manager' as const,
      isActive: true,
      allowSelfApproval: false,
    }],
  };

  it('lists complete canonical flows for HRMS and Internal Request setup', async () => {
    listMock.mockResolvedValue([{
      id: 'flow-1',
      companyId: 'c1',
      name: 'Leave Approval',
      entityType: 'leave_request',
      isActive: true,
      isDefault: true,
      conditions: null,
      matchPriority: 0,
      steps: [],
      createdAt: '',
      updatedAt: '',
    }]);

    const result = await listApprovalFlows('c1');

    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({
      id: 'flow-1',
      conditions: null,
      matchPriority: 0,
    });
    expect(listMock).toHaveBeenCalledWith('c1');
  });

  it('preserves create/update audit behavior', async () => {
    createMock.mockResolvedValue({ id: 'flow-1', name: 'Leave Approval' });
    updateMock.mockResolvedValue(undefined);

    const created = await createApprovalFlow('c1', 'actor-1', input);
    const updated = await updateApprovalFlow('flow-1', 'c1', 'actor-1', input);

    expect(created.error).toBeNull();
    expect(updated.error).toBeNull();
    expect(createMock).toHaveBeenCalledWith('c1', input);
    expect(updateMock).toHaveBeenCalledWith('c1', 'flow-1', input);
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'create', 'approval_flow', 'flow-1', { name: 'Leave Approval' },
    );
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'update', 'approval_flow', 'flow-1', { name: 'Leave Approval' },
    );
  });

  it('audits active-state changes through the canonical service', async () => {
    toggleMock.mockResolvedValue(undefined);

    const result = await toggleApprovalFlowActive(
      'c1', 'flow-1', false, 'actor-1',
    );

    expect(result.error).toBeNull();
    expect(toggleMock).toHaveBeenCalledWith(
      'c1', 'flow-1', false, 'actor-1',
    );
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'update', 'approval_flow', 'flow-1', { isActive: false },
    );
  });

  it('does not audit a history-protected delete as successful', async () => {
    deleteMock.mockRejectedValue(
      new Error('Approval Flow has workflow history and cannot be deleted. Deactivate it instead.'),
    );

    const result = await deleteApprovalFlow('c1', 'flow-1', 'actor-1');

    expect(result.error).toContain('workflow history');
    expect(auditMock).not.toHaveBeenCalledWith(
      'actor-1', 'delete', 'approval_flow', 'flow-1', {},
    );
  });

  it('keeps selector compatibility while package owns the reads', async () => {
    approversMock.mockResolvedValue([{ id: 'profile-1', name: 'Aisyah' }]);
    departmentsMock.mockResolvedValue([{ id: 'dept-1', name: 'Sales' }]);

    await expect(listEmployeesForSelect('c1')).resolves.toEqual({
      data: [{ id: 'profile-1', name: 'Aisyah' }],
      error: null,
    });
    await expect(listDepartmentsForSelect('c1')).resolves.toEqual({
      data: [{ id: 'dept-1', name: 'Sales' }],
      error: null,
    });
  });
});
