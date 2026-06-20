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

export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'pending_requester'
  | 'pending_owner_review'
  | 'completed_by_owner'
  | 'closed'
  | 'reopened'
  | 'cancelled';
export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketCategory = RequestCategoryValue;
export type TicketResponsibleParty = 'Owner' | 'Requester' | 'Backup Owner' | 'Manager' | 'Escalation Owner' | 'Admin' | 'None';
export type TicketSlaStatus = 'on_track' | 'at_risk' | 'breached' | 'paused';
export type TicketCompletionCategory = 'resolved' | 'rejected' | 'duplicate' | 'cancelled' | 'not_applicable';

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
  backup_owner_id: string | null;
  escalation_owner_id: string | null;
  responsible_queue: string;
  current_responsible_party: TicketResponsibleParty;
  next_action: string;
  status_changed_at: string;
  last_action_by: string | null;
  sla_status: TicketSlaStatus;
  sla_paused_at: string | null;
  sla_pause_duration_ms: number;
  sla_breach_reason: string | null;
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
  completion_category: TicketCompletionCategory | null;
  completion_checklist_confirmed: boolean;
  completion_attachment_required: boolean;
  closure_confirmed: boolean | null;
  satisfaction_rating: number | null;
  closure_feedback: string | null;
  closed_at: string | null;
  reopen_count: number;
  reopened_at: string | null;
  last_reopen_reason: string | null;
  previous_owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestTicketRecord extends TicketRecord {
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  backup_owner_name: string | null;
  escalation_owner_name: string | null;
  last_action_by_name: string | null;
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
  duplicate_of_ticket_id?: string | null;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigned_to?: string | null;
  backup_owner_id?: string | null;
  escalation_owner_id?: string | null;
  resolution_note?: string | null;
  mark_opened?: boolean;
  admin_override_reason?: string | null;
  sla_breach_reason?: string | null;
}

export interface AddTicketCommentInput {
  message: string;
  attachmentNames?: string[];
  emoji?: string | null;
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

/** 'active' = open/in progress/requester/owner review/owner-completed; 'archived' = closed/cancelled */
export type TicketStatusFilter = TicketStatus | 'all' | 'active' | 'archived';

const ACTIVE_STATUSES: TicketStatus[] = ['open', 'in_progress', 'pending_requester', 'pending_owner_review', 'completed_by_owner', 'reopened'];
const ARCHIVED_STATUSES: TicketStatus[] = ['closed', 'cancelled'];

/**
 * SLA filter values that can be applied server-side before pagination.
 * Mirrors the TicketSlaState values exposed by RequestQueueFilters,
 * excluding 'met' and 'pending' which are not useful as filter targets.
 *   not_configured – tickets where neither SLA target has been set
 *   at_risk        – unresolved tickets within 4 hours of an SLA deadline
 *   breached       – unresolved tickets past an SLA deadline
 */
export type TicketSlaFilter = 'all' | 'not_configured' | 'at_risk' | 'breached';

/** AT_RISK_WINDOW matches the client-side constant in src/lib/ticketSla.ts */
const AT_RISK_WINDOW_MS = 4 * 60 * 60 * 1000;

export interface CompanyTicketListOptions {
  page?: number;
  pageSize?: number;
  status?: TicketStatusFilter;
  priority?: TicketPriority | 'all';
  search?: string;
  /** Server-side SLA filter. When set to anything other than 'all', the filter
   *  is pushed to the database so pagination totals are accurate. */
  sla?: TicketSlaFilter;
  /** Filter by assignee. 'unassigned' returns only tickets with null assigned_to. */
  assignedTo?: string | 'unassigned';
  category?: string;
  subcategory?: string;
  responsibleParty?: TicketResponsibleParty;
  submittedFrom?: string;
  submittedTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  reopenedOnly?: boolean;
}

export type TicketActivityEventType =
  | 'status_changed'
  | 'owner_changed'
  | 'resolution_note_updated'
  | 'priority_changed'
  | 'comment_added'
  | 'request_created'
  | 'category_changed'
  | 'subcategory_changed'
  | 'sla_paused'
  | 'sla_resumed'
  | 'sla_breached'
  | 'requester_update_submitted'
  | 'owner_requested_more_information'
  | 'owner_completed_request'
  | 'requester_closed_request'
  | 'attachment_added'
  | 'escalation_triggered'
  | 'admin_manual_override'
  | 'internal_note_added'
  | 'duplicate_linked'
  | 'request_reopened'
  | 'closure_feedback_submitted';

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

export interface TicketChatSummary {
  ticket_id: string;
  message_count: number;
  unread_count: number;
  latest_message_at: string | null;
}

export interface TicketInternalNoteRecord {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string | null;
  note: string;
  mentions: string[];
  created_at: string;
  updated_at: string;
}

export interface TicketAuditEntryRecord {
  id: string;
  user_id: string;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  table_name: string | null;
  changes: Record<string, unknown> | null;
  created_at: string | null;
}

export interface TicketWorkspacePermissions {
  canManageWorkflow: boolean;
  canCloseAsRequester: boolean;
  canViewInternalNotes: boolean;
  canViewAuditTrail: boolean;
  canReviewApproval: boolean;
}

export interface TicketWorkspaceData {
  ticket: CompanyTicketRecord;
  activities: TicketActivityRecord[];
  chatSummary: TicketChatSummary;
  internalNotes: TicketInternalNoteRecord[];
  auditEntries: TicketAuditEntryRecord[];
  permissions: TicketWorkspacePermissions;
}

export interface DuplicateTicketCandidate {
  id: string;
  subject: string;
  category: TicketCategory;
  subcategory: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  assigned_to_name: string | null;
  score: number;
}

type TicketRow = TicketRecord;
type TicketUpdate = Database['public']['Tables']['tickets']['Update'] & Record<string, unknown>;
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

interface TicketAuditRow {
  id: string;
  user_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  table_name: string | null;
  changes: Record<string, unknown> | null;
  created_at: string | null;
}

const TICKET_SELECT =
  'id, subject, category, subcategory, priority, status, description, requested_due_date, business_impact, desired_outcome, custom_fields, vso_number, created_at, updated_at, company_id, submitted_by, assigned_to, backup_owner_id, escalation_owner_id, responsible_queue, current_responsible_party, next_action, status_changed_at, last_action_by, sla_status, sla_paused_at, sla_pause_duration_ms, sla_breach_reason, assigned_at, first_response_due_at, resolution_due_at, first_responded_at, resolved_at, resolution_note, completion_category, completion_checklist_confirmed, completion_attachment_required, closure_confirmed, satisfaction_rating, closure_feedback, closed_at, reopen_count, reopened_at, last_reopen_reason, previous_owner_id';

const TICKET_STATUSES = new Set<TicketStatus>([
  'open',
  'in_progress',
  'pending_requester',
  'pending_owner_review',
  'completed_by_owner',
  'closed',
  'reopened',
  'cancelled',
]);

function normalizeStatus(status: unknown): TicketStatus {
  if (status === 'awaiting_requester') return 'pending_requester';
  if (status === 'resolved') return 'completed_by_owner';
  return typeof status === 'string' && TICKET_STATUSES.has(status as TicketStatus)
    ? status as TicketStatus
    : 'open';
}

function normalizePriority(priority: unknown): TicketPriority {
  return priority === 'low' || priority === 'high' ? priority : 'medium';
}

function normalizeSlaStatus(status: unknown): TicketSlaStatus {
  return status === 'at_risk' || status === 'breached' || status === 'paused'
    ? status
    : 'on_track';
}

function normalizeTimestamp(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  return Number.isNaN(new Date(value).getTime()) ? fallback : value;
}

export function getTicketNextAction(status: TicketStatus): { responsibleParty: TicketResponsibleParty; nextAction: string } {
  switch (status) {
    case 'open':
      return { responsibleParty: 'Owner', nextAction: 'Owner to review request' };
    case 'in_progress':
      return { responsibleParty: 'Owner', nextAction: 'Owner to resolve request' };
    case 'pending_requester':
      return { responsibleParty: 'Requester', nextAction: 'Requester to provide information' };
    case 'pending_owner_review':
      return { responsibleParty: 'Owner', nextAction: 'Owner to review requester response' };
    case 'completed_by_owner':
      return { responsibleParty: 'Requester', nextAction: 'Requester to confirm and close' };
    case 'reopened':
      return { responsibleParty: 'Owner', nextAction: 'Owner to review reopened request' };
    case 'closed':
    case 'cancelled':
      return { responsibleParty: 'None', nextAction: 'No further action' };
  }
}

function mapTicket(row: TicketRow): TicketRecord {
  const now = new Date().toISOString();
  const status = normalizeStatus(row.status);
  const workflow = getTicketNextAction(status);
  const createdAt = normalizeTimestamp(row.created_at, now);
  const updatedAt = normalizeTimestamp(row.updated_at, createdAt);

  return {
    id: row.id ?? '',
    company_id: row.company_id ?? '',
    subject: row.subject?.trim() || 'Untitled request',
    category: (row.category || 'uncategorized') as TicketCategory,
    subcategory: row.subcategory || null,
    priority: normalizePriority(row.priority),
    status,
    description: row.description ?? '',
    requested_due_date: row.requested_due_date ?? null,
    business_impact: row.business_impact ?? null,
    desired_outcome: row.desired_outcome ?? null,
    custom_fields: row.custom_fields && typeof row.custom_fields === 'object' && !Array.isArray(row.custom_fields)
      ? row.custom_fields
      : {},
    vso_number: row.vso_number ?? null,
    submitted_by: row.submitted_by ?? '',
    assigned_to: row.assigned_to ?? null,
    backup_owner_id: row.backup_owner_id ?? null,
    escalation_owner_id: row.escalation_owner_id ?? null,
    responsible_queue: row.responsible_queue ?? 'Unassigned',
    current_responsible_party: (row.current_responsible_party ?? workflow.responsibleParty) as TicketResponsibleParty,
    next_action: row.next_action || workflow.nextAction,
    status_changed_at: normalizeTimestamp(row.status_changed_at, updatedAt),
    last_action_by: row.last_action_by ?? null,
    sla_status: normalizeSlaStatus(row.sla_status),
    sla_paused_at: row.sla_paused_at ?? null,
    sla_pause_duration_ms: Number(row.sla_pause_duration_ms ?? 0),
    sla_breach_reason: row.sla_breach_reason ?? null,
    assigned_at: row.assigned_at ?? null,
    first_response_due_at: row.first_response_due_at ?? null,
    resolution_due_at: row.resolution_due_at ?? null,
    first_responded_at: row.first_responded_at ?? null,
    approval_instance_id: row.approval_instance_id ?? null,
    approval_status: row.approval_status ?? null,
    current_approval_step_name: row.current_approval_step_name ?? null,
    current_approver_role: row.current_approver_role ?? null,
    current_approver_user_id: row.current_approver_user_id ?? null,
    resolved_at: row.resolved_at ?? null,
    resolution_note: row.resolution_note ?? null,
    completion_category: row.completion_category ?? null,
    completion_checklist_confirmed: Boolean(row.completion_checklist_confirmed ?? false),
    completion_attachment_required: Boolean(row.completion_attachment_required ?? false),
    closure_confirmed: row.closure_confirmed ?? null,
    satisfaction_rating: row.satisfaction_rating ?? null,
    closure_feedback: row.closure_feedback ?? null,
    closed_at: row.closed_at ?? null,
    reopen_count: Number(row.reopen_count ?? 0),
    reopened_at: row.reopened_at ?? null,
    last_reopen_reason: row.last_reopen_reason ?? null,
    previous_owner_id: row.previous_owner_id ?? null,
    created_at: createdAt,
    updated_at: updatedAt,
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
    backup_owner_name: ticket.backup_owner_id ? profilesById.get(ticket.backup_owner_id)?.name ?? null : null,
    escalation_owner_name: ticket.escalation_owner_id ? profilesById.get(ticket.escalation_owner_id)?.name ?? null : null,
    last_action_by_name: ticket.last_action_by ? profilesById.get(ticket.last_action_by)?.name ?? null : null,
  };
}

function ticketsTable() {
  return supabase.from('tickets');
}

function ticketActivityTable() {
  return supabase.from('ticket_activity');
}

function table(name: string) {
  return (supabase as never as { from: (tableName: string) => ReturnType<typeof supabase.from> }).from(name);
}

function toJsonObject(value: Record<string, unknown> | null | undefined): Json {
  return (value ?? {}) as Json;
}

function formatTicketLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function isResolvedTicketStatus(status: TicketStatus) {
  return status === 'closed' || status === 'cancelled';
}

function isFirstResponseTicketStatus(status: TicketStatus) {
  return status === 'in_progress' || status === 'pending_requester' || status === 'pending_owner_review' || status === 'completed_by_owner' || status === 'closed';
}

function isSlaBreached(ticket: Pick<TicketRecord, 'first_response_due_at' | 'first_responded_at' | 'resolution_due_at' | 'resolved_at' | 'status'>) {
  const now = Date.now();
  const responseBreached = Boolean(
    ticket.first_response_due_at
    && !ticket.first_responded_at
    && new Date(ticket.first_response_due_at).getTime() < now,
  );
  const resolutionBreached = Boolean(
    ticket.resolution_due_at
    && !ticket.resolved_at
    && ticket.status !== 'closed'
    && ticket.status !== 'cancelled'
    && new Date(ticket.resolution_due_at).getTime() < now,
  );
  return responseBreached || resolutionBreached || ticket.status === 'closed' && false;
}

function withWorkflowPatch(status: TicketStatus, extra: TicketUpdate = {}): TicketUpdate {
  const workflow = getTicketNextAction(status);
  return {
    ...extra,
    status,
    current_responsible_party: workflow.responsibleParty,
    next_action: workflow.nextAction,
    status_changed_at: new Date().toISOString(),
  } as TicketUpdate;
}

async function fetchTicketForUpdate(ticketId: string, companyId: string) {
  const { data, error } = await ticketsTable()
    .select(TICKET_SELECT)
    .eq('company_id', companyId)
    .eq('id', ticketId)
    .single();
  if (error) throw error;
  return mapTicket(data as TicketRow);
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

  if (before.backup_owner_id !== after.backup_owner_id) {
    entries.push({
      ticket_id: after.id,
      company_id: after.company_id,
      actor_id: actorId,
      event_type: 'owner_changed',
      message: after.backup_owner_id ? 'Backup owner assigned.' : 'Backup owner cleared.',
      metadata: { field: 'backup_owner_id', before: before.backup_owner_id, after: after.backup_owner_id },
    });
  }

  if (before.escalation_owner_id !== after.escalation_owner_id) {
    entries.push({
      ticket_id: after.id,
      company_id: after.company_id,
      actor_id: actorId,
      event_type: 'owner_changed',
      message: after.escalation_owner_id ? 'Escalation owner assigned.' : 'Escalation owner cleared.',
      metadata: { field: 'escalation_owner_id', before: before.escalation_owner_id, after: after.escalation_owner_id },
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
      if (ticket.backup_owner_id) people.push(ticket.backup_owner_id);
      if (ticket.escalation_owner_id) people.push(ticket.escalation_owner_id);
      if (ticket.last_action_by) people.push(ticket.last_action_by);
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
    `desired_outcome.ilike.%${search}%`,
    `business_impact.ilike.%${search}%`,
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
    const { data, error } = await ticketsTable()
      .select(TICKET_SELECT)
      .eq('submitted_by', userId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = await applyApprovalMetadata(((data ?? []) as TicketRow[]).map(mapTicket));
    const profilesById = await fetchProfilesById(
      companyId,
      rows.flatMap((ticket) => [
        ticket.assigned_to,
        ticket.backup_owner_id,
        ticket.escalation_owner_id,
        ticket.last_action_by,
      ]).filter((ticketId): ticketId is string => Boolean(ticketId)),
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
      .select(TICKET_SELECT)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

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
    if (normalized.sla && normalized.sla !== 'all') {
      const now = new Date().toISOString();
      if (normalized.sla === 'not_configured') {
        // Tickets where neither SLA target has been configured
        query = query.is('first_response_due_at', null).is('resolution_due_at', null);
      } else if (normalized.sla === 'breached') {
        // Unresolved tickets past at least one SLA deadline
        query = query.or(
          `and(first_response_due_at.lt.${now},first_responded_at.is.null),` +
          `and(resolution_due_at.lt.${now},resolved_at.is.null)`,
        );
      } else if (normalized.sla === 'at_risk') {
        // Unresolved tickets approaching an SLA deadline within the 4-hour window
        const atRiskThreshold = new Date(Date.now() + AT_RISK_WINDOW_MS).toISOString();
        query = query.or(
          `and(first_response_due_at.gte.${now},first_response_due_at.lte.${atRiskThreshold},first_responded_at.is.null),` +
          `and(resolution_due_at.gte.${now},resolution_due_at.lte.${atRiskThreshold},resolved_at.is.null)`,
        );
      }
    }
    if (normalized.assignedTo && normalized.assignedTo !== 'all') {
      if (normalized.assignedTo === 'unassigned') {
        query = query.is('assigned_to', null);
      } else {
        query = query.eq('assigned_to', normalized.assignedTo);
      }
    }
    if (normalized.category && normalized.category !== 'all') {
      query = query.eq('category', normalized.category);
    }
    if (normalized.subcategory && normalized.subcategory !== 'all') {
      query = query.eq('subcategory', normalized.subcategory);
    }
    if (normalized.responsibleParty && normalized.responsibleParty !== 'None') {
      query = query.eq('current_responsible_party', normalized.responsibleParty);
    }
    if (normalized.submittedFrom) {
      query = query.gte('created_at', `${normalized.submittedFrom}T00:00:00`);
    }
    if (normalized.submittedTo) {
      query = query.lte('created_at', `${normalized.submittedTo}T23:59:59`);
    }
    if (normalized.updatedFrom) {
      query = query.gte('updated_at', `${normalized.updatedFrom}T00:00:00`);
    }
    if (normalized.updatedTo) {
      query = query.lte('updated_at', `${normalized.updatedTo}T23:59:59`);
    }
    if (normalized.reopenedOnly) {
      query = query.or('status.eq.reopened,reopen_count.gt.0');
    }
    if (search) {
      query = query.or(buildTicketSearchOrFilter(search, profileIds));
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(normalized.from, normalized.to);

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

async function getCompanyTicketById(ticketId: string, companyId: string): Promise<CompanyTicketRecord | null> {
  const { data, error } = await ticketsTable()
    .select(TICKET_SELECT)
    .eq('company_id', companyId)
    .eq('id', ticketId)
    .single();
  if (error) throw error;
  const [ticket] = await enrichCompanyTickets([mapTicket(data as unknown as TicketRow)], companyId);
  return ticket ?? null;
}

function canReviewTicketApproval(
  ticket: CompanyTicketRecord,
  user: { id: string; role?: string | null },
) {
  if (ticket.approval_status !== 'pending') return false;
  if (ticket.current_approver_user_id) return ticket.current_approver_user_id === user.id;
  if (ticket.current_approver_role) return user.role === 'super_admin' || user.role === 'company_admin';
  return false;
}

export async function getTicketWorkspaceData(
  ticketId: string,
  context: { userId: string; companyId: string; userRole?: string | null; canManagePortalQueue?: boolean },
): Promise<TicketServiceResult<TicketWorkspaceData>> {
  try {
    const ticket = await getCompanyTicketById(ticketId, context.companyId);
    if (!ticket) return { data: null, error: new Error('Request not found.') };

    const canManagePortalQueue = Boolean(context.canManagePortalQueue);
    const isRequester = ticket.submitted_by === context.userId;
    if (!isRequester && !canManagePortalQueue) {
      return { data: null, error: new Error('You do not have access to this request.') };
    }

    const permissions: TicketWorkspacePermissions = {
      canManageWorkflow: canManagePortalQueue && !isRequester,
      canCloseAsRequester: isRequester,
      canViewInternalNotes: canManagePortalQueue,
      canViewAuditTrail: canManagePortalQueue,
      canReviewApproval: canReviewTicketApproval(ticket, { id: context.userId, role: context.userRole }),
    };

    const [{ data: activitiesByTicket }, { data: chatSummariesByTicket }, internalNoteResult, auditResult] = await Promise.all([
      listTicketActivity([ticket.id], context.companyId),
      listTicketChatSummaries([ticket.id], context.userId, context.companyId),
      permissions.canViewInternalNotes
        ? listTicketInternalNotes([ticket.id], context.companyId)
        : Promise.resolve({ data: { [ticket.id]: [] as TicketInternalNoteRecord[] }, error: null }),
      permissions.canViewAuditTrail
        ? listTicketAuditEntries(ticket.id, context.companyId)
        : Promise.resolve({ data: [] as TicketAuditEntryRecord[], error: null }),
    ]);

    if (internalNoteResult.error) throw internalNoteResult.error;
    if (auditResult.error) throw auditResult.error;

    const fallbackChatSummary: TicketChatSummary = {
      ticket_id: ticket.id,
      message_count: 0,
      unread_count: 0,
      latest_message_at: null,
    };

    return {
      data: {
        ticket,
        activities: activitiesByTicket?.[ticket.id] ?? [],
        chatSummary: chatSummariesByTicket?.[ticket.id] ?? fallbackChatSummary,
        internalNotes: internalNoteResult.data?.[ticket.id] ?? [],
        auditEntries: auditResult.data ?? [],
        permissions,
      },
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load request workspace');
    loggingService.error('Failed to load request workspace', { error: error.message, ticketId }, 'TicketService');
    return { data: null, error };
  }
}

export interface TicketStatusCounts {
  all: number;
  open: number;
  in_progress: number;
  pending_requester: number;
  pending_owner_review: number;
  completed_by_owner: number;
  closed: number;
  reopened: number;
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
  const statuses: TicketStatus[] = ['open', 'in_progress', 'pending_requester', 'pending_owner_review', 'completed_by_owner', 'closed', 'reopened', 'cancelled'];

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
      all: 0, open: 0, in_progress: 0, pending_requester: 0, pending_owner_review: 0,
      completed_by_owner: 0, closed: 0, reopened: 0, cancelled: 0,
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

export async function listTicketChatSummaries(
  ticketIds: string[],
  userId: string,
  companyId: string,
): Promise<TicketServiceResult<Record<string, TicketChatSummary>>> {
  const empty = Object.fromEntries(ticketIds.map((ticketId) => [
    ticketId,
    { ticket_id: ticketId, message_count: 0, unread_count: 0, latest_message_at: null } satisfies TicketChatSummary,
  ]));
  if (ticketIds.length === 0) return { data: empty, error: null };

  try {
    const [{ data: messages, error: messagesError }, { data: reads, error: readsError }] = await Promise.all([
      ticketActivityTable()
        .select('ticket_id, actor_id, created_at')
        .eq('company_id', companyId)
        .eq('event_type', 'comment_added')
        .in('ticket_id', ticketIds),
      table('ticket_chat_reads')
        .select('ticket_id, read_at')
        .eq('company_id', companyId)
        .eq('user_id', userId)
        .in('ticket_id', ticketIds),
    ]);

    if (messagesError) throw messagesError;
    if (readsError) throw readsError;

    const readByTicket = new Map(
      ((reads ?? []) as Array<{ ticket_id: string; read_at: string | null }>)
        .map((row) => [row.ticket_id, row.read_at ? new Date(row.read_at).getTime() : 0]),
    );
    const summaries: Record<string, TicketChatSummary> = { ...empty };

    for (const row of (messages ?? []) as Array<{ ticket_id: string; actor_id: string; created_at: string | null }>) {
      const summary = summaries[row.ticket_id];
      if (!summary) continue;
      const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
      summary.message_count += 1;
      if (!summary.latest_message_at || (row.created_at && createdAt > new Date(summary.latest_message_at).getTime())) {
        summary.latest_message_at = row.created_at;
      }
      if (row.actor_id !== userId && createdAt > (readByTicket.get(row.ticket_id) ?? 0)) {
        summary.unread_count += 1;
      }
    }

    return { data: summaries, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load chat summaries');
    loggingService.error('Failed to load chat summaries', { error: error.message }, 'TicketService');
    return { data: null, error };
  }
}

export async function markTicketChatRead(
  ticketId: string,
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<true>> {
  try {
    const { error } = await table('ticket_chat_reads').upsert({
      ticket_id: ticketId,
      company_id: context.companyId,
      user_id: context.userId,
      read_at: new Date().toISOString(),
    }, { onConflict: 'ticket_id,user_id' });
    if (error) throw error;
    return { data: true, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to mark chat read');
    loggingService.error('Failed to mark chat read', { error: error.message, ticketId }, 'TicketService');
    return { data: null, error };
  }
}

export async function listTicketInternalNotes(
  ticketIds: string[],
  companyId: string,
): Promise<TicketServiceResult<Record<string, TicketInternalNoteRecord[]>>> {
  const grouped = Object.fromEntries(ticketIds.map((ticketId) => [ticketId, [] as TicketInternalNoteRecord[]]));
  if (ticketIds.length === 0) return { data: grouped, error: null };

  try {
    const { data, error } = await table('ticket_internal_notes')
      .select('id, ticket_id, author_id, note, mentions, created_at, updated_at')
      .eq('company_id', companyId)
      .in('ticket_id', ticketIds)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = (data ?? []) as Array<{
      id: string;
      ticket_id: string;
      author_id: string;
      note: string;
      mentions: unknown;
      created_at: string;
      updated_at: string;
    }>;
    const profilesById = await fetchProfilesById(companyId, rows.map((row) => row.author_id));

    rows.forEach((row) => {
      grouped[row.ticket_id]?.push({
        id: row.id,
        ticket_id: row.ticket_id,
        author_id: row.author_id,
        author_name: profilesById.get(row.author_id)?.name ?? null,
        note: row.note,
        mentions: Array.isArray(row.mentions) ? row.mentions.map(String) : [],
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    });

    return { data: grouped, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load internal notes');
    loggingService.error('Failed to load internal notes', { error: error.message }, 'TicketService');
    return { data: null, error };
  }
}

export async function listTicketAuditEntries(
  ticketId: string,
  companyId: string,
): Promise<TicketServiceResult<TicketAuditEntryRecord[]>> {
  try {
    const { data, error } = await table('audit_logs')
      .select('id, user_id, action, entity_type, entity_id, table_name, changes, created_at')
      .eq('entity_id', ticketId)
      .or('entity_type.eq.ticket,entity_type.eq.internal_request,table_name.eq.tickets,table_name.eq.user_actions')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const rows = (data ?? []) as TicketAuditRow[];
    const profilesById = await fetchProfilesById(companyId, rows.map((row) => row.user_id));
    return {
      data: rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        actor_name: profilesById.get(row.user_id)?.name ?? null,
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        table_name: row.table_name,
        changes: row.changes,
        created_at: row.created_at,
      })),
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load request audit trail');
    loggingService.error('Failed to load request audit trail', { error: error.message, ticketId }, 'TicketService');
    return { data: null, error };
  }
}

function tokenizeTicketText(value: string | null | undefined) {
  return new Set((value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3));
}

function tokenOverlapScore(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  left.forEach((token) => {
    if (right.has(token)) overlap += 1;
  });
  return overlap / Math.max(left.size, right.size);
}

export async function findDuplicateTickets(
  input: CreateTicketInput,
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<DuplicateTicketCandidate[]>> {
  try {
    const recentClosedCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await ticketsTable()
      .select(TICKET_SELECT)
      .eq('company_id', context.companyId)
      .eq('submitted_by', context.userId)
      .or(`status.in.(${ACTIVE_STATUSES.join(',')}),and(status.eq.closed,closed_at.gte.${recentClosedCutoff})`)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const incomingTitleTokens = tokenizeTicketText(input.subject);
    const incomingDescriptionTokens = tokenizeTicketText(input.description);
    const candidates = await enrichCompanyTickets(((data ?? []) as TicketRow[]).map(mapTicket), context.companyId);

    const scored = candidates.map((ticket) => {
      let score = 0;
      if (ticket.category === input.category) score += 25;
      if (input.subcategory && ticket.subcategory === input.subcategory) score += 25;
      if (ticket.subject.trim().toLowerCase() === input.subject.trim().toLowerCase()) score += 35;
      score += tokenOverlapScore(incomingTitleTokens, tokenizeTicketText(ticket.subject)) * 25;
      score += tokenOverlapScore(incomingDescriptionTokens, tokenizeTicketText(ticket.description)) * 15;
      return {
        id: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        subcategory: ticket.subcategory,
        status: ticket.status,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        assigned_to_name: ticket.assigned_to_name,
        score: Math.round(score),
      } satisfies DuplicateTicketCandidate;
    })
      .filter((candidate) => candidate.score >= 35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return { data: scored, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to check for duplicate requests');
    loggingService.error('Failed to check for duplicate tickets', { error: error.message }, 'TicketService');
    return { data: null, error };
  }
}

export async function addTicketInternalNote(
  ticketId: string,
  input: { note: string; mentions?: string[] },
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<TicketInternalNoteRecord>> {
  const note = input.note.trim();
  if (!note) return { data: null, error: new Error('Internal note cannot be empty.') };

  try {
    const mentions = input.mentions ?? Array.from(note.matchAll(/@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z][A-Za-z\s.'-]{1,80})/g)).map((match) => match[1].trim());
    const { data, error } = await table('ticket_internal_notes')
      .insert({
        ticket_id: ticketId,
        company_id: context.companyId,
        author_id: context.userId,
        note,
        mentions,
      })
      .select('id, ticket_id, author_id, note, mentions, created_at, updated_at')
      .single();
    if (error) throw error;

    await ticketActivityTable().insert({
      ticket_id: ticketId,
      company_id: context.companyId,
      actor_id: context.userId,
      event_type: 'internal_note_added',
      message: 'Internal note added.',
      metadata: { mentions },
    });

    const row = data as unknown as {
      id: string;
      ticket_id: string;
      author_id: string;
      note: string;
      mentions: unknown;
      created_at: string;
      updated_at: string;
    };
    const profilesById = await fetchProfilesById(context.companyId, [row.author_id]);
    return {
      data: {
        id: row.id,
        ticket_id: row.ticket_id,
        author_id: row.author_id,
        author_name: profilesById.get(row.author_id)?.name ?? null,
        note: row.note,
        mentions: Array.isArray(row.mentions) ? row.mentions.map(String) : [],
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to add internal note');
    loggingService.error('Failed to add internal note', { error: error.message, ticketId }, 'TicketService');
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
      responsible_queue: autoAssignTo ? 'Owner' : 'Unassigned',
      current_responsible_party: 'Owner',
      next_action: 'Owner to review request',
      status_changed_at: new Date().toISOString(),
      last_action_by: context.userId,
      sla_status: 'on_track',
      resolution_note: null,
    };

    const { data, error } = await ticketsTable()
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) throw error;

    const ticketId = (data as { id: string }).id;

    void Promise.resolve().then(() => ticketActivityTable().insert({
      ticket_id: ticketId,
      company_id: context.companyId,
      actor_id: context.userId,
      event_type: 'request_created',
      message: autoAssignTo ? 'Request created and owner assigned automatically.' : 'Request created and routed to Unassigned.',
      metadata: { assigned_to: autoAssignTo, queue: autoAssignTo ? 'Owner' : 'Unassigned' },
    })).catch(() => undefined);

    if (input.duplicate_of_ticket_id) {
      void Promise.allSettled([
        table('ticket_duplicate_links').insert({
          company_id: context.companyId,
          ticket_id: ticketId,
          duplicate_of_ticket_id: input.duplicate_of_ticket_id,
          linked_by: context.userId,
        }),
        ticketActivityTable().insert({
          ticket_id: ticketId,
          company_id: context.companyId,
          actor_id: context.userId,
          event_type: 'duplicate_linked',
          message: 'Request linked to a possible duplicate.',
          metadata: { duplicate_of_ticket_id: input.duplicate_of_ticket_id },
        }),
      ]);
    }

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

  if (input.status) {
    if (!input.admin_override_reason?.trim()) {
      return { data: null, error: new Error('Manual status changes require an admin override reason.') };
    }
    Object.assign(patch, withWorkflowPatch(input.status, {
      last_action_by: context.userId,
    }));
  }
  if (input.priority) patch.priority = input.priority;
  if (input.assigned_to !== undefined) patch.assigned_to = input.assigned_to;
  if (input.backup_owner_id !== undefined) patch.backup_owner_id = input.backup_owner_id;
  if (input.escalation_owner_id !== undefined) patch.escalation_owner_id = input.escalation_owner_id;
  if (input.sla_breach_reason !== undefined) patch.sla_breach_reason = input.sla_breach_reason?.trim() ? input.sla_breach_reason.trim() : null;
  if (input.resolution_note !== undefined) {
    patch.resolution_note = input.resolution_note?.trim() ? input.resolution_note.trim() : null;
  }
  if (Object.keys(patch).length > 0) patch.last_action_by = context.userId;

  try {
    const current = await fetchTicketForUpdate(ticketId, context.companyId);

    if (
      input.mark_opened
      && current.submitted_by !== context.userId
      && current.status === 'open'
    ) {
      const now = new Date().toISOString();
      Object.assign(patch, withWorkflowPatch('in_progress', {
        assigned_to: current.assigned_to ?? context.userId,
        assigned_at: current.assigned_at ?? now,
        first_responded_at: current.first_responded_at ?? now,
        last_action_by: context.userId,
      }));
    }

    if (Object.keys(patch).length === 0) {
      if (input.mark_opened) {
        return { data: current, error: null };
      }
      return { data: null, error: new Error('No request updates were provided') };
    }

    if (input.status && (input.status === 'completed_by_owner' || input.status === 'closed')) {
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
      .select(TICKET_SELECT)
      .single();

    if (error) throw error;

    const [nextTicket] = await applyApprovalMetadata([mapTicket(data as unknown as TicketRow)]);
    const activityEntries = buildTicketActivityEntries(current, nextTicket, context.userId);
    if (input.status && input.admin_override_reason?.trim()) {
      activityEntries.push({
        ticket_id: nextTicket.id,
        company_id: nextTicket.company_id,
        actor_id: context.userId,
        event_type: 'admin_manual_override',
        message: `Admin manually changed status to ${formatTicketLabel(nextTicket.status)}.`,
        metadata: { before: current.status, after: nextTicket.status, reason: input.admin_override_reason.trim() },
      });
    }
    const notifications = buildTicketNotifications(current, nextTicket, context.userId);

    const sideEffects: Promise<unknown>[] = [];
    if (activityEntries.length > 0) {
      sideEffects.push(Promise.resolve(ticketActivityTable().insert(activityEntries).then(res => res)));
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

async function applyTicketWorkflowAction(
  ticketId: string,
  status: TicketStatus,
  context: { userId: string; companyId: string },
  options: {
    eventType: TicketActivityEventType;
    message: string;
    resolutionNote?: string | null;
    slaBreachReason?: string | null;
    metadata?: Record<string, unknown>;
    patch?: TicketUpdate;
  },
): Promise<TicketServiceResult<TicketRecord>> {
  try {
    const current = await fetchTicketForUpdate(ticketId, context.companyId);

    if ((status === 'completed_by_owner' || status === 'closed') && isSlaBreached(current) && !options.slaBreachReason?.trim() && !current.sla_breach_reason) {
      return { data: null, error: new Error('A breach reason is required before this SLA-breached request can be completed or closed.') };
    }

    const now = new Date().toISOString();
    const patch = withWorkflowPatch(status, {
      last_action_by: context.userId,
      resolution_note: options.resolutionNote?.trim() ? options.resolutionNote.trim() : current.resolution_note,
      sla_breach_reason: options.slaBreachReason?.trim() ? options.slaBreachReason.trim() : current.sla_breach_reason,
      ...(options.patch ?? {}),
    });

    if (!current.first_responded_at && status !== 'open') {
      patch.first_responded_at = now;
    }
    if (status === 'closed') {
      patch.resolved_at = now;
    }

    const { data, error } = await ticketsTable()
      .update(patch)
      .eq('company_id', context.companyId)
      .eq('id', ticketId)
      .select(TICKET_SELECT)
      .single();

    if (error) throw error;

    const [nextTicket] = await applyApprovalMetadata([mapTicket(data as unknown as TicketRow)]);
    const activityEntries = buildTicketActivityEntries(current, nextTicket, context.userId);
    activityEntries.push({
      ticket_id: nextTicket.id,
      company_id: nextTicket.company_id,
      actor_id: context.userId,
      event_type: options.eventType,
      message: options.message,
      metadata: {
        before: current.status,
        after: nextTicket.status,
        ...options.metadata,
      },
    });

    const notifications = buildTicketNotifications(current, nextTicket, context.userId);
    const sideEffects: Promise<unknown>[] = [
      Promise.resolve(ticketActivityTable().insert(activityEntries).then(res => res)),
    ];
    if (notifications.length > 0) sideEffects.push(createNotifications(notifications));
    await Promise.allSettled(sideEffects);

    void logUserAction(context.userId, 'update', 'ticket', ticketId, {
      component: 'TicketService',
      workflow_action: options.eventType,
      status,
    });

    return { data: nextTicket, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to update request workflow');
    loggingService.error('Failed to update request workflow', { error: error.message, ticketId, status }, 'TicketService');
    return { data: null, error };
  }
}

export async function requestTicketMoreInformation(
  ticketId: string,
  input: AddTicketCommentInput,
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<TicketRecord>> {
  const comment = await addTicketComment(ticketId, input, context);
  if (comment.error) return { data: null, error: comment.error };
  return applyTicketWorkflowAction(ticketId, 'pending_requester', context, {
    eventType: 'owner_requested_more_information',
    message: 'Owner requested more information from the requester.',
  });
}

export async function submitRequesterTicketUpdate(
  ticketId: string,
  input: AddTicketCommentInput,
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<TicketRecord>> {
  const comment = await addTicketComment(ticketId, input, context);
  if (comment.error) return { data: null, error: comment.error };
  return applyTicketWorkflowAction(ticketId, 'pending_owner_review', context, {
    eventType: 'requester_update_submitted',
    message: 'Requester submitted an update for owner review.',
  });
}

export async function markTicketCompletedByOwner(
  ticketId: string,
  input: {
    resolutionNote: string;
    completionCategory: TicketCompletionCategory;
    checklistConfirmed: boolean;
    slaBreachReason?: string | null;
  },
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<TicketRecord>> {
  if (!input.resolutionNote.trim()) {
    return { data: null, error: new Error('Resolution summary is required.') };
  }
  if (!input.completionCategory) {
    return { data: null, error: new Error('Completion category is required.') };
  }
  if (!input.checklistConfirmed) {
    return { data: null, error: new Error('Confirm the completion checklist before marking this request completed.') };
  }
  return applyTicketWorkflowAction(ticketId, 'completed_by_owner', context, {
    eventType: 'owner_completed_request',
    message: 'Owner marked the request as completed.',
    resolutionNote: input.resolutionNote,
    slaBreachReason: input.slaBreachReason,
    metadata: { completion_category: input.completionCategory },
    patch: {
      completion_category: input.completionCategory,
      completion_checklist_confirmed: input.checklistConfirmed,
      previous_owner_id: context.userId,
    },
  });
}

export async function closeTicketByRequester(
  ticketId: string,
  input: {
    confirmedResolved: boolean;
    satisfactionRating: number;
    feedbackComment?: string | null;
    slaBreachReason?: string | null;
  },
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<TicketRecord>> {
  if (!input.confirmedResolved) {
    return { data: null, error: new Error('Confirm the request is resolved before closing it.') };
  }
  if (!Number.isFinite(input.satisfactionRating) || input.satisfactionRating < 1 || input.satisfactionRating > 5) {
    return { data: null, error: new Error('Satisfaction rating must be between 1 and 5.') };
  }
  const result = await applyTicketWorkflowAction(ticketId, 'closed', context, {
    eventType: 'requester_closed_request',
    message: 'Requester closed the request.',
    slaBreachReason: input.slaBreachReason,
    metadata: { satisfaction_rating: input.satisfactionRating },
    patch: {
      closure_confirmed: input.confirmedResolved,
      satisfaction_rating: input.satisfactionRating,
      closure_feedback: input.feedbackComment?.trim() ? input.feedbackComment.trim() : null,
      closed_at: new Date().toISOString(),
    },
  });
  if (result.data) {
    await Promise.allSettled([
      table('ticket_closure_feedback').insert({
        ticket_id: ticketId,
        company_id: context.companyId,
        requester_id: context.userId,
        confirmed_resolved: input.confirmedResolved,
        satisfaction_rating: input.satisfactionRating,
        feedback_comment: input.feedbackComment?.trim() ? input.feedbackComment.trim() : null,
      }),
      ticketActivityTable().insert({
        ticket_id: ticketId,
        company_id: context.companyId,
        actor_id: context.userId,
        event_type: 'closure_feedback_submitted',
        message: 'Requester submitted closure feedback.',
        metadata: { satisfaction_rating: input.satisfactionRating },
      }),
    ]);
  }
  return result;
}

export async function reopenTicketByRequester(
  ticketId: string,
  input: { reason: string },
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<TicketRecord>> {
  const reason = input.reason.trim();
  if (!reason) return { data: null, error: new Error('Reopen reason is required.') };

  try {
    const current = await fetchTicketForUpdate(ticketId, context.companyId);
    if (current.submitted_by !== context.userId) {
      return { data: null, error: new Error('Only the requester can reopen this request.') };
    }
    if (current.status !== 'closed') {
      return { data: null, error: new Error('Only closed requests can be reopened.') };
    }

    const { data: settings } = await table('request_module_settings')
      .select('reopen_window_days')
      .eq('company_id', context.companyId)
      .maybeSingle();
    const reopenWindowDays = Number((settings as { reopen_window_days?: number } | null)?.reopen_window_days ?? 14);
    if (reopenWindowDays > 0) {
      const closedAt = current.closed_at ?? current.updated_at;
      const elapsedMs = Date.now() - new Date(closedAt).getTime();
      if (elapsedMs > reopenWindowDays * 24 * 60 * 60 * 1000) {
        return { data: null, error: new Error(`This request can only be reopened within ${reopenWindowDays} days of closure.`) };
      }
    }

    const now = new Date().toISOString();
    const owner = current.previous_owner_id ?? current.assigned_to;
    const patch = withWorkflowPatch('reopened', {
      assigned_to: owner,
      responsible_queue: owner ? 'Owner' : current.responsible_queue || 'Unassigned',
      current_responsible_party: owner ? 'Owner' : 'Admin',
      next_action: owner ? 'Owner to review reopened request' : 'Admin to assign reopened request',
      reopened_at: now,
      last_reopen_reason: reason,
      reopen_count: current.reopen_count + 1,
      resolved_at: null,
      closed_at: null,
      closure_confirmed: null,
      last_action_by: context.userId,
    });

    const { data, error } = await ticketsTable()
      .update(patch)
      .eq('company_id', context.companyId)
      .eq('id', ticketId)
      .select(TICKET_SELECT)
      .single();
    if (error) throw error;

    const nextTicket = mapTicket(data as unknown as TicketRow);
    await Promise.allSettled([
      ticketActivityTable().insert([
        ...buildTicketActivityEntries(current, nextTicket, context.userId),
        {
          ticket_id: ticketId,
          company_id: context.companyId,
          actor_id: context.userId,
          event_type: 'request_reopened',
          message: 'Requester reopened the request.',
          metadata: { reason, reopen_count: nextTicket.reopen_count },
        },
      ]),
      createNotifications(
        [nextTicket.assigned_to, nextTicket.backup_owner_id, nextTicket.escalation_owner_id]
          .filter((recipientId): recipientId is string => Boolean(recipientId && recipientId !== context.userId))
          .map((userId) => ({
            userId,
            title: 'Request reopened',
            message: `"${nextTicket.subject}" was reopened by the requester.`,
            type: 'warning',
          })),
      ),
    ]);

    return { data: nextTicket, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to reopen request');
    loggingService.error('Failed to reopen ticket', { error: error.message, ticketId }, 'TicketService');
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
    const current = await fetchTicketForUpdate(ticketId, context.companyId);
    if (current.submitted_by !== context.userId) {
      return { data: null, error: new Error('Only the requester can cancel this request') };
    }
    if (current.status !== 'open' || current.assigned_to) {
      return { data: null, error: new Error('Request can only be cancelled while open and unassigned') };
    }

    const { data, error } = await supabase.rpc('cancel_own_ticket', {
      p_ticket_id: ticketId,
      p_cancellation_note: reason ?? null as unknown as string | undefined,
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
    const ticket = await fetchTicketForUpdate(ticketId, context.companyId);

    const metadata: Record<string, unknown> = { comment: true };
    if (input.attachmentNames?.length) metadata.attachment_names = input.attachmentNames;
    if (input.emoji) metadata.emoji = input.emoji;

    const { data, error } = await ticketActivityTable()
      .insert({
        ticket_id: ticketId,
        company_id: context.companyId,
        actor_id: context.userId,
        event_type: 'comment_added',
        message,
        metadata,
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
