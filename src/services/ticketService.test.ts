import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { createTicket, listMyTickets } from './ticketService';
import { logUserAction } from './auditService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('./auditService', () => ({
  logUserAction: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    error: vi.fn(),
  },
}));

describe('ticketService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists only tickets submitted by the current user inside the current company', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const companyEq = vi.fn(() => ({ order }));
    const submittedByEq = vi.fn(() => ({ eq: companyEq }));
    const select = vi.fn(() => ({ eq: submittedByEq }));
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    const result = await listMyTickets('user-1', 'company-1');

    expect(result.error).toBeNull();
    expect(submittedByEq).toHaveBeenCalledWith('submitted_by', 'user-1');
    expect(companyEq).toHaveBeenCalledWith('company_id', 'company-1');
  });

  it('derives ticket owner and company from authenticated context', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    const result = await createTicket({
      subject: 'Need help with order',
      category: 'service_request',
      priority: 'medium',
      description: 'Please help me follow up on this order request.',
    }, {
      userId: 'user-1',
      companyId: 'company-1',
    });

    expect(result.error).toBeNull();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      company_id: 'company-1',
      submitted_by: 'user-1',
      status: 'open',
    }));
    expect(logUserAction).toHaveBeenCalledWith('user-1', 'create', 'ticket', undefined, { component: 'TicketService' });
  });
});
