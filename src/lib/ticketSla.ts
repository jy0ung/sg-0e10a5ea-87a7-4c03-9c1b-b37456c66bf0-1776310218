import { differenceInMilliseconds, formatDistanceToNow } from 'date-fns';
import { type TicketStatus } from '@/services/ticketService';

// NOTE: SLA clock pausing / hold tracking is NOT currently implemented.
// The schema has no `sla_paused_at` column and the `on_hold` status is not part
// of the TicketStatus union.  All SLA deadlines are fixed at ticket-creation
// time and count down continuously.
//
// TODO (future): Add `sla_paused_at` / `sla_pause_duration_ms` columns,
// set them when a ticket is moved to an "on_hold" status, and factor the
// accumulated pause duration into `getTicketSlaSummary` so that time spent
// waiting for a 3rd-party or on-hold is excluded from SLA calculations.

export type TicketSlaState = 'not_configured' | 'met' | 'pending' | 'at_risk' | 'breached';
export type TicketSlaTarget = 'response' | 'resolution';

export interface TicketSlaInput {
  status: TicketStatus;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  first_responded_at: string | null;
  resolved_at: string | null;
}

export interface TicketSlaCheck {
  target: TicketSlaTarget;
  state: TicketSlaState;
  dueAt: string | null;
  completedAt: string | null;
}

export interface TicketSlaSummary {
  overall: TicketSlaState;
  response: TicketSlaCheck;
  resolution: TicketSlaCheck;
}

const AT_RISK_WINDOW_MS = 4 * 60 * 60 * 1000;

function isTerminalStatus(status: TicketStatus) {
  return status === 'resolved' || status === 'closed' || status === 'cancelled';
}

function evaluateSlaTarget(
  target: TicketSlaTarget,
  dueAt: string | null,
  completedAt: string | null,
  status: TicketStatus,
): TicketSlaCheck {
  if (!dueAt) {
    return { target, state: 'not_configured', dueAt, completedAt };
  }

  const deadline = new Date(dueAt);
  if (Number.isNaN(deadline.getTime())) {
    return { target, state: 'not_configured', dueAt: null, completedAt };
  }

  if (completedAt) {
    const completed = new Date(completedAt);
    return {
      target,
      state: completed.getTime() <= deadline.getTime() ? 'met' : 'breached',
      dueAt,
      completedAt,
    };
  }

  if (target === 'resolution' && isTerminalStatus(status)) {
    return { target, state: 'met', dueAt, completedAt };
  }

  const remainingMs = differenceInMilliseconds(deadline, new Date());
  if (remainingMs < 0) return { target, state: 'breached', dueAt, completedAt };
  if (remainingMs <= AT_RISK_WINDOW_MS) return { target, state: 'at_risk', dueAt, completedAt };
  return { target, state: 'pending', dueAt, completedAt };
}

export function getTicketSlaSummary(ticket: TicketSlaInput): TicketSlaSummary {
  const response = evaluateSlaTarget(
    'response',
    ticket.first_response_due_at,
    ticket.first_responded_at,
    ticket.status,
  );
  const resolution = evaluateSlaTarget(
    'resolution',
    ticket.resolution_due_at,
    ticket.resolved_at,
    ticket.status,
  );

  const states = [response.state, resolution.state];
  const overall: TicketSlaState = states.includes('breached')
    ? 'breached'
    : states.includes('at_risk')
      ? 'at_risk'
      : states.includes('pending')
        ? 'pending'
        : states.includes('met')
          ? 'met'
          : 'not_configured';

  return { overall, response, resolution };
}

export function formatSlaState(state: TicketSlaState) {
  switch (state) {
    case 'breached':
      return 'SLA breached';
    case 'at_risk':
      return 'Due soon';
    case 'pending':
      return 'On track';
    case 'met':
      return 'SLA met';
    case 'not_configured':
      return 'No SLA';
  }
}

export function formatSlaCheck(check: TicketSlaCheck) {
  if (check.state === 'not_configured' || !check.dueAt) return 'Not configured';
  if (check.completedAt) {
    return check.state === 'met'
      ? `Met ${formatDistanceToNow(new Date(check.completedAt), { addSuffix: true })}`
      : `Breached ${formatDistanceToNow(new Date(check.dueAt), { addSuffix: true })}`;
  }
  if (check.state === 'breached') {
    return `Breached ${formatDistanceToNow(new Date(check.dueAt), { addSuffix: true })}`;
  }
  return `Due ${formatDistanceToNow(new Date(check.dueAt), { addSuffix: true })}`;
}

export function formatSlaCompactLabel(summary: TicketSlaSummary) {
  if (summary.overall !== 'breached') {
    return formatSlaState(summary.overall);
  }

  const breachedChecks = [summary.response, summary.resolution]
    .filter((check) => check.state === 'breached' && !!check.dueAt)
    .sort((a, b) => new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime());

  const primaryBreach = breachedChecks[0];
  if (!primaryBreach?.dueAt) {
    return 'SLA overdue';
  }

  const elapsedMs = differenceInMilliseconds(new Date(), new Date(primaryBreach.dueAt));
  const elapsedHours = Math.max(1, Math.floor(elapsedMs / (60 * 60 * 1000)));

  if (elapsedHours >= 24) {
    const elapsedDays = Math.floor(elapsedHours / 24);
    return `SLA ${elapsedDays}d overdue`;
  }

  return `SLA ${elapsedHours}h overdue`;
}
