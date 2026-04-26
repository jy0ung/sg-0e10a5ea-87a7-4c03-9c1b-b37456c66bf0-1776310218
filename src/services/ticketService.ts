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

export interface CreateTicketInput {
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  description: string;
}

export interface TicketServiceResult<T> {
  data: T | null;
  error: Error | null;
}

type TicketsClient = {
  from: (table: 'tickets') => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          order: (
            col: string,
            opts?: { ascending?: boolean },
          ) => Promise<{ data: TicketRecord[] | null; error: Error | null }>;
        };
      };
    };
    insert: (row: CreateTicketInput & { company_id: string; submitted_by: string; status: TicketStatus }) => Promise<{
      data: unknown;
      error: Error | null;
    }>;
  };
};

// Narrow the untyped `from('tickets')` path to our local shape.
// The cast is isolated here so the rest of the codebase stays clean.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = supabase as unknown as TicketsClient;

export async function listMyTickets(userId: string, companyId: string): Promise<TicketServiceResult<TicketRecord[]>> {
  try {
    const { data, error } = await client
      .from('tickets')
      .select('id, subject, category, priority, status, description, created_at, updated_at, company_id, submitted_by')
      .eq('submitted_by', userId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: data ?? [], error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load tickets');
    loggingService.error('Failed to list tickets', { error: error.message }, 'TicketService');
    return { data: null, error };
  }
}

export async function createTicket(
  input: CreateTicketInput,
  context: { userId: string; companyId: string },
): Promise<TicketServiceResult<true>> {
  try {
    const { error } = await client.from('tickets').insert({
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
