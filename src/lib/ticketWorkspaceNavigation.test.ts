import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTicketWorkspacePath,
  clearTicketWorkspaceReturnState,
  getFallbackTicketListPath,
  openTicketWorkspace,
  readTicketWorkspaceReturnState,
  saveTicketWorkspaceReturnState,
} from './ticketWorkspaceNavigation';

describe('ticketWorkspaceNavigation', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useRealTimers();
  });

  it('builds canonical workspace paths with optional tab selection', () => {
    expect(buildTicketWorkspacePath('ticket-1')).toBe('/portal/tickets/ticket-1');
    expect(buildTicketWorkspacePath('ticket/with space', 'chat')).toBe('/portal/tickets/ticket%2Fwith%20space?tab=chat');
  });

  it('serializes, reads, and clears return state', () => {
    vi.setSystemTime(new Date('2026-06-19T12:00:00.000Z'));

    saveTicketWorkspaceReturnState('ticket-1', {
      source: 'queue',
      path: '/portal/queue',
      page: 2,
      activeSavedView: 'my_queue',
      filters: { statusFilter: 'active', searchTerm: 'fuel' },
      scrollTop: 420,
    });

    expect(readTicketWorkspaceReturnState('ticket-1')).toEqual({
      source: 'queue',
      path: '/portal/queue',
      page: 2,
      activeSavedView: 'my_queue',
      filters: { statusFilter: 'active', searchTerm: 'fuel' },
      scrollTop: 420,
      updatedAt: Date.parse('2026-06-19T12:00:00.000Z'),
    });

    clearTicketWorkspaceReturnState('ticket-1');
    expect(readTicketWorkspaceReturnState('ticket-1')).toBeNull();
  });

  it('ignores malformed return state payloads', () => {
    window.sessionStorage.setItem('internal-request-ticket-workspace:return:ticket-1', '{bad json');
    expect(readTicketWorkspaceReturnState('ticket-1')).toBeNull();

    window.sessionStorage.setItem('internal-request-ticket-workspace:return:ticket-1', JSON.stringify({ path: 42 }));
    expect(readTicketWorkspaceReturnState('ticket-1')).toBeNull();
  });

  it('stores return state before navigating to a target tab', () => {
    vi.setSystemTime(new Date('2026-06-19T12:30:00.000Z'));
    const navigate = vi.fn();

    openTicketWorkspace(
      navigate,
      'ticket-2',
      {
        source: 'pending',
        path: '/portal/tickets',
        filters: { statusFilter: 'attention' },
      },
      'attachments',
    );

    expect(navigate).toHaveBeenCalledWith('/portal/tickets/ticket-2?tab=attachments');
    expect(readTicketWorkspaceReturnState('ticket-2')).toMatchObject({
      source: 'pending',
      path: '/portal/tickets',
      filters: { statusFilter: 'attention' },
      updatedAt: Date.parse('2026-06-19T12:30:00.000Z'),
    });
  });

  it('chooses role-appropriate fallback list paths', () => {
    expect(getFallbackTicketListPath(false, false)).toBe('/portal/tickets');
    expect(getFallbackTicketListPath(false, true)).toBe('/portal/tickets/completed');
    expect(getFallbackTicketListPath(true, false)).toBe('/portal/queue');
    expect(getFallbackTicketListPath(true, true)).toBe('/portal/history');
  });
});
