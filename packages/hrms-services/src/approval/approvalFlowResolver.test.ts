import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, resolveProfileMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  resolveProfileMock: vi.fn(),
}));

vi.mock('../shared/supabaseClient', () => ({
  supabase: { from: fromMock },
}));

vi.mock('../shared/identity', () => ({
  resolveRequiredProfileId: resolveProfileMock,
}));

import {
  resolveApprovalFlowForRequester,
  selectApprovalFlowCandidate,
  type ApprovalFlowCandidate,
} from './approvalFlowResolver';

function maybeSingleChain(result: unknown) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result);
  return chain;
}

function resultChain(result: unknown) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

const flows: ApprovalFlowCandidate[] = [
  { id: 'dept-a', departmentId: 'department-a', isDefault: false },
  { id: 'dept-b', departmentId: 'department-b', isDefault: false },
  { id: 'default', departmentId: null, isDefault: true },
  { id: 'fallback', departmentId: null, isDefault: false },
];

describe('selectApprovalFlowCandidate', () => {
  it('prefers an exact Employee department flow', () => {
    expect(selectApprovalFlowCandidate(flows, 'department-a', 'leave_request')).toBe('dept-a');
  });

  it('falls back to the default unscoped flow', () => {
    expect(selectApprovalFlowCandidate(flows, 'department-c', 'leave_request')).toBe('default');
  });

  it('uses an unscoped non-default flow when no default exists', () => {
    expect(
      selectApprovalFlowCandidate(
        flows.filter(flow => flow.id !== 'default'),
        'department-c',
        'leave_request',
      ),
    ).toBe('fallback');
  });

  it('returns null when only non-matching department flows exist', () => {
    expect(
      selectApprovalFlowCandidate(
        flows.filter(flow => flow.departmentId !== null),
        'department-c',
        'leave_request',
      ),
    ).toBeNull();
  });

  it('rejects ambiguous flows at the same priority', () => {
    expect(() => selectApprovalFlowCandidate([
      { id: 'a1', departmentId: 'department-a', isDefault: false },
      { id: 'a2', departmentId: 'department-a', isDefault: false },
    ], 'department-a', 'leave_request')).toThrow(/multiple department-scoped approval flows/i);

    expect(() => selectApprovalFlowCandidate([
      { id: 'd1', departmentId: null, isDefault: true },
      { id: 'd2', departmentId: null, isDefault: true },
    ], null, 'leave_request')).toThrow(/multiple default approval flows/i);
  });
});

describe('resolveApprovalFlowForRequester', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveProfileMock.mockResolvedValue('profile-1');
  });

  it('derives department scope from the canonical Employee record', async () => {
    const profile = maybeSingleChain({
      data: { employee_id: 'employee-1', company_id: 'company-1', access_scope: 'company' },
      error: null,
    });
    const employee = maybeSingleChain({
      data: { department_id: 'department-a' },
      error: null,
    });
    const approvalFlows = resultChain({
      data: [
        { id: 'flow-dept', department_id: 'department-a', is_default: false },
        { id: 'flow-default', department_id: null, is_default: true },
      ],
      error: null,
    });

    fromMock
      .mockReturnValueOnce(profile)
      .mockReturnValueOnce(employee)
      .mockReturnValueOnce(approvalFlows);

    await expect(
      resolveApprovalFlowForRequester('company-1', 'leave_request', 'profile-1'),
    ).resolves.toBe('flow-dept');

    expect(fromMock).toHaveBeenNthCalledWith(1, 'profiles');
    expect(fromMock).toHaveBeenNthCalledWith(2, 'employees');
    expect(fromMock).toHaveBeenNthCalledWith(3, 'approval_flows');
    expect(employee.eq).toHaveBeenCalledWith('company_id', 'company-1');
  });

  it('uses default/unscoped routing when the Profile has no Employee link', async () => {
    const profile = maybeSingleChain({
      data: { employee_id: null, company_id: 'company-1', access_scope: 'company' },
      error: null,
    });
    const approvalFlows = resultChain({
      data: [
        { id: 'flow-dept', department_id: 'department-a', is_default: false },
        { id: 'flow-default', department_id: null, is_default: true },
      ],
      error: null,
    });

    fromMock
      .mockReturnValueOnce(profile)
      .mockReturnValueOnce(approvalFlows);

    await expect(
      resolveApprovalFlowForRequester('company-1', 'leave_request', 'profile-1'),
    ).resolves.toBe('flow-default');

    expect(fromMock).not.toHaveBeenCalledWith('employees');
  });

  it('rejects a non-global requester Profile outside the requested company', async () => {
    const profile = maybeSingleChain({
      data: { employee_id: null, company_id: 'company-2', access_scope: 'company' },
      error: null,
    });
    fromMock.mockReturnValueOnce(profile);

    await expect(
      resolveApprovalFlowForRequester('company-1', 'leave_request', 'profile-1'),
    ).rejects.toThrow(/does not belong to the requested company/i);
  });

  it('allows a global requester without Employee scope to use the default flow', async () => {
    const profile = maybeSingleChain({
      data: { employee_id: null, company_id: null, access_scope: 'global' },
      error: null,
    });
    const approvalFlows = resultChain({
      data: [
        { id: 'flow-dept', department_id: 'department-a', is_default: false },
        { id: 'flow-default', department_id: null, is_default: true },
      ],
      error: null,
    });

    fromMock
      .mockReturnValueOnce(profile)
      .mockReturnValueOnce(approvalFlows);

    await expect(
      resolveApprovalFlowForRequester('company-1', 'leave_request', 'profile-global'),
    ).resolves.toBe('flow-default');
  });
});
