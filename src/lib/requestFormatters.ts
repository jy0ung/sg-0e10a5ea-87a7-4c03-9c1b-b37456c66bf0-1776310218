/**
 * Shared formatting utilities for the Internal Request Module.
 *
 * These were previously duplicated across MyTickets, RequestQueue,
 * RequestQueueList, and RequestDetailPanel.
 */

import type { TicketPriority, TicketStatus } from '@/services/ticketService';

// ── Label formatting ──────────────────────────────────────────────────────────

/** Convert snake_case status/field keys to readable labels. */
export function formatTicketLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

/** Format a date string (YYYY-MM-DD) as a short readable date. */
export function formatDueDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Status helpers ────────────────────────────────────────────────────────────

/** Returns true for statuses that represent active/open work. */
export function isOpenStatus(status: TicketStatus): boolean {
  return status === 'open' || status === 'in_progress' || status === 'awaiting_requester';
}

/** Returns true when a ticket's requested due date has passed while still open. */
export function isOverdue(ticket: { requested_due_date?: string | null; status: TicketStatus }): boolean {
  if (!ticket.requested_due_date || !isOpenStatus(ticket.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${ticket.requested_due_date}T00:00:00`) < today;
}

// ── Custom field extraction ───────────────────────────────────────────────────

export interface CustomFieldEntry {
  key: string;
  label: string;
  value: string;
}

export function customFieldEntries(
  ticket: { category: string; custom_fields?: Record<string, unknown> | null },
  labelMap: Record<string, string>,
): CustomFieldEntry[] {
  return Object.entries(ticket.custom_fields ?? {})
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .map(([key, value]) => ({
      key,
      label: labelMap[`${ticket.category}:${key}`] ?? formatTicketLabel(key),
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }));
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Badge variant maps ────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export const statusVariantMap: Record<TicketStatus, BadgeVariant> = {
  open: 'default',
  in_progress: 'secondary',
  awaiting_requester: 'outline',
  resolved: 'outline',
  closed: 'outline',
  cancelled: 'outline',
};

export const statusColorMap: Record<TicketStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  awaiting_requester: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800',
  closed: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700',
  cancelled: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
};
export const priorityVariantMap: Record<TicketPriority, BadgeVariant> = {
  low: 'outline',
  medium: 'secondary',
  high: 'destructive',
};

export const priorityColorMap: Record<TicketPriority, string> = {
  low: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
};

// ── Approval status helpers ───────────────────────────────────────────────────

export function isApprovalAssignedToUser(
  ticket: { approval_status?: string | null; current_approver_user_id?: string | null; current_approver_role?: string | null },
  user: { id?: string; role?: string } | null | undefined,
): boolean {
  if (!user || ticket.approval_status !== 'pending') return false;
  // Specific user assignment: direct match
  if (ticket.current_approver_user_id) {
    return ticket.current_approver_user_id === user.id;
  }
  // Role-based assignment: HRMS role membership cannot be checked synchronously here.
  // Allow admin users to attempt; the backend enforces HRMS role membership.
  if (ticket.current_approver_role) {
    return user.role === 'super_admin' || user.role === 'company_admin';
  }
  return false;
}
