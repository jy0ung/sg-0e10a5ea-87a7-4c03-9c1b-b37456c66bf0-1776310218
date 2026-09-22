import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fromMock,
  rpcMock,
  notifyMock,
  auditMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  notifyMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('@flc/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}));

vi.mock('@flc/platform-services', () => ({
  createNotifications: notifyMock,
  logUserAction: auditMock,
}));

import { reviewInternalRequestApproval } from './requestApprovalService';

function approvalGate(currentStepId = 'step-1') {
  const result = {
    data: [{
      id: 'instance-1',
      entity_id: 'ticket-1',
      status: 'pending',
      current_step_id: currentStepId,
      current_step_order: 1,
      current_step_name: 'Manager approval',
      current_approver_role: null,
      current_approver_user_id: 'approver-1',
    }],
    error: null,
  };
  const node: Record<string, any> = {};
  node.select = vi.fn(() => node);
  node.eq = vi.fn(() => node);
  node.in = vi.fn().mockResolvedValue(result);
  return node;
}

beforeEach(() => {
  vi.clearAllMocks();
  fromMock.mockImplementation((table: string) => {
    if (table === 'approval_instances') return approvalGate();
    throw new Error(`Unexpected table access: ${table}`);
  });
});

describe('reviewInternalRequestApproval', () => {
  it('passes the observed step token to the atomic RPC and audits the result', async () => {
    rpcMock.mockResolvedValue({
      data: {
        instanceId: 'instance-1',
        ticketId: 'ticket-1',
        ticketSubmittedBy: 'requester-1',
        ticketSubject: 'Stock transfer',
        decision: 'approved',
        stepName: 'Manager approval',
        finalDecision: false,
        nextStepName: 'Director approval',
        nextApproverRole: 'role-director',
        nextApproverUserId: null,
        approvalStatus: 'pending',
        decidedAt: '2026-09-22T06:00:00.000Z',
      },
      error: null,
    });

    const result = await reviewInternalRequestApproval(
      'ticket-1',
      'approved',
      ' Looks good ',
      { userId: 'approver-1', companyId: 'c1' },
    );

    expect(result.error).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith(
      'review_internal_request_approval',
      {
        p_company_id: 'c1',
        p_ticket_id: 'ticket-1',
        p_expected_step_id: 'step-1',
        p_decision: 'approved',
        p_note: 'Looks good',
      },
    );
    expect(notifyMock).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 'requester-1',
        title: 'Request approval advanced',
        message: '"Stock transfer" advanced to Director approval.',
      }),
    ]);
    expect(auditMock).toHaveBeenCalledWith(
      'approver-1',
      'update',
      'internal_request_approval',
      'instance-1',
      expect.objectContaining({
        ticketId: 'ticket-1',
        decision: 'approved',
        approvalStep: 'Manager approval',
        finalDecision: false,
        nextApprovalStep: 'Director approval',
      }),
    );
  });

  it('does not notify or audit when the RPC rejects a stale review', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Approval step changed before this review was committed. Reload the request and try again.',
      },
    });

    const result = await reviewInternalRequestApproval(
      'ticket-1',
      'approved',
      undefined,
      { userId: 'approver-1', companyId: 'c1' },
    );

    expect(result.error).toMatch(/Approval step changed/i);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('does not call the RPC when no pending step can be observed', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'approval_instances') return approvalGate('');
      throw new Error(`Unexpected table access: ${table}`);
    });

    const result = await reviewInternalRequestApproval(
      'ticket-1',
      'rejected',
      'No',
      { userId: 'approver-1', companyId: 'c1' },
    );

    expect(result.error).toMatch(/pending approval step/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
