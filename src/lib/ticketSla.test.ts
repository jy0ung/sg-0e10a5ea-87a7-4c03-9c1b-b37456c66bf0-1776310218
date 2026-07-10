import { describe, expect, it } from 'vitest';

import { getTicketSlaSummary } from './ticketSla';
import type { TicketSlaInput } from './ticketSla';

function ticket(overrides: Partial<TicketSlaInput>): TicketSlaInput {
  return {
    status: 'in_progress',
    first_response_due_at: null,
    resolution_due_at: null,
    first_responded_at: null,
    resolved_at: null,
    sla_status: 'on_track',
    sla_paused_at: null,
    ...overrides,
  };
}

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

describe('ticket SLA summary', () => {
  it('treats pending requester tickets as paused even when older rows have no paused timestamp', () => {
    const summary = getTicketSlaSummary(ticket({
      status: 'pending_requester',
      first_response_due_at: hoursFromNow(-2),
      resolution_due_at: hoursFromNow(-1),
      sla_status: 'on_track',
      sla_paused_at: null,
    }));

    expect(summary.overall).toBe('paused');
    expect(summary.response.state).toBe('paused');
    expect(summary.resolution.state).toBe('paused');
  });

  it('marks unresolved tickets past a configured deadline as breached', () => {
    const summary = getTicketSlaSummary(ticket({
      resolution_due_at: hoursFromNow(-1),
    }));

    expect(summary.overall).toBe('breached');
    expect(summary.resolution.state).toBe('breached');
  });

  it('marks terminal tickets without a completion timestamp as met for resolution SLA display', () => {
    const summary = getTicketSlaSummary(ticket({
      status: 'closed',
      resolution_due_at: hoursFromNow(-1),
      resolved_at: null,
    }));

    expect(summary.overall).toBe('met');
    expect(summary.resolution.state).toBe('met');
  });
});
