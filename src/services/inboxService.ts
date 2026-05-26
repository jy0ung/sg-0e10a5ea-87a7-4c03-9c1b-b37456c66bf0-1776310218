import { getNotifications, type NotificationRow } from './notificationService';
import { listMyTickets, type RequestTicketRecord } from './ticketService';
import { getReconciliationQueue, getReconciliationStatusCounts } from './reconciliationService';
import { listLeaveRequests, listPayrollRuns, listAppraisals } from './hrmsService';
import { buildApprovalInboxItems, type ApprovalInboxApproverIdentity, type ApprovalInboxItem } from '@/lib/hrms/approvalInbox';
import type { ReconciliationMatch } from '@/types';

export type InboxSource = 'approval' | 'reconciliation' | 'ticket' | 'notification';
export type InboxTone   = 'amber' | 'red' | 'blue' | 'emerald' | 'muted';

export interface InboxItem {
  /** Stable unique id composed of source + entity id. */
  id: string;
  source: InboxSource;
  title: string;
  subtitle?: string;
  description?: string;
  /** ISO timestamp for sorting. */
  updatedAt: string;
  /** Deep link path within the app. */
  href: string;
  /** Optional badge text (status, priority, etc.). */
  badge?: string;
  badgeTone?: InboxTone;
  /** Only meaningful for notifications. */
  unread?: boolean;
}

export interface InboxCounts {
  approval: number;
  reconciliation: number;
  ticket: number;
  notification: number;
  total: number;
}

export interface InboxLoadOptions {
  /** Identity used to filter approvals to "mine". */
  approver: ApprovalInboxApproverIdentity;
  userId: string;
  /** Set true for admin/director — enables reconciliation pull. */
  includeReconciliation: boolean;
  /** Cap per-source results. Defaults to 50. */
  perSourceLimit?: number;
}

export interface InboxBundle {
  items: InboxItem[];
  counts: InboxCounts;
  errors: string[];
}

// ── mapping helpers ─────────────────────────────────────────────────────────

export function approvalToInbox(item: ApprovalInboxItem): InboxItem {
  const entityPath =
    item.entityType === 'leave_request' ? 'leave'
    : item.entityType === 'payroll_run' ? 'payroll'
    : 'appraisals';
  return {
    id:        `approval:${item.entityType}:${item.entityId}`,
    source:    'approval',
    title:     item.title,
    subtitle:  item.subtitle,
    description: item.summary,
    updatedAt: item.updatedAt,
    href:      `/hrms/${entityPath}`,
    badge:     item.currentApprovalStepName ?? 'Pending',
    badgeTone: 'amber',
  };
}

export function reconciliationToInbox(row: ReconciliationMatch): InboxItem {
  const tone: InboxTone =
    row.matchStatus === 'conflict'    ? 'red'
    : row.matchStatus === 'candidate' ? 'amber'
    : 'blue';
  return {
    id:        `reconciliation:${row.id}`,
    source:    'reconciliation',
    title:     `${row.objectType.replace(/_/g, ' ')} · ${row.sourceSystem.toUpperCase()}`,
    subtitle:  row.sourceTable,
    description: row.matchRule ?? undefined,
    updatedAt: row.updatedAt,
    href:      `/admin/reconciliation/${row.id}`,
    badge:     row.matchStatus,
    badgeTone: tone,
  };
}

export function ticketToInbox(row: RequestTicketRecord): InboxItem {
  const tone: InboxTone =
    row.priority === 'critical' || row.priority === 'high' ? 'red'
    : row.status === 'awaiting_requester' ? 'amber'
    : 'blue';
  return {
    id:        `ticket:${row.id}`,
    source:    'ticket',
    title:     row.subject,
    subtitle:  `${row.category}${row.subcategory ? ' · ' + row.subcategory : ''}`,
    description: row.status,
    updatedAt: row.updated_at,
    href:      `/portal/tickets/new?ticket=${row.id}`,
    badge:     row.priority,
    badgeTone: tone,
  };
}

export function notificationToInbox(row: NotificationRow): InboxItem {
  const tone: InboxTone =
    row.type === 'error'   ? 'red'
    : row.type === 'warning' ? 'amber'
    : row.type === 'success' ? 'emerald'
    : 'muted';
  return {
    id:        `notification:${row.id}`,
    source:    'notification',
    title:     row.title,
    description: row.message,
    updatedAt: row.created_at ?? new Date(0).toISOString(),
    href:      '/notifications',
    badge:     row.type,
    badgeTone: tone,
    unread:    !row.read,
  };
}

// ── aggregator ──────────────────────────────────────────────────────────────

/**
 * Fan-out fetch of all four inbox streams; per-source errors are collected
 * rather than propagated so the page can render whatever did load.
 *
 * Open tickets are kept; resolved/closed/cancelled are dropped.
 * Reconciliation rows are filtered to action-needed statuses (candidate, conflict).
 */
export async function loadInbox(
  companyId: string,
  opts: InboxLoadOptions,
): Promise<InboxBundle> {
  const limit = opts.perSourceLimit ?? 50;
  const errors: string[] = [];

  const [leaveR, payrollR, appraisalR, ticketsR, notifsR, reconR, reconCountsR] = await Promise.all([
    listLeaveRequests(companyId, { includeApprovalHistory: true }).catch(e => ({ data: [], error: String(e) })),
    listPayrollRuns(companyId, { includeApprovalHistory: true }).catch(e => ({ data: [], error: String(e) })),
    listAppraisals(companyId, { includeApprovalHistory: true }).catch(e => ({ data: [], error: String(e) })),
    listMyTickets(opts.userId, companyId).catch(e => ({ data: null, error: e as Error })),
    getNotifications(opts.userId).catch(e => ({ data: [], error: e as Error })),
    opts.includeReconciliation
      ? getReconciliationQueue(companyId, { limit }).catch(e => ({ data: [] as ReconciliationMatch[], error: e as Error }))
      : Promise.resolve({ data: [] as ReconciliationMatch[], error: null }),
    opts.includeReconciliation
      ? getReconciliationStatusCounts(companyId).catch(e => ({ data: [], error: e as Error }))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (leaveR.error)    errors.push(`Approvals (leave): ${leaveR.error}`);
  if (payrollR.error)  errors.push(`Approvals (payroll): ${payrollR.error}`);
  if (appraisalR.error) errors.push(`Approvals (appraisal): ${appraisalR.error}`);
  if (ticketsR.error)  errors.push(`Tickets: ${(ticketsR.error as Error).message ?? ticketsR.error}`);
  if (notifsR.error)   errors.push(`Notifications: ${(notifsR.error as Error).message ?? notifsR.error}`);
  if (reconR.error)    errors.push(`Reconciliation: ${(reconR.error as Error).message ?? reconR.error}`);

  const approvalItems = buildApprovalInboxItems(
    leaveR.data ?? [],
    payrollR.data ?? [],
    appraisalR.data ?? [],
    opts.approver,
  ).slice(0, limit).map(approvalToInbox);

  const reconItems = (reconR.data ?? [])
    .filter(r => r.matchStatus === 'candidate' || r.matchStatus === 'conflict')
    .slice(0, limit)
    .map(reconciliationToInbox);

  const openTicketStatuses = new Set(['open', 'in_progress', 'awaiting_requester']);
  const ticketItems = ((ticketsR.data ?? []) as RequestTicketRecord[])
    .filter(t => openTicketStatuses.has(t.status))
    .slice(0, limit)
    .map(ticketToInbox);

  const notifItems = ((notifsR.data ?? []) as NotificationRow[])
    .slice(0, limit)
    .map(notificationToInbox);

  // Sort all items by updatedAt desc.
  const items = [...approvalItems, ...reconItems, ...ticketItems, ...notifItems]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  // Reconciliation count: pull from RPC counts (action-needed only).
  const reconActionCount = (reconCountsR.data ?? [])
    .filter(r => r.matchStatus === 'candidate' || r.matchStatus === 'conflict')
    .reduce((sum, r) => sum + r.total, 0);

  const counts: InboxCounts = {
    approval:       approvalItems.length,
    reconciliation: opts.includeReconciliation ? reconActionCount : 0,
    ticket:         ticketItems.length,
    notification:   notifItems.filter(n => n.unread).length,
    total:          0,
  };
  counts.total = counts.approval + counts.reconciliation + counts.ticket + counts.notification;

  return { items, counts, errors };
}
