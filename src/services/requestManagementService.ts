import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import { logUserAction } from './auditService';
import { createNotifications } from './notificationService';
import {
  listCompanyTickets,
  listTicketActivity,
  listTicketChatSummaries,
  updateTicket,
  type CompanyTicketRecord,
  type TicketActivityRecord,
  type TicketChatSummary,
  type TicketPriority,
} from './ticketService';
import { getTicketSlaSummary } from '@/lib/ticketSla';
import { isOpenStatus } from '@/lib/requestFormatters';

export interface RequestSavedFilterRecord {
  id: string;
  name: string;
  scope: 'queue' | 'reports';
  filters: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RequestOperationalIndicator {
  ticket_id: string;
  request_age_ms: number;
  time_in_current_status_ms: number;
  time_pending_requester_ms: number;
  time_pending_owner_ms: number;
  handover_count: number;
  requester_follow_up_count: number;
  chat_message_count: number;
  reopen_count: number;
  stale: boolean;
  stuck: boolean;
  at_risk: boolean;
  breached: boolean;
}

export interface RequestManagementDashboard {
  total_pending: number;
  unassigned: number;
  in_progress: number;
  pending_requester: number;
  pending_owner_review: number;
  sla_breached: number;
  at_risk: number;
  completed: number;
  reopened: number;
  average_response_ms: number | null;
  average_resolution_ms: number | null;
  requester_satisfaction_score: number | null;
  oldest_pending: CompanyTicketRecord[];
  request_volume_by_category: Array<{ category: string; count: number }>;
  workload_by_owner: Array<{ owner_id: string | null; owner_name: string; pending: number; breached: number; at_risk: number }>;
  sla_performance_by_owner: Array<{ owner_id: string | null; owner_name: string; total: number; breached: number; met: number; at_risk: number }>;
  indicators_by_ticket: Record<string, RequestOperationalIndicator>;
}

function table(name: string) {
  return (supabase as never as { from: (tableName: string) => ReturnType<typeof supabase.from> }).from(name);
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function elapsed(from: string | null | undefined, to: string | null | undefined = new Date().toISOString()) {
  if (!from || !to) return 0;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return end - start;
}

export function buildRequestOperationalIndicators(
  tickets: CompanyTicketRecord[],
  activitiesByTicket: Record<string, TicketActivityRecord[]>,
  chatSummariesByTicket: Record<string, TicketChatSummary> = {},
): Record<string, RequestOperationalIndicator> {
  const now = new Date().toISOString();
  return Object.fromEntries(tickets.map((ticket) => {
    const activities = activitiesByTicket[ticket.id] ?? [];
    const statusEvents = activities
      .filter((activity) => activity.event_type === 'status_changed')
      .slice()
      .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());

    let pendingRequesterMs = 0;
    let pendingOwnerMs = 0;
    statusEvents.forEach((event, index) => {
      const after = String(event.metadata?.after ?? '');
      const startedAt = event.created_at ?? ticket.created_at;
      const endedAt = statusEvents[index + 1]?.created_at ?? now;
      if (after === 'pending_requester') pendingRequesterMs += elapsed(startedAt, endedAt);
      if (after === 'pending_owner_review' || after === 'open' || after === 'in_progress' || after === 'reopened') {
        pendingOwnerMs += elapsed(startedAt, endedAt);
      }
    });

    const sla = getTicketSlaSummary(ticket);
    const ageMs = elapsed(ticket.created_at, isOpenStatus(ticket.status) ? now : ticket.closed_at ?? ticket.resolved_at ?? ticket.updated_at);
    const timeInStatusMs = elapsed(ticket.status_changed_at, now);
    const stale = isOpenStatus(ticket.status) && elapsed(ticket.updated_at, now) > 3 * 24 * 60 * 60 * 1000;
    const stuck = isOpenStatus(ticket.status) && timeInStatusMs > 5 * 24 * 60 * 60 * 1000;
    const indicator: RequestOperationalIndicator = {
      ticket_id: ticket.id,
      request_age_ms: ageMs,
      time_in_current_status_ms: timeInStatusMs,
      time_pending_requester_ms: pendingRequesterMs,
      time_pending_owner_ms: pendingOwnerMs,
      handover_count: activities.filter((activity) => activity.event_type === 'owner_changed').length,
      requester_follow_up_count: activities.filter((activity) => activity.event_type === 'requester_update_submitted').length,
      chat_message_count: chatSummariesByTicket[ticket.id]?.message_count ?? activities.filter((activity) => activity.event_type === 'comment_added').length,
      reopen_count: ticket.reopen_count,
      stale,
      stuck,
      at_risk: sla.overall === 'at_risk',
      breached: sla.overall === 'breached',
    };
    return [ticket.id, indicator];
  }));
}

export async function getRequestManagementDashboard(
  companyId: string,
  userId: string,
  dateFrom?: Date | null,
  dateTo?: Date | null,
): Promise<{ data: RequestManagementDashboard | null; error: Error | null }> {
  try {
    const { data: tickets, error } = await listCompanyTickets(companyId);
    if (error) throw error;
    const rawRows = tickets ?? [];
    const rows = rawRows.filter((ticket) => {
      const created = new Date(ticket.created_at);
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
      return true;
    });
    const pending = rows.filter((ticket) => isOpenStatus(ticket.status));
    const indicatorTicketIds = pending.map((ticket) => ticket.id);
    const [{ data: activitiesByTicket }, { data: chatSummariesByTicket }] = await Promise.all([
      listTicketActivity(indicatorTicketIds, companyId),
      listTicketChatSummaries(indicatorTicketIds, userId, companyId),
    ]);
    const indicatorsByTicket = buildRequestOperationalIndicators(pending, activitiesByTicket ?? {}, chatSummariesByTicket ?? {});
    const completed = rows.filter((ticket) => ticket.status === 'closed');
    const responseDurations = rows
      .filter((ticket) => ticket.first_responded_at)
      .map((ticket) => elapsed(ticket.created_at, ticket.first_responded_at));
    const resolutionDurations = completed
      .map((ticket) => elapsed(ticket.created_at, ticket.closed_at ?? ticket.resolved_at ?? ticket.updated_at))
      .filter((value) => value > 0);
    const satisfactionValues = completed
      .map((ticket) => ticket.satisfaction_rating)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    const volumeByCategory = new Map<string, number>();
    rows.forEach((ticket) => volumeByCategory.set(ticket.category, (volumeByCategory.get(ticket.category) ?? 0) + 1));

    const workloadByOwner = new Map<string, { owner_id: string | null; owner_name: string; pending: number; breached: number; at_risk: number }>();
    const slaByOwner = new Map<string, { owner_id: string | null; owner_name: string; total: number; breached: number; met: number; at_risk: number }>();
    pending.forEach((ticket) => {
      const key = ticket.assigned_to ?? 'unassigned';
      const ownerName = ticket.assigned_to_name ?? ticket.responsible_queue ?? 'Unassigned';
      const indicator = indicatorsByTicket[ticket.id];
      const workload = workloadByOwner.get(key) ?? { owner_id: ticket.assigned_to, owner_name: ownerName, pending: 0, breached: 0, at_risk: 0 };
      workload.pending += 1;
      if (indicator?.breached) workload.breached += 1;
      if (indicator?.at_risk) workload.at_risk += 1;
      workloadByOwner.set(key, workload);
    });
    rows.forEach((ticket) => {
      const key = ticket.assigned_to ?? 'unassigned';
      const ownerName = ticket.assigned_to_name ?? ticket.responsible_queue ?? 'Unassigned';
      const summary = getTicketSlaSummary(ticket);
      const row = slaByOwner.get(key) ?? { owner_id: ticket.assigned_to, owner_name: ownerName, total: 0, breached: 0, met: 0, at_risk: 0 };
      row.total += 1;
      if (summary.overall === 'breached') row.breached += 1;
      if (summary.overall === 'met') row.met += 1;
      if (summary.overall === 'at_risk') row.at_risk += 1;
      slaByOwner.set(key, row);
    });

    return {
      data: {
        total_pending: pending.length,
        unassigned: pending.filter((ticket) => !ticket.assigned_to).length,
        in_progress: pending.filter((ticket) => ticket.status === 'in_progress').length,
        pending_requester: pending.filter((ticket) => ticket.status === 'pending_requester').length,
        pending_owner_review: pending.filter((ticket) => ticket.status === 'pending_owner_review').length,
        sla_breached: pending.filter((ticket) => indicatorsByTicket[ticket.id]?.breached).length,
        at_risk: pending.filter((ticket) => indicatorsByTicket[ticket.id]?.at_risk).length,
        completed: completed.length,
        reopened: rows.filter((ticket) => ticket.status === 'reopened' || ticket.reopen_count > 0).length,
        average_response_ms: average(responseDurations),
        average_resolution_ms: average(resolutionDurations),
        requester_satisfaction_score: average(satisfactionValues),
        oldest_pending: pending.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(0, 8),
        request_volume_by_category: Array.from(volumeByCategory.entries()).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
        workload_by_owner: Array.from(workloadByOwner.values()).sort((a, b) => b.pending - a.pending),
        sla_performance_by_owner: Array.from(slaByOwner.values()).sort((a, b) => b.total - a.total),
        indicators_by_ticket: indicatorsByTicket,
      },
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load request dashboard');
    loggingService.error('Failed to load request dashboard', { error: error.message }, 'RequestManagementService');
    return { data: null, error };
  }
}

export async function listRequestSavedFilters(
  companyId: string,
  userId: string,
  scope: 'queue' | 'reports' = 'queue',
): Promise<{ data: RequestSavedFilterRecord[]; error: Error | null }> {
  try {
    const { data, error } = await table('request_saved_filters')
      .select('id, name, scope, filters, created_at, updated_at')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .eq('scope', scope)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return { data: (data ?? []) as RequestSavedFilterRecord[], error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load saved filters');
    loggingService.error('Failed to load saved filters', { error: error.message }, 'RequestManagementService');
    return { data: [], error };
  }
}

export async function saveRequestFilter(
  companyId: string,
  userId: string,
  input: { id?: string | null; name: string; scope?: 'queue' | 'reports'; filters: Record<string, unknown> },
): Promise<{ data: RequestSavedFilterRecord | null; error: Error | null }> {
  try {
    const payload = {
      company_id: companyId,
      user_id: userId,
      name: input.name.trim(),
      scope: input.scope ?? 'queue',
      filters: input.filters,
    };
    const query = input.id
      ? table('request_saved_filters').update(payload).eq('id', input.id).eq('company_id', companyId).eq('user_id', userId)
      : table('request_saved_filters').insert(payload);
    const { data, error } = await query.select('id, name, scope, filters, created_at, updated_at').single();
    if (error) throw error;
    void logUserAction(userId, input.id ? 'update' : 'create', 'request_saved_filter', String((data as { id?: string }).id ?? payload.name), {
      component: 'RequestManagementService',
      name: payload.name,
      scope: payload.scope,
    });
    return { data: data as unknown as RequestSavedFilterRecord, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to save filter');
    loggingService.error('Failed to save request filter', { error: error.message }, 'RequestManagementService');
    return { data: null, error };
  }
}

export async function deleteRequestSavedFilter(
  companyId: string,
  userId: string,
  filterId: string,
): Promise<{ data: true | null; error: Error | null }> {
  try {
    const { error } = await table('request_saved_filters')
      .delete()
      .eq('id', filterId)
      .eq('company_id', companyId)
      .eq('user_id', userId);
    if (error) throw error;
    return { data: true, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to delete filter');
    loggingService.error('Failed to delete request filter', { error: error.message }, 'RequestManagementService');
    return { data: null, error };
  }
}

async function insertBulkActivity(companyId: string, actorId: string, ticketIds: string[], message: string, metadata: Record<string, unknown>) {
  if (ticketIds.length === 0) return;
  await table('ticket_activity').insert(ticketIds.map((ticketId) => ({
    ticket_id: ticketId,
    company_id: companyId,
    actor_id: actorId,
    event_type: 'bulk_action_performed',
    message,
    metadata,
  })));
}

export async function bulkUpdateRequestPriority(
  ticketIds: string[],
  priority: TicketPriority,
  reason: string,
  context: { userId: string; companyId: string },
): Promise<{ updated: number; error: Error | null }> {
  if (!reason.trim()) return { updated: 0, error: new Error('Reason is required for bulk priority updates.') };
  try {
    const results = await Promise.all(ticketIds.map((ticketId) =>
      updateTicket(ticketId, { priority }, context),
    ));
    const updatedIds = ticketIds.filter((_, index) => !results[index].error);
    await insertBulkActivity(context.companyId, context.userId, updatedIds, 'Bulk priority update performed.', {
      priority,
      reason: reason.trim(),
    });
    return { updated: updatedIds.length, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to bulk update priority');
    return { updated: 0, error };
  }
}

export async function bulkArchiveRequests(
  ticketIds: string[],
  reason: string,
  context: { userId: string; companyId: string },
): Promise<{ updated: number; error: Error | null }> {
  if (!reason.trim()) return { updated: 0, error: new Error('Reason is required for bulk archive.') };
  try {
    const results = await Promise.all(ticketIds.map((ticketId) =>
      updateTicket(ticketId, { status: 'cancelled', admin_override_reason: reason }, context),
    ));
    const updatedIds = ticketIds.filter((_, index) => !results[index].error);
    await insertBulkActivity(context.companyId, context.userId, updatedIds, 'Bulk archive performed.', { reason: reason.trim() });
    return { updated: updatedIds.length, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to bulk archive requests');
    return { updated: 0, error };
  }
}

export async function bulkNotifyRequestParticipants(
  tickets: CompanyTicketRecord[],
  input: { audience: 'requesters' | 'owners'; message: string },
  context: { userId: string; companyId: string },
): Promise<{ notified: number; error: Error | null }> {
  const message = input.message.trim();
  if (!message) return { notified: 0, error: new Error('Notification message is required.') };

  try {
    const notifications = tickets.flatMap((ticket) => {
      const recipientId = input.audience === 'owners' ? ticket.assigned_to : ticket.submitted_by;
      if (!recipientId || recipientId === context.userId) return [];
      return [{
        userId: recipientId,
        title: 'Request update',
        message: `"${ticket.subject}": ${message}`,
        type: 'info' as const,
      }];
    });
    if (notifications.length > 0) await createNotifications(notifications);
    await insertBulkActivity(context.companyId, context.userId, tickets.map((ticket) => ticket.id), 'Bulk notification sent.', {
      audience: input.audience,
      message,
    });
    return { notified: notifications.length, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to send bulk notifications');
    return { notified: 0, error };
  }
}
