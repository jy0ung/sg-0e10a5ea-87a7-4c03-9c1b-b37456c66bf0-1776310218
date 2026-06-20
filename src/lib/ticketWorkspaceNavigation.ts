import type { NavigateFunction } from 'react-router-dom';

export type TicketWorkspaceTab =
  | 'overview'
  | 'details'
  | 'chat'
  | 'attachments'
  | 'resolution'
  | 'internal-notes'
  | 'activity'
  | 'audit-trail';

export interface TicketWorkspaceReturnState {
  source: 'pending' | 'completed' | 'queue' | 'history';
  path: string;
  scrollTop?: number;
  filters?: Record<string, unknown>;
  page?: number;
  activeSavedView?: string;
  updatedAt: number;
}

const RETURN_STATE_PREFIX = 'internal-request-ticket-workspace:return:';

export function buildTicketWorkspacePath(ticketId: string, tab?: TicketWorkspaceTab) {
  const encodedTicketId = encodeURIComponent(ticketId);
  return `/portal/tickets/${encodedTicketId}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`;
}

export function saveTicketWorkspaceReturnState(ticketId: string, state: Omit<TicketWorkspaceReturnState, 'updatedAt'>) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(
    `${RETURN_STATE_PREFIX}${ticketId}`,
    JSON.stringify({ ...state, updatedAt: Date.now() } satisfies TicketWorkspaceReturnState),
  );
}

export function readTicketWorkspaceReturnState(ticketId: string): TicketWorkspaceReturnState | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(`${RETURN_STATE_PREFIX}${ticketId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TicketWorkspaceReturnState;
    if (!parsed || typeof parsed.path !== 'string' || typeof parsed.source !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearTicketWorkspaceReturnState(ticketId: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(`${RETURN_STATE_PREFIX}${ticketId}`);
}

export function openTicketWorkspace(
  navigate: NavigateFunction,
  ticketId: string,
  state: Omit<TicketWorkspaceReturnState, 'updatedAt'>,
  tab?: TicketWorkspaceTab,
) {
  saveTicketWorkspaceReturnState(ticketId, state);
  navigate(buildTicketWorkspacePath(ticketId, tab));
}

export function getFallbackTicketListPath(canManageQueue: boolean, closed = false) {
  if (canManageQueue) return closed ? '/portal/history' : '/portal/queue';
  return closed ? '/portal/tickets/completed' : '/portal/tickets';
}
