import { supabase } from '@/integrations/supabase/client';
import { type RequestCategoryValue } from '@/lib/requestCategories';
import { logUserAction } from './auditService';
import { loggingService } from './loggingService';
import { createNotifications, type CreateNotificationInput } from './notificationService';
import { evaluateRoutingRules } from './requestRoutingService';

/**
 * Ticket service — the only module allowed to talk to the `tickets` table.
 * Pages and components consume these functions rather than importing the
 * Supabase client directly (enforced by the `no-restricted-syntax` ESLint rule
 * on `src/pages/**` and `src/components/**`).
 *
 * The generated `Database` type does not yet include the `tickets` table, so
 * we declare a local row/insert shape here. This shim is replaced by the
 * generated types the next time `supabase gen types` runs.
 */

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketCategory = RequestCategoryValue;

export interface TicketRecord {
  id: string;
  company_id: string;
  subject: string;
  category: TicketCategory;
  subcategory: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  description: string;
  vso_number: string | null;
  submitted_by: string;
  assigned_to: string | null;
  assigned_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestTicketRecord extends TicketRecord {
  assigned_to_name: string | null;
  assigned_to_email: string | null;
}

export interface CompanyTicketRecord extends RequestTicketRecord {
  submitted_by_name: string | null;
  submitted_by_email: string | null;
}

export interface CreateTicketInput {
  subject: string;
  category: TicketCategory;
  subcategory?: string | null;
  priority: TicketPriority;
  description: string;
  vso_number?: string | null;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigned_to?: string | null;
  resolution_note?: string | null;
}

export interface TicketServiceResult<T> {
  data: T | null;
  error: Error | null;
}

export type TicketActivityEventType = 'status_changed' | 'owner_changed' | 'resolution_note_updated' | 'priority_changed';

export interface TicketActivityRecord {
  id: string;
  ticket_id: string;
  actor_id: string;
  actor_name: string | null;
  event_type: TicketActivityEventType;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

type TicketRow = TicketRecord;

interface ProfileLookupRow {
  id: string;
  name: string | null;
  email: string | null;
}

interface TicketActivityRow {
  id: string;
  ticket_id: string;
  company_id: string;
  actor_id: string;
  event_type: TicketActivityEventType;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

interface TicketActivityInsert {
  ticket_id: string;
  company_id: string;
  actor_id: string;
  event_type: TicketActivityEventType;
  message: string;
  metadata: Record<string, unknown>;
}

function mapTicket(row: TicketRow): TicketRecord {
  return {
    id: row.id,
    company_id: row.company_id,
    subject: row.subject,
    category: row.category,
    subcategory: row.subcategory,
    priority: row.priority,
    status: row.status,
    description: row.description,
    submitted_by: row.submitted_by,
    assigned_to: row.assigned_to,
    assigned_at: row.assigned_at,
    resolved_at: row.resolved_at,
    resolution_note: row.resolution_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function fetchProfilesById(companyId: string, ids: string[]): Promise<Map<string, ProfileLookupRow>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, ProfileLookupRow>();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('company_id', companyId)
    .in('id', uniqueIds);

  if (error) throw error;

  return new Map((data ?? []).map((profile) => [profile.id, profile as ProfileLookupRow]));
}

function mapRequestTicket(ticket: TicketRecord, profilesById: Map<string, ProfileLookupRow>): RequestTicketRecord {
  return {
    ...ticket,
    assigned_to_name: ticket.assigned_to ? profilesById.get(ticket.assigned_to)?.name ?? null : null,
    assigned_to_email: ticket.assigned_to ? profilesById.get(ticket.assigned_to)?.email ?? null : null,
  };
}

// Keep the generated-type escape hatch isolated to this service.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ticketsTable(): any {
  return supabase.from('tickets' as never);
}

// Keep the activity table escape hatch beside the tickets one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ticketActivityTable(): any {
  return supabase.from('ticket_activity' as never);
}

function formatTicketLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function buildTicketActivityEntries(before: TicketRecord, after: TicketRecord, actorId: string): TicketActivityInsert[] {
  const entries: TicketActivityInsert[] = [];

  if (before.status !== after.status) {
    entries.push({
      ticket_id: after.id,
      company_id: after.company_id,
      actor_id: actorId,
      event_type: 'status_changed',
      message: `Status changed from ${formatTicketLabel(before.status)} to ${formatTicketLabel(after.status)}.`,
      metadata: { before: before.status, after: after.status },
    });
  }

  if (before.assigned_to !== after.assigned_to) {
    entries.push({
      ticket_id: after.id,
      company_id: after.company_id,
      actor_id: actorId,
      event_type: 'owner_changed',
      message: after.assigned_to ? 'Request owner assigned.' : 'Request owner cleared.',
      metadata: { before: before.assigned_to, after: after.assigned_to },
    });
  }

  if ((before.resolution_note ?? '') !== (after.resolution_note ?? '')) {
    entries.push({
      ticket_id: after.id,
      company_id: after.company_id,
      actor_id: actorId,
      event_type: 'resolution_note_updated',
      message: after.resolution_note
        ? before.resolution_note
          ? 'Resolution note updated.'
          : 'Resolution note added.'
        : 'Resolution note cleared.',
      metadata: { before: before.resolution_note, after: after.resolution_note },
    });
  }

  if (before.priority !== after.priority) {
    entries.push({
      ticket_id: after.id,
      company_id: after.company_id,
      actor_id: actorId,
      event_type: 'priority_changed',
      message: `Priority changed from ${before.priority} to ${after.priority}.`,
      metadata: { before: before.priority, after: after.priority },
    });
  }

  return entries;
}

function buildTicketNotifications(
  before: TicketRecord,
  after: TicketRecord,
  actorId: string,
): CreateNotificationInput[] {
  const notifications: CreateNotificationInput[] = [];

  if (before.status !== after.status && after.submitted_by !== actorId) {
    const resolutionSuffix = after.resolution_note && (after.status === 'resolved' || after.status === 'closed')
      ? ` ${after.resolution_note}`
      : '';

    notifications.push({
      userId: after.submitted_by,
      title: 'Request status updated',
      message: `"${after.subject}" is now ${formatTicketLabel(after.status)}.${resolutionSuffix}`,
      type: after.status === 'resolved' || after.status === 'closed' ? 'success' : 'info',
    });
  }

  if (before.assigned_to !== after.assigned_to) {
    if (after.submitted_by !== actorId) {
      notifications.push({
        userId: after.submitted_by,
        title: after.assigned_to ? 'Request owner assigned' : 'Request owner updated',
        message: after.assigned_to
          ? `An internal owner has been assigned to "${after.subject}".`
          : `"${after.subject}" has been returned to triage.`,
        type: 'info',
      });
    }

    if (after.assigned_to && after.assigned_to !== actorId && after.assigned_to !== after.submitted_by) {
      notifications.push({
        userId: after.assigned_to,
        title: 'Request assigned to you',
        message: `You have been assigned "${after.subject}".`,
        type: 'info',
      });
    }
  }

  return notifications;
}

export async function listMyTickets(userId: string, companyId: string): Promise<TicketServiceResult<RequestTicketRecord[]>> {
  try {
    const { data, error } = await ticketsTable()
      .select(
        'id, subject, category, subcategory, priority, status, description, created_at, updated_at, company_id, submitted_by, assigned_to, assigned_at, resolved_at, resolution_note',
      )
      .eq('submitted_by', userId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = ((data ?? []) as TicketRow[]).map(mapTicket);
    const profilesById = await fetchProfilesById(
      companyId,
      rows.map((ticket) => ticket.assigned_to).filter((ticketId): ticketId is string => Boolean(ticketId)),
    );

    return { data: rows.map((ticket) => mapRequestTicket(ticket, profilesById)), error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load tickets');
    loggingService.error('Failed to list tickets', { error: error.message }, 'TicketService');
    return { data: null, error };
  }
}

export async function listCompanyTickets(companyId: string): Promise<TicketServiceResult<CompanyTicketRecord[]>> {
  try {
    const { data, error } = await ticketsTable()
      .select(
        'id, subject, category, subcategory, priority, status, description, created_at, updated_at, company_id, submitted_by, assigned_to, assigned_at, resolved_at, resolution_note',
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = ((data ?? []) as TicketRow[]).map(mapTicket);
    const profilesById = await fetchProfilesById(
      companyId,
      rows.flatMap((ticket) => {
        const people = [ticket.submitted_by];
        if (ticket.assigned_to) people.push(ticket.assigned_to);
        return people;
      }),
    );

    return {
      data: rows.map((ticket) => ({
        ...mapRequestTicket(ticket, profilesById),
        submitted_by_name: profilesById.get(ticket.submitted_by)?.name ?? null,
        submitted_by_email: profilesById.get(ticket.submitted_by)?.email ?? null,
      })),
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load company tickets');
    loggingService.error('Failed to list company tickets', { error: error.message }, 'TicketService');
    return { data: null, error };
  }
}

export async function listTicketActivity(
  ticketIds: string[],
  companyId: string,
): Promise<TicketServiceResult<Record<string, TicketActivityRecord[]>>> {
  if (ticketIds.length === 0) {
    return { data: {}, error: null };
  }

  try {
    const { data, error } = await ticketActivityTable()
      .select('id, ticket_id, company_id, actor_id, event_type, message, metadata, created_at')
      .in('ticket_id', ticketIds)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = (data ?? []) as TicketActivityRow[];
    const profilesById = await fetchProfilesById(companyId, rows.map((row) => row.actor_id));
    const grouped = Object.fromEntries(ticketIds.map((ticketId) => [ticketId, [] as TicketActivityRecord[]]));

    rows.forEach((row) => {
      const actor = profilesById.get(row.actor_id);
      grouped[row.ticket_id]?.push({
        id: row.id,
        ticket_id: row.ticket_id,
        actor_id: row.actor_id,
        actor_name: actor?.name ?? null,
        event_type: row.event_type,
        message: row.message,
        metadata: row.metadata,
        created_at: row.created_at,
      });
    });

    return { data: grouped, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load request activity');
    loggingService.error('Failed to load request activity', { error: error.message }, 'TicketService');
    return { data: null, error };
  }
}

export async function createTicket(
  input: CreateTicketInput,
  context: { userId: string; companyId: string; submitterRole?: string | null },
): Promise<TicketServiceResult<{ id: string }>> {
  try {
    // Evaluate auto-routing rules before insert
    const autoAssignTo = await evaluateRoutingRules(context.companyId, {
      category: input.category,
      subcategory: input.subcategory?.trim() ? input.subcategory.trim() : null,
      priority: input.priority,
      submitterRole: context.submitterRole ?? null,
    });

    const { data, error } = await ticketsTable()
      .insert({
        ...input,
        subcategory: input.subcategory?.trim() ? input.subcategory.trim() : null,
        vso_number: input.vso_number?.trim() ? input.vso_number.trim() : null,
        company_id: context.companyId,
        submitted_by: context.userId,
        status: 'open',
        assigned_to: autoAssignTo,
        assigned_at: autoAssignTo ? new Date().toISOString() : null,
        resolution_note: null,
      })
      .select('id')
      .single();
    if (error) throw error;

    const ticketId = (data as { id: string }).id;
    void logUserAction(context.userId, 'create', 'ticket', ticketId, { component: 'TicketService' });

    // Notify auto-assigned user if different from submitter
    if (autoAssignTo && autoAssignTo !== context.userId) {
      void createNotifications([{
        userId: autoAssignTo,
        title: 'Request assigned to you',
        message: `You have been automatically assigned "${input.subject}".`,
        type: 'info',
      }]);
    }

    return { data: { id: ticketId }, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to create ticket');
    loggingService.error(
      'Failed to create ticket',
      { error: error.message, category: input.category, subcategory: input.subcategory, priority: input.priority },
      'TicketService',
    );
    return { data: null, error };
  }
}

export async function updateTicket(
  ticketId: string,
  input: UpdateTicketInput,
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<TicketRecord>> {
  const patch: Record<string, string | null> = {};

  if (input.status) patch.status = input.status;
  if (input.priority) patch.priority = input.priority;
  if (input.assigned_to !== undefined) patch.assigned_to = input.assigned_to;
  if (input.resolution_note !== undefined) {
    patch.resolution_note = input.resolution_note?.trim() ? input.resolution_note.trim() : null;
  }

  if (Object.keys(patch).length === 0) {
    return { data: null, error: new Error('No request updates were provided') };
  }

  try {
    const { data: currentData, error: currentError } = await ticketsTable()
      .select(
        'id, subject, category, subcategory, priority, status, description, created_at, updated_at, company_id, submitted_by, assigned_to, assigned_at, resolved_at, resolution_note',
      )
      .eq('company_id', context.companyId)
      .eq('id', ticketId)
      .single();

    if (currentError) throw currentError;

    const current = mapTicket(currentData as TicketRow);

    // Stamp assigned_at whenever the assignee changes
    if (input.assigned_to !== undefined) {
      patch.assigned_at = input.assigned_to ? new Date().toISOString() : null;
    }

    // Stamp resolved_at on first resolution; clear it if the ticket is re-opened
    if (input.status) {
      const isNowResolved = input.status === 'resolved' || input.status === 'closed';
      const wasResolved = current.status === 'resolved' || current.status === 'closed';
      if (isNowResolved && !wasResolved) {
        patch.resolved_at = new Date().toISOString();
      } else if (!isNowResolved && wasResolved) {
        patch.resolved_at = null;
      }
    }

    const { data, error } = await ticketsTable()
      .update(patch)
      .eq('company_id', context.companyId)
      .eq('id', ticketId)
      .select(
        'id, subject, category, subcategory, priority, status, description, created_at, updated_at, company_id, submitted_by, assigned_to, assigned_at, resolved_at, resolution_note',
      )
      .single();

    if (error) throw error;

    const previousTicket = mapTicket(currentData as TicketRow);
    const nextTicket = mapTicket(data as TicketRow);
    const activityEntries = buildTicketActivityEntries(previousTicket, nextTicket, context.userId);
    const notifications = buildTicketNotifications(previousTicket, nextTicket, context.userId);

    const sideEffects: Promise<unknown>[] = [];
    if (activityEntries.length > 0) {
      sideEffects.push(ticketActivityTable().insert(activityEntries));
    }
    if (notifications.length > 0) {
      sideEffects.push(createNotifications(notifications));
    }

    if (sideEffects.length > 0) {
      await Promise.allSettled(sideEffects);
    }

    void logUserAction(context.userId, 'update', 'ticket', ticketId, {
      component: 'TicketService',
      ...patch,
    });

    return { data: nextTicket, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to update ticket');
    loggingService.error('Failed to update ticket', { error: error.message, ticketId, ...patch }, 'TicketService');
    return { data: null, error };
  }
}
