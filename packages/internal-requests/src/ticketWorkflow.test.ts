import { describe, expect, it } from 'vitest';
import {
  canTransition,
  createTicketWorkflowUseCases,
  getAvailableTicketActions,
  getNextTicketLifecycleState,
  getTicketWorkflowSideEffects,
  normalizePersistedTicketStatus,
  normalizeTicketCompletionCategory,
  type TicketActor,
  type TicketWorkflowSubject,
} from './ticketWorkflow';

const requester: TicketActor = {
  userId: 'requester-1',
  companyId: 'company-1',
  role: 'portal_user',
  isRequester: true,
};

const owner: TicketActor = {
  userId: 'owner-1',
  companyId: 'company-1',
  role: 'portal_manager',
};

const manager: TicketActor = {
  userId: 'manager-1',
  companyId: 'company-1',
  role: 'company_admin',
  canManageQueue: true,
};

const approver: TicketActor = {
  userId: 'approver-1',
  companyId: 'company-1',
  role: 'company_admin',
  isAssignedApprover: true,
};

const admin: TicketActor = {
  userId: 'admin-1',
  companyId: 'company-1',
  role: 'company_admin',
  canManageQueue: true,
  canAdminOverride: true,
};

function subject(overrides: Partial<TicketWorkflowSubject>): TicketWorkflowSubject {
  return {
    lifecycleState: 'open',
    approvalStatus: 'none',
    submittedBy: 'requester-1',
    assignedTo: 'owner-1',
    hasWorkStarted: false,
    withinReopenWindow: true,
    ...overrides,
  };
}

describe('ticketWorkflow', () => {
  it('normalizes legacy persisted statuses and completion categories', () => {
    expect(normalizePersistedTicketStatus('awaiting_requester')).toBe('pending_requester');
    expect(normalizePersistedTicketStatus('resolved')).toBe('completed_by_owner');
    expect(normalizePersistedTicketStatus('bogus')).toBe('open');

    expect(normalizeTicketCompletionCategory('not_applicable')).toBe('no_action_needed');
    expect(normalizeTicketCompletionCategory('duplicate')).toBe('other');
    expect(normalizeTicketCompletionCategory('partially_resolved')).toBe('partially_resolved');
  });

  it('blocks work and completion while approval is pending', () => {
    const pendingApproval = subject({ lifecycleState: 'open', approvalStatus: 'pending' });

    expect(canTransition({
      action: 'start_work',
      actor: owner,
      subject: pendingApproval,
      payload: { kind: 'start_work' },
    })).toEqual({ ok: false, reason: 'This request is waiting for approval.' });

    expect(canTransition({
      action: 'complete_by_owner',
      actor: owner,
      subject: subject({ lifecycleState: 'in_progress', approvalStatus: 'pending' }),
      payload: {
        kind: 'complete_by_owner',
        resolutionNote: 'Done',
        completionCategory: 'resolved',
        checklistConfirmed: true,
      },
    })).toEqual({ ok: false, reason: 'This request is waiting for approval.' });
  });

  it('requires strongly typed completion payloads and SLA breach reasons', () => {
    expect(canTransition({
      action: 'complete_by_owner',
      actor: owner,
      subject: subject({ lifecycleState: 'in_progress', isSlaBreached: true }),
      payload: {
        kind: 'complete_by_owner',
        resolutionNote: 'Completed',
        completionCategory: 'resolved',
        checklistConfirmed: true,
      },
    })).toEqual({ ok: false, reason: 'SLA breach reason is required.' });

    expect(canTransition({
      action: 'complete_by_owner',
      actor: owner,
      subject: subject({ lifecycleState: 'in_progress', isSlaBreached: true }),
      payload: {
        kind: 'complete_by_owner',
        resolutionNote: 'Completed',
        completionCategory: 'partially_resolved',
        checklistConfirmed: true,
        slaBreachReason: 'Waiting on upstream data.',
      },
    })).toEqual({ ok: true });
  });

  it('models SLA pause and resume as transition side effects', () => {
    expect(getTicketWorkflowSideEffects('request_more_info')).toContain('sla_pause');
    expect(getTicketWorkflowSideEffects('request_more_info', {
      kind: 'request_more_info',
      message: 'Need the VSO.',
      pauseSla: false,
    })).not.toContain('sla_pause');
    expect(getTicketWorkflowSideEffects('requester_reply')).toContain('sla_resume');
  });

  it('keeps escalation same-status and requires manager or owner permission', () => {
    const inProgress = subject({ lifecycleState: 'in_progress' });

    expect(getNextTicketLifecycleState('escalate', 'in_progress')).toBe('in_progress');
    expect(canTransition({
      action: 'escalate',
      actor: requester,
      subject: inProgress,
      payload: { kind: 'escalate', reason: 'Needs manager attention.' },
    })).toEqual({ ok: false, reason: 'Owner or queue manager permission is required.' });
    expect(canTransition({
      action: 'escalate',
      actor: manager,
      subject: inProgress,
      payload: { kind: 'escalate', reason: 'Needs manager attention.' },
    })).toEqual({ ok: true });
  });

  it('keeps admin override as an audited escape hatch', () => {
    expect(canTransition({
      action: 'admin_override_status',
      actor: manager,
      subject: subject({ lifecycleState: 'cancelled' }),
      payload: { kind: 'admin_override_status', targetStatus: 'reopened', reason: 'Correction' },
    })).toEqual({ ok: false, reason: 'Admin override permission is required.' });

    expect(canTransition({
      action: 'admin_override_status',
      actor: admin,
      subject: subject({ lifecycleState: 'cancelled' }),
      payload: { kind: 'admin_override_status', targetStatus: 'reopened', reason: 'Correction' },
    })).toEqual({ ok: true });
    expect(getTicketWorkflowSideEffects('admin_override_status')).toContain('audit');
  });

  it('returns available actions for requester, owner, approver, system, and admin actors', () => {
    expect(getAvailableTicketActions(subject({ lifecycleState: 'pending_requester' }), requester)).toEqual([
      'requester_reply',
    ]);
    expect(getAvailableTicketActions(subject({ lifecycleState: 'completed_by_owner' }), requester)).toEqual([
      'reject_completion',
      'close_by_requester',
    ]);
    expect(getAvailableTicketActions(subject({ lifecycleState: 'open' }), owner)).toContain('start_work');
    expect(getAvailableTicketActions(subject({ lifecycleState: 'open', approvalStatus: 'pending' }), owner)).not.toContain('start_work');
    expect(getAvailableTicketActions(subject({ lifecycleState: 'open', approvalStatus: 'pending' }), approver)).toEqual([
      'approve_step',
      'reject_step',
    ]);
    expect(getAvailableTicketActions(subject({ lifecycleState: 'completed_by_owner' }), {
      userId: null,
      companyId: 'company-1',
      role: null,
      isSystem: true,
    })).toEqual(['auto_close']);
    expect(getAvailableTicketActions(subject({ lifecycleState: 'cancelled' }), admin)).toEqual([
      'admin_override_status',
    ]);
  });

  it('orchestrates validation, next state, and side-effect descriptors through one adapter', async () => {
    const calls: unknown[] = [];
    const workflow = createTicketWorkflowUseCases({
      async load(command) {
        calls.push(['load', command.action]);
        return {
          ticket: { id: command.ticketId },
          subject: subject({ lifecycleState: 'in_progress' }),
        };
      },
      async execute(context) {
        calls.push(['execute', context.nextStatus, context.sideEffects]);
        return {
          ticket: { id: context.command.ticketId, status: context.nextStatus },
          activities: ['owner_completed_request'],
          notificationsQueued: true,
        };
      },
    });

    const result = await workflow.transition({
      ticketId: 'ticket-1',
      action: 'complete_by_owner',
      actor: owner,
      payload: {
        kind: 'complete_by_owner',
        resolutionNote: 'Completed',
        completionCategory: 'resolved',
        checklistConfirmed: true,
      },
    });

    expect(result).toEqual({
      ticket: { id: 'ticket-1', status: 'completed_by_owner' },
      draftId: undefined,
      previousStatus: 'in_progress',
      nextStatus: 'completed_by_owner',
      activities: ['owner_completed_request'],
      notificationsQueued: true,
    });
    expect(calls).toEqual([
      ['load', 'complete_by_owner'],
      ['execute', 'completed_by_owner', ['activity', 'notification', 'auto_close']],
    ]);
  });

  it('uses the requested target for audited admin overrides', async () => {
    const workflow = createTicketWorkflowUseCases({
      async load() {
        return { ticket: { id: 'ticket-1' }, subject: subject({ lifecycleState: 'cancelled' }) };
      },
      async execute(context) {
        return { ticket: { id: 'ticket-1', status: context.nextStatus } };
      },
    });

    await expect(workflow.transition({
      ticketId: 'ticket-1',
      action: 'admin_override_status',
      actor: admin,
      payload: { kind: 'admin_override_status', targetStatus: 'reopened', reason: 'Correction' },
    })).resolves.toMatchObject({ previousStatus: 'cancelled', nextStatus: 'reopened' });
  });

  it('does not execute adapters when command validation fails', async () => {
    let executed = false;
    const workflow = createTicketWorkflowUseCases({
      async load() {
        return { ticket: { id: 'ticket-1' }, subject: subject({ lifecycleState: 'open', approvalStatus: 'pending' }) };
      },
      async execute() {
        executed = true;
        return { ticket: null };
      },
    });

    await expect(workflow.transition({
      ticketId: 'ticket-1',
      action: 'start_work',
      actor: owner,
      payload: { kind: 'start_work' },
    })).rejects.toThrow('waiting for approval');
    expect(executed).toBe(false);
  });

  it('allows a draft adapter to model discard as no next lifecycle state', async () => {
    const workflow = createTicketWorkflowUseCases({
      async load() {
        return { ticket: null, subject: subject({ lifecycleState: 'draft' }) };
      },
      async execute(context) {
        expect(context.nextStatus).toBeNull();
        return { ticket: null, draftId: null };
      },
    });

    await expect(workflow.transition({
      draftId: 'draft-1',
      action: 'discard_draft',
      actor: requester,
      payload: { kind: 'discard_draft' },
    })).resolves.toMatchObject({ previousStatus: 'draft', nextStatus: null, ticket: null });
  });
});
