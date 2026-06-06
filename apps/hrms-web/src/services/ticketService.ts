import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { type RequestCategoryValue } from '@/lib/requestCategories';
import { logUserAction } from './auditService';
import { loggingService } from './loggingService';
import { createNotifications, type CreateNotificationInput } from './notificationService';
import {
  evaluateRoutingRules,
  cancelInternalRequestApprovalInstance,
  createInternalRequestApprovalInstance,
  getInternalRequestApprovalGate,
  getInternalRequestApprovalPlan,
  listInternalRequestApprovalMetadata,
  type InternalRequestApprovalMetadata,
} from '@flc/internal-requests';

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

export type TicketStatus = 'open' | 'in_progress' | 'awaiting_requester' | 'resolved' | 'closed' | 'cancelled';
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
  requested_due_date: string | null;
  business_impact: string | null;
  desired_outcome: string | null;
  custom_fields: Record<string, unknown>;
  vso_number: string | null;
  submitted_by: string;
  assigned_to: string | null;
  assigned_at: string | null;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  first_responded_at: string | null;
  approval_instance_id: string | null;
  approval_status: InternalRequestApprovalMetadata['status'] | null;
  current_approval_step_name: string | null;
  current_approver_role: string | null;
  current_approver_user_id: string | null;
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
  requested_due_date?: string | null;
  business_impact?: string | null;
  desired_outcome?: string | null;
  custom_fields?: Record<string, unknown>;
  vso_number?: string | null;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigned_to?: string | null;
  resolution_note?: string | null;
  mark_opened?: boolean;
}

export interface AddTicketCommentInput {
  message: string;
}

export interface CancelTicketInput {
  reason?: string | null;
}

export interface TicketServiceResult<T> {
  data: T | null;
  error: Error | null;
}

export interface PaginatedTicketResult<T> {
  rows: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/** 'active' = open|in_progress|awaiting_requester; 'archived' = resolved|closed|cancelled */
export type TicketStatusFilter = TicketStatus | 'all' | 'active' | 'archived';

const ACTIVE_STATUSES: TicketStatus[] = ['open', 'in_progress', 'awaiting_requester'];
const ARCHIVED_STATUSES: TicketStatus[] = ['resolved', 'closed', 'cancelled'];

export interface CompanyTicketListOptions {
  page?: number;
  pageSize?: number;
  status?: TicketStatusFilter;
  priority?: TicketPriority | 'all';
  search?: string;
  /** Filter by assignee. 'unassigned' returns only tickets with null assigned_to. */
  assignedTo?: string | 'unassigned';
}

export type TicketActivityEventType = 'status_changed' | 'owner_changed' | 'resolution_note_updated' | 'priority_changed' | 'comment_added';

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
type TicketUpdate = Database['public']['Tables']['tickets']['Update'];
type TicketActivityDbInsert = Database['public']['Tables']['ticket_activity']['Insert'];

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

interface TicketActivityInsert extends TicketActivityDbInsert {
  ticket_id: string;
  company_id: string;
  actor_id: string;
  event_type: TicketActivityEventType;
  message: string;
  metadata: Json;
}

const LEGACY_TICKET_SELECT =
  'id, subject, category, subcategory, priority, status, description, vso_number, created_at, updated_at, company_id, submitted_by, assigned_to, assigned_at, resolved_at, resolution_note';

const OPERATIONAL_TICKET_SELECT =
  'id, subject, category, subcategory, priority, status, description, requested_due_date, business_impact, desired_outcome, vso_number, created_at, updated_at, company_id, submitted_by, assigned_to, assigned_at, resolved_at, resolution_note';

const MODERN_TICKET_SELECT =
  'id, subject, category, subcategory, priority, status, description, requested_due_date, business_impact, desired_outcome, custom_fields, vso_number, created_at, updated_at, company_id, submitted_by, assigned_to, assigned_at, resolved_at, resolution_note';

const TICKET_SELECT =
  'id, subject, category, subcategory, priority, status, description, requested_due_date, business_impact, desired_outcome, custom_fields, vso_number, created_at, updated_at, company_id, submitted_by, assigned_to, assigned_at, first_response_due_at, resolution_due_at, first_responded_at, resolved_at, resolution_note';

const operationalTicketFields = [
  'requested_due_date',
  'business_impact',
  'desired_outcome',
  'custom_fields',
  'first_response_due_at',
  'resolution_due_at',
  'first_responded_at',
];

function isMissingOperationalTicketFieldError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  return operationalTicketFields.some((field) => message.includes(field));
}

function getFallbackTicketSelect(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  if (message.includes('custom_fields')) return OPERATIONAL_TICKET_SELECT;
  if (
    message.includes('first_response_due_at')
    || message.includes('resolution_due_at')
    || message.includes('first_responded_at')
  ) {
    return MODERN_TICKET_SELECT;
  }
  return LEGACY_TICKET_SELECT;
}

function appendOperationalContextToDescription(
  description: string,
  input: Pick<CreateTicketInput, 'requested_due_date' | 'business_impact' | 'desired_outcome'>,
) {
  const details = [
    input.requested_due_date?.trim() ? `Needed by: ${input.requested_due_date.trim()}` : '',
    input.desired_outcome?.trim() ? `Desired outcome: ${input.desired_outcome.trim()}` : '',
    input.business_impact?.trim() ? `Business impact: ${input.business_impact.trim()}` : '',
  ].filter(Boolean);

  if (details.length === 0) return description;
  return `${description.trim()}\n\nOperational context:\n${details.join('\n')}`;
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
    requested_due_date: row.requested_due_date ?? null,
    business_impact: row.business_impact ?? null,
    desired_outcome: row.desired_outcome ?? null,
    custom_fields: row.custom_fields ?? {},
    vso_number: row.vso_number ?? null,
    submitted_by: row.submitted_by,
    assigned_to: row.assigned_to,
    assigned_at: row.assigned_at,
    first_response_due_at: row.first_response_due_at ?? null,
    resolution_due_at: row.resolution_due_at ?? null,
    first_responded_at: row.first_responded_at ?? null,
    approval_instance_id: row.approval_instance_id ?? null,
    approval_status: row.approval_status ?? null,
    current_approval_step_name: row.current_approval_step_name ?? null,
    current_approver_role: row.current_approver_role ?? null,
    current_approver_user_id: row.current_approver_user_id ?? null,
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

function ticketsTable() {
  return supabase.from('tickets');
}

function ticketActivityTable() {
  return supabase.from('ticket_activity');
}

function toJsonObject(value: Record<string, unknown> | null | undefined): Json {
  return (value ?? {}) as Json;
}

function formatTicketLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function isResolvedTicketStatus(status: TicketStatus) {
  return status === 'resolved' || status === 'closed' || status === 'cancelled';
}

function isFirstResponseTicketStatus(status: TicketStatus) {
  return status === 'in_progress' || status === 'awaiting_requester' || status === 'resolved' || status === 'closed';
}

async function fetchTicketForUpdate(ticketId: string, companyId: string) {
  let { data, error } = await ticketsTable()
    .select(TICKET_SELECT)
    .eq('company_id', companyId)
    .eq('id', ticketId)
    .single();

  const useLegacyTicketSelect = Boolean(error && isMissingOperationalTicketFieldError(error));
  const fallbackSelect = error ? getFallbackTicketSelect(error) : TICKET_SELECT;
  if (useLegacyTicketSelect) {
    const legacyResult = await ticketsTable()
      .select(fallbackSelect)
      .eq('company_id', companyId)
      .eq('id', ticketId)
      .single();
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) throw error;
  return {
    ticket: mapTicket(data as TicketRow),
    select: useLegacyTicketSelect ? fallbackSelect : TICKET_SELECT,
  };
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

function attachApprovalMetadata<T extends TicketRecord>(
  ticket: T,
  approvalsByTicket: Map<string, InternalRequestApprovalMetadata>,
): T {
  const approval = approvalsByTicket.get(ticket.id);
  if (!approval) return ticket;
  return {
    ...ticket,
    approval_instance_id: approval.id,
    approval_status: approval.status,
    current_approval_step_name: approval.currentStepName,
    current_approver_role: approval.currentApproverRole,
    current_approver_user_id: approval.currentApproverUserId,
  };
}

async function applyApprovalMetadata<T extends TicketRecord>(tickets: T[]): Promise<T[]> {
  if (tickets.length === 0) return tickets;
  const { data, error } = await listInternalRequestApprovalMetadata(tickets.map((ticket) => ticket.id));
  if (error) throw new Error(error);
  return tickets.map((ticket) => attachApprovalMetadata(ticket, data));
}

function buildTicketNotifications(
  before: TicketRecord,
  after: TicketRecord,
  actorId: string,
): CreateNotificationInput[] {
  const notifications: CreateNotificationInput[] = [];

  if (before.status !== after.status && after.submitted_by !== actorId) {
    const resolutionSuffix = after.resolution_note && isResolvedTicketStatus(after.status)
      ? ` ${after.resolution_note}`
      : '';

    notifications.push({
      userId: after.submitted_by,
      title: 'Request status updated',
      message: `"${after.subject}" is now ${formatTicketLabel(after.status)}.${resolutionSuffix}`,
      type: isResolvedTicketStatus(after.status) ? 'success' : 'info',
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

function buildCommentNotifications(ticket: TicketRecord, actorId: string, message: string): CreateNotificationInput[] {
  const recipientIds = new Set<string>();
  if (ticket.submitted_by !== actorId) recipientIds.add(ticket.submitted_by);
  if (ticket.assigned_to && ticket.assigned_to !== actorId) recipientIds.add(ticket.assigned_to);

  return [...recipientIds].map((userId) => ({
    userId,
    title: 'New request comment',
    message: `"${ticket.subject}" has a new comment: ${message.slice(0, 120)}${message.length > 120 ? '...' : ''}`,
    type: 'info',
  }));
}

async function enrichCompanyTickets(rows: TicketRecord[], companyId: string): Promise<CompanyTicketRecord[]> {
  const ticketsWithApproval = await applyApprovalMetadata(rows);
  const profilesById = await fetchProfilesById(
    companyId,
    ticketsWithApproval.flatMap((ticket) => {
      const people = [ticket.submitted_by];
      if (ticket.assigned_to) people.push(ticket.assigned_to);
      return people;
    }),
  );

  return ticketsWithApproval.map((ticket) => ({
    ...mapRequestTicket(ticket, profilesById),
    submitted_by_name: profilesById.get(ticket.submitted_by)?.name ?? null,
    submitted_by_email: profilesById.get(ticket.submitted_by)?.email ?? null,
  }));
}

function normalizeTicketPageOptions(options: CompanyTicketListOptions = {}) {
  const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  return {
    ...options,
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1,
  };
}

function sanitizeTicketSearchTerm(search: string) {
  return search.trim().replace(/[,%]/g, ' ');
}

/**
 * Returns the IDs of all profiles in the company whose name or email matches
 * the (already-sanitized) search term.  Used to include submitted_by/assigned_to
 * in the server-side OR filter without a schema change.
 */
async function findMatchingProfileIds(companyId: string, search: string): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('company_id', companyId)
    .or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  return (data ?? []).map((row: { id: string }) => row.id);
}

/**
 * Builds the PostgREST OR filter string for a full-text ticket search.
 * When profile IDs are supplied the filter also covers submitted_by and
 * assigned_to so that searching by person name/email works server-side.
 */
function buildTicketSearchOrFilter(search: string, profileIds: string[]): string {
  const parts = [
    `subject.ilike.%${search}%`,
    `description.ilike.%${search}%`,
    `vso_number.ilike.%${search}%`,
  ];
  if (profileIds.length > 0) {
    const ids = profileIds.join(',');
    parts.push(`submitted_by.in.(${ids})`);
    parts.push(`assigned_to.in.(${ids})`);
  }
  return parts.join(',');
}

export async function listMyTickets(userId: string, companyId: string): Promise<TicketServiceResult<RequestTicketRecord[]>> {
  try {
    let { data, error } = await ticketsTable()
      .select(TICKET_SELECT)
      .eq('submitted_by', userId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error && isMissingOperationalTicketFieldError(error)) {
      const legacyResult = await ticketsTable()
        .select(getFallbackTicketSelect(error))
        .eq('submitted_by', userId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;

    const rows = await applyApprovalMetadata(((data ?? []) as TicketRow[]).map(mapTicket));
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
    let { data, error } = await ticketsTable()
      .select(TICKET_SELECT)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error && isMissingOperationalTicketFieldError(error)) {
      const legacyResult = await ticketsTable()
        .select(getFallbackTicketSelect(error))
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;

    return { data: await enrichCompanyTickets(((data ?? []) as TicketRow[]).map(mapTicket), companyId), error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load company tickets');
    loggingService.error('Failed to list company tickets', { error: error.message }, 'TicketService');
    return { data: null, error };
  }
}

export async function listCompanyTicketsPage(
  companyId: string,
  options: CompanyTicketListOptions = {},
): Promise<TicketServiceResult<PaginatedTicketResult<CompanyTicketRecord>>> {
  const normalized = normalizeTicketPageOptions(options);
  const search = sanitizeTicketSearchTerm(normalized.search ?? '');

  try {
    const profileIds = search ? await findMatchingProfileIds(companyId, search) : [];

    let query = ticketsTable()
      .select(TICKET_SELECT, { count: 'exact' })
      .eq('company_id', companyId);

    if (normalized.status && normalized.status !== 'all') {
      if (normalized.status === 'active') {
        query = query.in('status', ACTIVE_STATUSES);
      } else if (normalized.status === 'archived') {
        query = query.in('status', ARCHIVED_STATUSES);
      } else {
        query = query.eq('status', normalized.status);
      }
    }
    if (normalized.priority && normalized.priority !== 'all') {
      query = query.eq('priority', normalized.priority);
    }
    if (normalized.assignedTo && normalized.assignedTo !== 'all') {
      if (normalized.assignedTo === 'unassigned') {
        query = query.is('assigned_to', null);
      } else {
        query = query.eq('assigned_to', normalized.assignedTo);
      }
    }
    if (search) {
      query = query.or(buildTicketSearchOrFilter(search, profileIds));
    }

    let { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(normalized.from, normalized.to);

    if (error && isMissingOperationalTicketFieldError(error)) {
      let legacyQuery = ticketsTable()
        .select(getFallbackTicketSelect(error), { count: 'exact' })
        .eq('company_id', companyId);

      if (normalized.status && normalized.status !== 'all') {
        if (normalized.status === 'active') {
          legacyQuery = legacyQuery.in('status', ACTIVE_STATUSES);
        } else if (normalized.status === 'archived') {
          legacyQuery = legacyQuery.in('status', ARCHIVED_STATUSES);
        } else {
          legacyQuery = legacyQuery.eq('status', normalized.status);
        }
      }
      if (normalized.priority && normalized.priority !== 'all') {
        legacyQuery = legacyQuery.eq('priority', normalized.priority);
      }
      if (normalized.assignedTo && normalized.assignedTo !== 'all') {
        if (normalized.assignedTo === 'unassigned') {
          legacyQuery = legacyQuery.is('assigned_to', null);
        } else {
          legacyQuery = legacyQuery.eq('assigned_to', normalized.assignedTo);
        }
      }
      if (search) {
        legacyQuery = legacyQuery.or(buildTicketSearchOrFilter(search, profileIds));
      }

      const legacyResult = await legacyQuery
        .order('created_at', { ascending: false })
        .range(normalized.from, normalized.to);
      data = legacyResult.data;
      error = legacyResult.error;
      count = legacyResult.count;
    }

    if (error) throw error;

    const rows = await enrichCompanyTickets(((data ?? []) as TicketRow[]).map(mapTicket), companyId);
    return {
      data: {
        rows,
        totalCount: count ?? rows.length,
        page: normalized.page,
        pageSize: normalized.pageSize,
      },
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load company tickets');
    loggingService.error('Failed to list company tickets page', { error: error.message, options }, 'TicketService');
    return { data: null, error };
  }
}

export interface TicketStatusCounts {
  all: number;
  open: number;
  in_progress: number;
  awaiting_requester: number;
  resolved: number;
  closed: number;
  cancelled: number;
}

/**
 * Returns the count of tickets for each status across the entire company
 * (not limited to the current page).  Optionally filters by priority and/or
 * search term so the displayed counts stay consistent with the active filters.
 */
export async function getCompanyTicketStatusCounts(
  companyId: string,
  options: Pick<CompanyTicketListOptions, 'priority' | 'search'> = {},
): Promise<TicketServiceResult<TicketStatusCounts>> {
  const search = sanitizeTicketSearchTerm(options.search ?? '');
  const statuses: TicketStatus[] = ['open', 'in_progress', 'awaiting_requester', 'resolved', 'closed', 'cancelled'];

  try {
    const profileIds = search ? await findMatchingProfileIds(companyId, search) : [];

    const perStatus = await Promise.all(
      statuses.map(async (status) => {
        let query = ticketsTable()
          .select('*', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', status);

        if (options.priority && options.priority !== 'all') {
          query = query.eq('priority', options.priority);
        }
        if (search) {
          query = query.or(buildTicketSearchOrFilter(search, profileIds));
        }

        const { count, error } = await query;
        if (error) throw error;
        return { status, count: count ?? 0 };
      }),
    );

    const result: TicketStatusCounts = {
      all: 0, open: 0, in_progress: 0, awaiting_requester: 0,
      resolved: 0, closed: 0, cancelled: 0,
    };
    for (const { status, count } of perStatus) {
      result[status] = count;
      result.all += count;
    }
    return { data: result, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to get ticket status counts');
    loggingService.error('Failed to get ticket status counts', { error: error.message }, 'TicketService');
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
    const approvalPlan = await getInternalRequestApprovalPlan(context.companyId, context.userId, {
      categoryKey: input.category ?? null,
      subcategoryKey: input.subcategory?.trim() ? input.subcategory.trim() : null,
      priority: input.priority ?? null,
    });
    if (approvalPlan.error) throw new Error(approvalPlan.error);

    // Evaluate auto-routing rules before insert
    const autoAssignTo = await evaluateRoutingRules(context.companyId, {
      category: input.category,
      subcategory: input.subcategory?.trim() ? input.subcategory.trim() : null,
      priority: input.priority,
      submitterRole: context.submitterRole ?? null,
    });

    const insertPayload = {
      subject: input.subject.trim(),
      category: input.category,
      subcategory: input.subcategory?.trim() ? input.subcategory.trim() : null,
      priority: input.priority,
      description: input.description,
      requested_due_date: input.requested_due_date?.trim() ? input.requested_due_date.trim() : null,
      business_impact: input.business_impact?.trim() ? input.business_impact.trim() : null,
      desired_outcome: input.desired_outcome?.trim() ? input.desired_outcome.trim() : null,
      custom_fields: toJsonObject(input.custom_fields),
      vso_number: input.vso_number?.trim() ? input.vso_number.trim() : null,
      company_id: context.companyId,
      submitted_by: context.userId,
      status: 'open',
      assigned_to: autoAssignTo,
      assigned_at: autoAssignTo ? new Date().toISOString() : null,
      resolution_note: null,
    };

    let { data, error } = await ticketsTable()
      .insert(insertPayload)
      .select('id')
      .single();

    if (error && isMissingOperationalTicketFieldError(error)) {
      const {
        requested_due_date: _requestedDueDate,
        business_impact: _businessImpact,
        desired_outcome: _desiredOutcome,
        custom_fields: _customFields,
        ...legacyPayload
      } = insertPayload;
      const legacyResult = await ticketsTable()
        .insert({
          ...legacyPayload,
          description: appendOperationalContextToDescription(input.description, input),
        })
        .select('id')
        .single();
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;

    const ticketId = (data as { id: string }).id;

    if (approvalPlan.data) {
      const approvalResult = await createInternalRequestApprovalInstance(
        context.companyId,
        ticketId,
        context.userId,
        approvalPlan.data,
      );
      if (approvalResult.error) {
        // Compensate: roll back the ticket insert so we don't leave an orphan
        // without an approval instance.  Best-effort — ignore any delete error.
        await ticketsTable()
          .delete()
          .eq('id', ticketId)
          .eq('company_id', context.companyId);
        throw new Error(approvalResult.error);
      }
    }

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
  const patch: TicketUpdate = {};

  if (input.status) patch.status = input.status;
  if (input.priority) patch.priority = input.priority;
  if (input.assigned_to !== undefined) patch.assigned_to = input.assigned_to;
  if (input.resolution_note !== undefined) {
    patch.resolution_note = input.resolution_note?.trim() ? input.resolution_note.trim() : null;
  }

  try {
    const { ticket: current, select: updateSelect } = await fetchTicketForUpdate(ticketId, context.companyId);

    if (
      input.mark_opened
      && current.submitted_by !== context.userId
      && current.status === 'open'
      && !current.assigned_to
      && !current.first_responded_at
    ) {
      const now = new Date().toISOString();
      patch.status = 'in_progress';
      patch.assigned_to = context.userId;
      patch.assigned_at = now;
      patch.first_responded_at = now;
    }

    if (Object.keys(patch).length === 0) {
      if (input.mark_opened) {
        return { data: current, error: null };
      }
      return { data: null, error: new Error('No request updates were provided') };
    }

    if (input.status && (input.status === 'resolved' || input.status === 'closed')) {
      const approvalGate = await getInternalRequestApprovalGate(ticketId);
      if (approvalGate.error) throw new Error(approvalGate.error);
      if (approvalGate.data?.status === 'pending') {
        throw new Error('This request is still waiting for approval before it can be resolved or closed.');
      }
      if (approvalGate.data?.status === 'rejected') {
        throw new Error('This request was rejected during approval and cannot be resolved or closed.');
      }
    }

    // Stamp assigned_at whenever the assignee changes
    if (input.assigned_to !== undefined) {
      patch.assigned_at = input.assigned_to ? new Date().toISOString() : null;
    }

    if (
      !current.first_responded_at
      && (
        (input.assigned_to !== undefined && input.assigned_to !== null && current.assigned_to === null)
        || (input.status !== undefined && current.status === 'open' && isFirstResponseTicketStatus(input.status))
      )
    ) {
      patch.first_responded_at = new Date().toISOString();
    }

    // Stamp resolved_at on first resolution; clear it if the ticket is re-opened
    if (input.status) {
      const isNowResolved = isResolvedTicketStatus(input.status);
      const wasResolved = isResolvedTicketStatus(current.status);
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
      .select(updateSelect)
      .single();

    if (error) throw error;

    const [nextTicket] = await applyApprovalMetadata([mapTicket(data as unknown as TicketRow)]);
    const activityEntries = buildTicketActivityEntries(current, nextTicket, context.userId);
    const notifications = buildTicketNotifications(current, nextTicket, context.userId);

    const sideEffects: Promise<unknown>[] = [];
    if (activityEntries.length > 0) {
      sideEffects.push(ticketActivityTable().insert(activityEntries).then(res => res));
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

export async function cancelMyTicket(
  ticketId: string,
  input: CancelTicketInput,
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<TicketRecord>> {
  const reason = input.reason?.trim() ? input.reason.trim() : null;

  try {
    const { ticket: current } = await fetchTicketForUpdate(ticketId, context.companyId);
    if (current.submitted_by !== context.userId) {
      return { data: null, error: new Error('Only the requester can cancel this request') };
    }
    if (current.status !== 'open' || current.assigned_to) {
      return { data: null, error: new Error('Request can only be cancelled while open and unassigned') };
    }

    const { data, error } = await supabase.rpc('cancel_own_ticket', {
      p_ticket_id: ticketId,
      p_cancellation_note: reason,
    });

    if (error) throw error;
    if (!data) throw new Error('Request cancellation did not return a ticket');

    const nextTicket = mapTicket(data as TicketRow);
    await Promise.allSettled([
      ticketActivityTable().insert({
        ticket_id: ticketId,
        company_id: context.companyId,
        actor_id: context.userId,
        event_type: 'status_changed',
        message: 'Request cancelled by requester.',
        metadata: { before: current.status, after: nextTicket.status, reason },
      }),
      // Cancel any pending approval instance to avoid orphaned workflow records.
      cancelInternalRequestApprovalInstance(ticketId, context.companyId),
    ]);

    void logUserAction(context.userId, 'update', 'ticket', ticketId, {
      component: 'TicketService',
      status: 'cancelled',
    });

    return { data: nextTicket, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to cancel request');
    loggingService.error('Failed to cancel request', { error: error.message, ticketId }, 'TicketService');
    return { data: null, error };
  }
}

export async function addTicketComment(
  ticketId: string,
  input: AddTicketCommentInput,
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<TicketActivityRecord>> {
  const message = input.message.trim();
  if (!message) {
    return { data: null, error: new Error('Comment cannot be empty') };
  }

  try {
    let { data: ticketData, error: ticketError } = await ticketsTable()
      .select(TICKET_SELECT)
      .eq('company_id', context.companyId)
      .eq('id', ticketId)
      .single();

    const useLegacyTicketSelect = Boolean(ticketError && isMissingOperationalTicketFieldError(ticketError));
    const fallbackSelect = ticketError ? getFallbackTicketSelect(ticketError) : TICKET_SELECT;
    if (useLegacyTicketSelect) {
      const legacyResult = await ticketsTable()
        .select(fallbackSelect)
        .eq('company_id', context.companyId)
        .eq('id', ticketId)
        .single();
      ticketData = legacyResult.data;
      ticketError = legacyResult.error;
    }

    if (ticketError) throw ticketError;
    const ticket = mapTicket(ticketData as TicketRow);

    const { data, error } = await ticketActivityTable()
      .insert({
        ticket_id: ticketId,
        company_id: context.companyId,
        actor_id: context.userId,
        event_type: 'comment_added',
        message,
        metadata: { comment: true },
      })
      .select('id, ticket_id, company_id, actor_id, event_type, message, metadata, created_at')
      .single();

    if (error) throw error;

    const notifications = buildCommentNotifications(ticket, context.userId, message);
    if (notifications.length > 0) {
      await Promise.allSettled([createNotifications(notifications)]);
    }

    void logUserAction(context.userId, 'create', 'ticket_comment', ticketId, {
      component: 'TicketService',
    });

    const row = data as TicketActivityRow;
    return {
      data: {
        id: row.id,
        ticket_id: row.ticket_id,
        actor_id: row.actor_id,
        actor_name: null,
        event_type: row.event_type,
        message: row.message,
        metadata: row.metadata,
        created_at: row.created_at,
      },
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to add request comment');
    loggingService.error('Failed to add request comment', { error: error.message, ticketId }, 'TicketService');
    return { data: null, error };
  }
}
