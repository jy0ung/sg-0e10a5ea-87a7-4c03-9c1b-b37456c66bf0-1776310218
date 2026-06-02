import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resubmitApprovalInstance } from './approvalEngine';
import { resolveStepRouting } from './approvalRouting';
import { untypedSupabase } from '../shared/supabaseClient';

vi.mock('../shared/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  untypedSupabase: { from: vi.fn() },
}));

vi.mock('./approvalRouting', () => ({
  resolveStepRouting: vi.fn(),
  userMatchesAssignedApproverRole: vi.fn(),
}));

function selectMaybeSingleChain(result: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
}

function selectOrderChain(result: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(async () => result),
  };
  return chain;
}

function updateEqChain(result: unknown) {
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn(async () => result),
  };
  return chain;
}

describe('approvalEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveStepRouting).mockResolvedValue({
      approverRole: 'role-1',
      approverUserId: null,
    });
  });

  it('resubmits rejected approval instances through the canonical approval_steps table query', async () => {
    const instanceChain = selectMaybeSingleChain({
      data: {
        id: 'instance-1',
        flow_id: 'flow-1',
        requester_id: 'requester-1',
        status: 'rejected',
      },
      error: null,
    });
    const stepsChain = selectOrderChain({
      data: [
        {
          id: 'step-1',
          step_order: 1,
          name: 'Manager review',
          approver_type: 'role',
          approver_role: 'role-1',
          is_active: true,
          allow_self_approval: false,
        },
      ],
      error: null,
    });
    const updateChain = updateEqChain({ error: null });

    vi.mocked(untypedSupabase.from)
      .mockReturnValueOnce(instanceChain)
      .mockReturnValueOnce(stepsChain)
      .mockReturnValueOnce(updateChain);

    await resubmitApprovalInstance('company-1', 'leave_request', 'leave-1', 'requester-1');

    expect(untypedSupabase.from).toHaveBeenNthCalledWith(1, 'approval_instances');
    expect(untypedSupabase.from).toHaveBeenNthCalledWith(2, 'approval_steps');
    expect(untypedSupabase.from).toHaveBeenNthCalledWith(3, 'approval_instances');
    expect(stepsChain.eq).toHaveBeenCalledWith('flow_id', 'flow-1');
    expect(resolveStepRouting).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'step-1', stepOrder: 1 }),
      'requester-1',
      'company-1',
    );
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
      requester_id: 'requester-1',
      status: 'pending',
      current_step_id: 'step-1',
      current_step_order: 1,
      current_step_name: 'Manager review',
      current_approver_role: 'role-1',
      current_approver_user_id: null,
    }));
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'instance-1');
  });
});
