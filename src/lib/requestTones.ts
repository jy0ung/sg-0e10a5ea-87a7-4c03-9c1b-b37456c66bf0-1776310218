/**
 * Single source of truth for Internal Request status / priority / SLA
 * presentation: maps each enum to a shared {@link Tone} and a human-readable
 * label.
 *
 * Replaces the ad-hoc `statusColorMap` / `priorityColorMap` Tailwind-string
 * maps in requestFormatters and the scattered `.charAt(0).toUpperCase()` /
 * `.replace(/_/g, ' ')` label hacks across the tickets module. Render through
 * <RequestBadge> / <RequestStatusBadge> / <RequestPriorityBadge> rather than
 * hand-writing colour pairs at each call site.
 */
import type { Tone } from '@/lib/statusTones';
import type { TicketPriority, TicketStatus } from '@/services/ticketService';
import type { TicketSlaState } from '@/lib/ticketSla';

// ── Status ──────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<TicketStatus, Tone> = {
  open: 'blue',
  in_progress: 'violet',
  awaiting_requester: 'amber',
  resolved: 'emerald',
  closed: 'slate',
  cancelled: 'slate',
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  awaiting_requester: 'Awaiting reply',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const requestStatusTone = (status: TicketStatus): Tone => STATUS_TONE[status] ?? 'muted';
export const requestStatusLabel = (status: TicketStatus): string => STATUS_LABEL[status] ?? status;

// ── Priority ──────────────────────────────────────────────────────────────────

const PRIORITY_TONE: Record<TicketPriority, Tone> = {
  low: 'slate',
  medium: 'amber',
  high: 'red',
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const requestPriorityTone = (priority: TicketPriority): Tone => PRIORITY_TONE[priority] ?? 'muted';
export const requestPriorityLabel = (priority: TicketPriority): string => PRIORITY_LABEL[priority] ?? priority;

// ── SLA ─────────────────────────────────────────────────────────────────────

const SLA_TONE: Record<TicketSlaState, Tone> = {
  breached: 'red',
  at_risk: 'amber',
  pending: 'blue',
  met: 'emerald',
  not_configured: 'slate',
};

export const slaTone = (state: TicketSlaState): Tone => SLA_TONE[state] ?? 'muted';

// ── Approval ──────────────────────────────────────────────────────────────────

/** Tone for an approval workflow status (`approval_status` is loosely typed as string | null). */
export const approvalTone = (status: string | null | undefined): Tone => {
  switch (status) {
    case 'approved':
      return 'emerald';
    case 'pending':
      return 'amber';
    case 'rejected':
      return 'red';
    case 'cancelled':
      return 'slate';
    default:
      return 'muted';
  }
};
