export type PersistedTicketStatus =
  | 'open'
  | 'in_progress'
  | 'pending_requester'
  | 'pending_owner_review'
  | 'completed_by_owner'
  | 'closed'
  | 'reopened'
  | 'cancelled';

export type TicketLifecycleState = 'draft' | PersistedTicketStatus;

export type TicketApprovalStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type TicketCompletionCategory =
  | 'resolved'
  | 'partially_resolved'
  | 'escalated'
  | 'transferred'
  | 'no_action_needed'
  | 'other';

export type LegacyTicketCompletionCategory =
  | 'rejected'
  | 'duplicate'
  | 'cancelled'
  | 'not_applicable';

export type TicketTransitionAction =
  | 'save_draft'
  | 'discard_draft'
  | 'submit_request'
  | 'start_work'
  | 'request_more_info'
  | 'requester_reply'
  | 'complete_by_owner'
  | 'reject_completion'
  | 'close_by_requester'
  | 'auto_close'
  | 'reopen_by_requester'
  | 'cancel_by_requester'
  | 'approve_step'
  | 'reject_step'
  | 'reassign_owner'
  | 'escalate'
  | 'admin_override_status';

export type TicketWorkflowSideEffect =
  | 'activity'
  | 'notification'
  | 'sla_pause'
  | 'sla_resume'
  | 'approval_update'
  | 'owner_update'
  | 'auto_close'
  | 'audit';

export interface TicketActor {
  userId: string | null;
  companyId: string;
  role: string | null;
  isRequester?: boolean;
  canManageQueue?: boolean;
  canAdminOverride?: boolean;
  isSystem?: boolean;
  isAssignedApprover?: boolean;
}

export interface TicketWorkflowSubject {
  lifecycleState: TicketLifecycleState;
  approvalStatus?: TicketApprovalStatus | null;
  submittedBy?: string | null;
  assignedTo?: string | null;
  hasWorkStarted?: boolean;
  isSlaBreached?: boolean;
  withinReopenWindow?: boolean;
}

export type TicketTransitionPayload =
  | { kind: 'save_draft'; values: unknown }
  | { kind: 'discard_draft' }
  | { kind: 'submit_request'; input: unknown }
  | { kind: 'start_work'; note?: string }
  | { kind: 'request_more_info'; message: string; pauseSla?: boolean }
  | { kind: 'requester_reply'; message: string }
  | { kind: 'complete_by_owner'; resolutionNote: string; completionCategory: TicketCompletionCategory; checklistConfirmed: boolean; slaBreachReason?: string | null }
  | { kind: 'reject_completion'; reason: string }
  | { kind: 'close_by_requester'; confirmedResolved: true; satisfactionRating: number; feedbackComment?: string | null }
  | { kind: 'auto_close'; autoCloseDays: number }
  | { kind: 'reopen_by_requester'; reason: string }
  | { kind: 'cancel_by_requester'; reason?: string | null }
  | { kind: 'approve_step'; note?: string | null }
  | { kind: 'reject_step'; note?: string | null }
  | { kind: 'reassign_owner'; newOwnerId: string | null; transitionNote: string }
  | { kind: 'escalate'; reason: string; escalationOwnerId?: string | null }
  | { kind: 'admin_override_status'; targetStatus: PersistedTicketStatus; reason: string };

export interface TicketTransitionCommand {
  ticketId?: string;
  draftId?: string;
  action: TicketTransitionAction;
  actor: TicketActor;
  subject?: TicketWorkflowSubject;
  payload: TicketTransitionPayload;
}

export interface TicketWorkflowTransition {
  action: TicketTransitionAction;
  from: TicketLifecycleState[] | 'any' | 'none';
  to: TicketLifecycleState | 'same' | 'none' | 'any';
  sideEffects: TicketWorkflowSideEffect[];
  adminOnly?: boolean;
}

export type TicketTransitionCheck = { ok: true } | { ok: false; reason: string };

export const PERSISTED_TICKET_STATUSES: PersistedTicketStatus[] = [
  'open',
  'in_progress',
  'pending_requester',
  'pending_owner_review',
  'completed_by_owner',
  'closed',
  'reopened',
  'cancelled',
];

const PERSISTED_TICKET_STATUS_SET = new Set(PERSISTED_TICKET_STATUSES);
const NONTERMINAL_STATUSES = PERSISTED_TICKET_STATUSES.filter((status) => status !== 'closed' && status !== 'cancelled');

export const TICKET_COMPLETION_CATEGORIES: TicketCompletionCategory[] = [
  'resolved',
  'partially_resolved',
  'escalated',
  'transferred',
  'no_action_needed',
  'other',
];

export const LEGACY_TICKET_COMPLETION_CATEGORY_MAP: Record<LegacyTicketCompletionCategory, TicketCompletionCategory> = {
  rejected: 'other',
  duplicate: 'other',
  cancelled: 'other',
  not_applicable: 'no_action_needed',
};

export const TICKET_WORKFLOW_TRANSITIONS: Record<TicketTransitionAction, TicketWorkflowTransition> = {
  save_draft: {
    action: 'save_draft',
    from: ['draft'],
    to: 'draft',
    sideEffects: [],
  },
  discard_draft: {
    action: 'discard_draft',
    from: ['draft'],
    to: 'none',
    sideEffects: [],
  },
  submit_request: {
    action: 'submit_request',
    from: ['draft'],
    to: 'open',
    sideEffects: ['activity', 'notification', 'approval_update', 'owner_update'],
  },
  start_work: {
    action: 'start_work',
    from: ['open', 'reopened'],
    to: 'in_progress',
    sideEffects: ['activity', 'notification', 'owner_update'],
  },
  request_more_info: {
    action: 'request_more_info',
    from: ['open', 'in_progress', 'pending_owner_review', 'reopened'],
    to: 'pending_requester',
    sideEffects: ['activity', 'notification', 'sla_pause'],
  },
  requester_reply: {
    action: 'requester_reply',
    from: ['pending_requester'],
    to: 'pending_owner_review',
    sideEffects: ['activity', 'notification', 'sla_resume'],
  },
  complete_by_owner: {
    action: 'complete_by_owner',
    from: ['in_progress', 'pending_owner_review', 'reopened'],
    to: 'completed_by_owner',
    sideEffects: ['activity', 'notification', 'auto_close'],
  },
  reject_completion: {
    action: 'reject_completion',
    from: ['completed_by_owner'],
    to: 'reopened',
    sideEffects: ['activity', 'notification'],
  },
  close_by_requester: {
    action: 'close_by_requester',
    from: ['completed_by_owner'],
    to: 'closed',
    sideEffects: ['activity', 'notification'],
  },
  auto_close: {
    action: 'auto_close',
    from: ['completed_by_owner'],
    to: 'closed',
    sideEffects: ['activity', 'notification', 'auto_close'],
  },
  reopen_by_requester: {
    action: 'reopen_by_requester',
    from: ['closed'],
    to: 'reopened',
    sideEffects: ['activity', 'notification'],
  },
  cancel_by_requester: {
    action: 'cancel_by_requester',
    from: ['open'],
    to: 'cancelled',
    sideEffects: ['activity', 'notification', 'approval_update'],
  },
  approve_step: {
    action: 'approve_step',
    from: NONTERMINAL_STATUSES,
    to: 'same',
    sideEffects: ['activity', 'notification', 'approval_update'],
  },
  reject_step: {
    action: 'reject_step',
    from: NONTERMINAL_STATUSES,
    to: 'cancelled',
    sideEffects: ['activity', 'notification', 'approval_update'],
  },
  reassign_owner: {
    action: 'reassign_owner',
    from: NONTERMINAL_STATUSES,
    to: 'same',
    sideEffects: ['activity', 'notification', 'owner_update'],
  },
  escalate: {
    action: 'escalate',
    from: NONTERMINAL_STATUSES,
    to: 'same',
    sideEffects: ['activity', 'notification', 'audit'],
  },
  admin_override_status: {
    action: 'admin_override_status',
    from: 'any',
    to: 'any',
    sideEffects: ['activity', 'notification', 'audit'],
    adminOnly: true,
  },
};

export function normalizePersistedTicketStatus(status: unknown): PersistedTicketStatus {
  if (status === 'awaiting_requester') return 'pending_requester';
  if (status === 'resolved') return 'completed_by_owner';
  return typeof status === 'string' && PERSISTED_TICKET_STATUS_SET.has(status as PersistedTicketStatus)
    ? status as PersistedTicketStatus
    : 'open';
}

export function normalizeTicketCompletionCategory(category: unknown): TicketCompletionCategory | null {
  if (typeof category !== 'string') return null;
  if ((TICKET_COMPLETION_CATEGORIES as string[]).includes(category)) return category as TicketCompletionCategory;
  return LEGACY_TICKET_COMPLETION_CATEGORY_MAP[category as LegacyTicketCompletionCategory] ?? null;
}

export function getTicketWorkflowTransition(action: TicketTransitionAction): TicketWorkflowTransition {
  return TICKET_WORKFLOW_TRANSITIONS[action];
}

export function getTicketWorkflowSideEffects(action: TicketTransitionAction, payload?: TicketTransitionPayload): TicketWorkflowSideEffect[] {
  const sideEffects = new Set(TICKET_WORKFLOW_TRANSITIONS[action].sideEffects);
  if (payload?.kind === 'request_more_info' && payload.pauseSla === false) {
    sideEffects.delete('sla_pause');
  }
  return Array.from(sideEffects);
}

export function getNextTicketLifecycleState(action: TicketTransitionAction, current: TicketLifecycleState): TicketLifecycleState | null {
  const transition = getTicketWorkflowTransition(action);
  if (transition.to === 'same') return current;
  if (transition.to === 'none') return null;
  if (transition.to === 'any') return current;
  return transition.to;
}

export function canTransition(command: TicketTransitionCommand): TicketTransitionCheck {
  if (command.payload.kind !== command.action) {
    return { ok: false, reason: `Payload kind ${command.payload.kind} does not match action ${command.action}.` };
  }

  const transition = getTicketWorkflowTransition(command.action);
  const subject = command.subject;

  if (!command.actor.companyId) return { ok: false, reason: 'Actor company is required.' };
  if (!command.actor.userId && !command.actor.isSystem) return { ok: false, reason: 'Actor user is required.' };
  if (transition.adminOnly && !command.actor.canAdminOverride) return { ok: false, reason: 'Admin override permission is required.' };

  if (subject) {
    const from = transition.from;
    if (from !== 'any' && from !== 'none' && !from.includes(subject.lifecycleState)) {
      return { ok: false, reason: `${command.action} is not available from ${subject.lifecycleState}.` };
    }
  }

  if (subject?.approvalStatus === 'pending' && (command.action === 'start_work' || command.action === 'complete_by_owner')) {
    return { ok: false, reason: 'This request is waiting for approval.' };
  }
  if (subject?.approvalStatus === 'rejected' && (command.action === 'start_work' || command.action === 'complete_by_owner' || command.action === 'close_by_requester')) {
    return { ok: false, reason: 'This request was rejected during approval.' };
  }

  if (command.action === 'auto_close' && !command.actor.isSystem) return { ok: false, reason: 'Auto-close must be performed by the system actor.' };
  if (isRequesterAction(command.action) && !command.actor.isRequester) return { ok: false, reason: 'Requester permission is required.' };
  if (isOwnerManagerAction(command.action) && !canManageTicket(command.actor, subject)) return { ok: false, reason: 'Owner or queue manager permission is required.' };
  if ((command.action === 'approve_step' || command.action === 'reject_step') && !command.actor.isAssignedApprover) {
    return { ok: false, reason: 'Current approval step must be assigned to the actor.' };
  }
  if (command.action === 'cancel_by_requester' && subject?.hasWorkStarted) {
    return { ok: false, reason: 'Request can only be cancelled before work starts.' };
  }
  if (command.action === 'reopen_by_requester' && subject?.withinReopenWindow === false) {
    return { ok: false, reason: 'The reopen window has expired.' };
  }

  const payloadCheck = validateTicketTransitionPayload(command.payload, subject);
  if (!payloadCheck.ok) return payloadCheck;

  return { ok: true };
}

function isRequesterAction(action: TicketTransitionAction) {
  return action === 'save_draft'
    || action === 'discard_draft'
    || action === 'submit_request'
    || action === 'requester_reply'
    || action === 'reject_completion'
    || action === 'close_by_requester'
    || action === 'reopen_by_requester'
    || action === 'cancel_by_requester';
}

function isOwnerManagerAction(action: TicketTransitionAction) {
  return action === 'start_work'
    || action === 'request_more_info'
    || action === 'complete_by_owner'
    || action === 'reassign_owner'
    || action === 'escalate';
}

function canManageTicket(actor: TicketActor, subject?: TicketWorkflowSubject) {
  return Boolean(actor.canManageQueue || actor.canAdminOverride || (actor.userId && subject?.assignedTo === actor.userId));
}

export function getAvailableTicketActions(subject: TicketWorkflowSubject, actor: TicketActor): TicketTransitionAction[] {
  return (Object.keys(TICKET_WORKFLOW_TRANSITIONS) as TicketTransitionAction[])
    .filter((action) => canTransition({
      action,
      actor,
      subject,
      payload: minimalPayloadForAction(action),
    }).ok);
}

function validateTicketTransitionPayload(
  payload: TicketTransitionPayload,
  subject?: TicketWorkflowSubject,
): TicketTransitionCheck {
  switch (payload.kind) {
    case 'save_draft':
      return { ok: true };
    case 'discard_draft':
      return { ok: true };
    case 'submit_request':
      return payload.input ? { ok: true } : { ok: false, reason: 'Request input is required.' };
    case 'start_work':
      return { ok: true };
    case 'request_more_info':
      return payload.message.trim() ? { ok: true } : { ok: false, reason: 'Message is required.' };
    case 'requester_reply':
      return payload.message.trim() ? { ok: true } : { ok: false, reason: 'Message is required.' };
    case 'complete_by_owner':
      if (!payload.resolutionNote.trim()) return { ok: false, reason: 'Resolution summary is required.' };
      if (!TICKET_COMPLETION_CATEGORIES.includes(payload.completionCategory)) return { ok: false, reason: 'Completion category is required.' };
      if (!payload.checklistConfirmed) return { ok: false, reason: 'Completion checklist must be confirmed.' };
      if (subject?.isSlaBreached && !payload.slaBreachReason?.trim()) return { ok: false, reason: 'SLA breach reason is required.' };
      return { ok: true };
    case 'reject_completion':
      return payload.reason.trim() ? { ok: true } : { ok: false, reason: 'Rejection reason is required.' };
    case 'close_by_requester':
      return Number.isFinite(payload.satisfactionRating) && payload.satisfactionRating >= 1 && payload.satisfactionRating <= 5
        ? { ok: true }
        : { ok: false, reason: 'Satisfaction rating must be between 1 and 5.' };
    case 'auto_close':
      return payload.autoCloseDays > 0 ? { ok: true } : { ok: false, reason: 'Auto-close days must be greater than zero.' };
    case 'reopen_by_requester':
      return payload.reason.trim() ? { ok: true } : { ok: false, reason: 'Reopen reason is required.' };
    case 'cancel_by_requester':
      return { ok: true };
    case 'approve_step':
      return { ok: true };
    case 'reject_step':
      return { ok: true };
    case 'reassign_owner':
      return payload.transitionNote.trim() ? { ok: true } : { ok: false, reason: 'Transition note is required.' };
    case 'escalate':
      return payload.reason.trim() ? { ok: true } : { ok: false, reason: 'Escalation reason is required.' };
    case 'admin_override_status':
      return payload.reason.trim() ? { ok: true } : { ok: false, reason: 'Admin override reason is required.' };
  }
}

function minimalPayloadForAction(action: TicketTransitionAction): TicketTransitionPayload {
  switch (action) {
    case 'save_draft':
      return { kind: action, values: {} };
    case 'discard_draft':
      return { kind: action };
    case 'submit_request':
      return { kind: action, input: {} };
    case 'start_work':
      return { kind: action };
    case 'request_more_info':
      return { kind: action, message: 'Message' };
    case 'requester_reply':
      return { kind: action, message: 'Message' };
    case 'complete_by_owner':
      return { kind: action, resolutionNote: 'Resolved', completionCategory: 'resolved', checklistConfirmed: true, slaBreachReason: 'Breach reason' };
    case 'reject_completion':
      return { kind: action, reason: 'Needs more work' };
    case 'close_by_requester':
      return { kind: action, confirmedResolved: true, satisfactionRating: 5 };
    case 'auto_close':
      return { kind: action, autoCloseDays: 3 };
    case 'reopen_by_requester':
      return { kind: action, reason: 'Still not resolved' };
    case 'cancel_by_requester':
      return { kind: action };
    case 'approve_step':
      return { kind: action };
    case 'reject_step':
      return { kind: action };
    case 'reassign_owner':
      return { kind: action, newOwnerId: null, transitionNote: 'Reassigning request' };
    case 'escalate':
      return { kind: action, reason: 'Escalation required' };
    case 'admin_override_status':
      return { kind: action, targetStatus: 'in_progress', reason: 'Admin correction' };
  }
}
