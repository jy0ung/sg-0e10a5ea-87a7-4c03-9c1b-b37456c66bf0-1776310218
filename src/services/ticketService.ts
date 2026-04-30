import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from './auditService';
import { loggingService } from './loggingService';

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
export type TicketCategory =
  | 'sales_inquiry'
  | 'technical_issue'
  | 'service_request'
  | 'general'
  | 'other';

export interface TicketRecord {
  id: string;
  company_id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  description: string;
  submitted_by: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyTicketRecord extends TicketRecord {
  submitted_by_name: string | null;
  submitted_by_email: string | null;
}

export interface CreateTicketInput {
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  description: string;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
}

export interface TicketServiceResult<T> {
  data: T | null;
  error: Error | null;
}

interface TicketRow extends TicketRecord {}

interface ProfileLookupRow {
  id: string;
  name: string | null;
  email: string | null;
}

function mapTicket(row: TicketRow): TicketRecord {
  return {
    id: row.id,
    company_id: row.company_id,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    description: row.description,
    submitted_by: row.submitted_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Keep the generated-type escape hatch isolated to this service.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ticketsTable(): any {
  return supabase.from('tickets' as never);
}

export async function listMyTickets(userId: string, companyId: string): Promise<TicketServiceResult<TicketRecord[]>> {
  try {
    const { data, error } = await ticketsTable()
      .select('id, subject, category, priority, status, description, created_at, updated_at, company_id, submitted_by')
      .eq('submitted_by', userId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: ((data ?? []) as TicketRow[]).map(mapTicket), error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load tickets');
    loggingService.error('Failed to list tickets', { error: error.message }, 'TicketService');
    return { data: null, error };
  }
}

export async function listCompanyTickets(companyId: string): Promise<TicketServiceResult<CompanyTicketRecord[]>> {
  try {
    const { data, error } = await ticketsTable()
      .select('id, subject, category, priority, status, description, created_at, updated_at, company_id, submitted_by')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = ((data ?? []) as TicketRow[]).map(mapTicket);
    const submittedByIds = Array.from(new Set(rows.map((ticket) => ticket.submitted_by))).filter(Boolean);

    let profilesById = new Map<string, ProfileLookupRow>();
    if (submittedByIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('company_id', companyId)
        .in('id', submittedByIds);

      if (profilesError) throw profilesError;
      profilesById = new Map((profileRows ?? []).map((profile) => [profile.id, profile as ProfileLookupRow]));
    }

    return {
      data: rows.map((ticket) => ({
        ...ticket,
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

export async function createTicket(
  input: CreateTicketInput,
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<true>> {
  try {
    const { error } = await ticketsTable().insert({
      ...input,
      company_id: context.companyId,
      submitted_by: context.userId,
      status: 'open',
    });
    if (error) throw error;
    void logUserAction(context.userId, 'create', 'ticket', undefined, { component: 'TicketService' });
    return { data: true, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to create ticket');
    loggingService.error(
      'Failed to create ticket',
      { error: error.message, category: input.category, priority: input.priority },
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
  const patch: Record<string, string> = {};

  if (input.status) patch.status = input.status;
  if (input.priority) patch.priority = input.priority;

  if (Object.keys(patch).length === 0) {
    return { data: null, error: new Error('No request updates were provided') };
  }

  try {
    const { data, error } = await ticketsTable()
      .update(patch)
      .eq('company_id', context.companyId)
      .eq('id', ticketId)
      .select('id, subject, category, priority, status, description, created_at, updated_at, company_id, submitted_by')
      .single();

    if (error) throw error;

    void logUserAction(context.userId, 'update', 'ticket', ticketId, {
      component: 'TicketService',
      ...patch,
    });

    return { data: mapTicket(data as TicketRow), error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to update ticket');
    loggingService.error('Failed to update ticket', { error: error.message, ticketId, ...patch }, 'TicketService');
    return { data: null, error };
  }
}
