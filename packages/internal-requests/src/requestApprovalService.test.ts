import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@flc/supabase';
import { canProfileReviewInternalRequestApproval } from './requestApprovalService';

vi.mock('@flc/supabase', () => ({
  supabase: { from: vi.fn() },
}));

type QueryResult = { data: unknown; error: { message: string } | null };

function maybeSingleChain(result: QueryResult) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
}

function assignmentChain(result: QueryResult) {
  const chain = {
    data: result.data,
    error: result.error,
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    limit: vi.fn(() => chain),
  };
  return chain;
}

function pendingInstance(overrides: Record<string, unknown> = {}) {
  return {
    flow_id: 'flow-1',
    requester_id: 'requester-1',
    status: 'pending',
    current_step_id: 'step-1',
    current_approver_role: null,
    current_approver_user_id: null,
    ...overrides,
  };
}

function activeStep(allowSelfApproval = false) {
  return {
    allow_self_approval: allowSelfApproval,
    is_active: true,
  };
}

describe('canProfileReviewInternalRequestApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows the materialized specific Profile', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(maybeSingleChain({ data: pendingInstance({
        current_approver_user_id: 'approver-1',
      }), error: null }) as never)
      .mockReturnValueOnce(maybeSingleChain({ data: activeStep(), error: null }) as never);

    const result = await canProfileReviewInternalRequestApproval(
      'company-1',
      'ticket-1',
      'approver-1',
    );

    expect(result).toEqual({ data: true, error: null });
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('allows a matching HRMS Role assignment through Profile identity', async () => {
    const roleChain = maybeSingleChain({ data: { id: '11111111-1111-4111-8111-111111111111' }, error: null });
    const profileChain = maybeSingleChain({ data: { employee_id: null }, error: null });
    const assignments = assignmentChain({ data: [{ id: 'assignment-1' }], error: null });

    vi.mocked(supabase.from)
      .mockReturnValueOnce(maybeSingleChain({ data: pendingInstance({
        current_approver_role: '11111111-1111-4111-8111-111111111111',
      }), error: null }) as never)
      .mockReturnValueOnce(maybeSingleChain({ data: activeStep(), error: null }) as never)
      .mockReturnValueOnce(roleChain as never)
      .mockReturnValueOnce(profileChain as never)
      .mockReturnValueOnce(assignments as never);

    const result = await canProfileReviewInternalRequestApproval(
      'company-1',
      'ticket-1',
      'approver-1',
    );

    expect(result).toEqual({ data: true, error: null });
    expect(assignments.eq).toHaveBeenCalledWith('profile_id', 'approver-1');
  });

  it('allows a matching HRMS Role assignment through linked Employee identity', async () => {
    const roleChain = maybeSingleChain({ data: { id: 'role-1' }, error: null });
    const profileChain = maybeSingleChain({ data: { employee_id: 'employee-1' }, error: null });
    const assignments = assignmentChain({ data: [{ id: 'assignment-1' }], error: null });

    vi.mocked(supabase.from)
      .mockReturnValueOnce(maybeSingleChain({ data: pendingInstance({
        current_approver_role: 'department_manager',
      }), error: null }) as never)
      .mockReturnValueOnce(maybeSingleChain({ data: activeStep(), error: null }) as never)
      .mockReturnValueOnce(roleChain as never)
      .mockReturnValueOnce(profileChain as never)
      .mockReturnValueOnce(assignments as never);

    const result = await canProfileReviewInternalRequestApproval(
      'company-1',
      'ticket-1',
      'approver-1',
    );

    expect(result).toEqual({ data: true, error: null });
    expect(roleChain.eq).toHaveBeenCalledWith('code', 'department_manager');
    expect(assignments.or).toHaveBeenCalledWith(
      'profile_id.eq.approver-1,employee_id.eq.employee-1',
    );
  });

  it('fails closed when the materialized HRMS Role is inactive', async () => {
    const roleChain = maybeSingleChain({ data: null, error: null });

    vi.mocked(supabase.from)
      .mockReturnValueOnce(maybeSingleChain({ data: pendingInstance({
        current_approver_role: '11111111-1111-4111-8111-111111111111',
      }), error: null }) as never)
      .mockReturnValueOnce(maybeSingleChain({ data: activeStep(), error: null }) as never)
      .mockReturnValueOnce(roleChain as never);

    const result = await canProfileReviewInternalRequestApproval(
      'company-1',
      'ticket-1',
      'approver-1',
    );

    expect(result).toEqual({ data: false, error: null });
    expect(roleChain.eq).toHaveBeenCalledWith('is_active', true);
    expect(supabase.from).toHaveBeenCalledTimes(3);
  });

  it('does not grant role review to an unrelated Profile merely because it may be an app admin', async () => {
    const assignments = assignmentChain({ data: [], error: null });

    vi.mocked(supabase.from)
      .mockReturnValueOnce(maybeSingleChain({ data: pendingInstance({
        current_approver_role: 'department_manager',
      }), error: null }) as never)
      .mockReturnValueOnce(maybeSingleChain({ data: activeStep(), error: null }) as never)
      .mockReturnValueOnce(maybeSingleChain({ data: { id: 'role-1' }, error: null }) as never)
      .mockReturnValueOnce(maybeSingleChain({ data: { employee_id: null }, error: null }) as never)
      .mockReturnValueOnce(assignments as never);

    const result = await canProfileReviewInternalRequestApproval(
      'company-1',
      'ticket-1',
      'unassigned-admin-profile',
    );

    expect(result).toEqual({ data: false, error: null });
  });

  it('hides self approval when the current Step disallows it', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(maybeSingleChain({ data: pendingInstance({
        requester_id: 'requester-1',
        current_approver_user_id: 'requester-1',
      }), error: null }) as never)
      .mockReturnValueOnce(maybeSingleChain({ data: activeStep(false), error: null }) as never);

    const result = await canProfileReviewInternalRequestApproval(
      'company-1',
      'ticket-1',
      'requester-1',
    );

    expect(result).toEqual({ data: false, error: null });
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });
});
