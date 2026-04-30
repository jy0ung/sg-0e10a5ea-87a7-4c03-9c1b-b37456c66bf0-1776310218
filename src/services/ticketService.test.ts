import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { createTicket, listMyTickets, updateTicket } from './ticketService';
import { logUserAction } from './auditService';
import { createNotifications } from './notificationService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('./auditService', () => ({
  logUserAction: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('./notificationService', () => ({
  createNotifications: vi.fn().mockResolvedValue({ error: null }),
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
      category: 'operations_support',
      subcategory: 'stock_transfer',
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
      subcategory: 'stock_transfer',
      status: 'open',
      assigned_to: null,
      resolution_note: null,
    }));
    expect(logUserAction).toHaveBeenCalledWith('user-1', 'create', 'ticket', undefined, { component: 'TicketService' });
  });

  it('scopes ticket updates to the current company and persists assignment metadata', async () => {
    const currentSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'ticket-1',
        company_id: 'company-1',
        subject: 'Need help with order',
        category: 'operations_support',
        subcategory: null,
        priority: 'medium',
        status: 'open',
        description: 'Please help me follow up on this order request.',
        submitted_by: 'user-9',
        assigned_to: null,
        assigned_at: null,
        resolved_at: null,
        resolution_note: null,
        created_at: '2026-04-30T09:00:00.000Z',
        updated_at: '2026-04-30T09:00:00.000Z',
      },
      error: null,
    });
    const currentIdEq = vi.fn(() => ({ single: currentSingle }));
    const currentCompanyEq = vi.fn(() => ({ eq: currentIdEq }));
    const currentSelect = vi.fn(() => ({ eq: currentCompanyEq }));

    const updatedSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'ticket-1',
        company_id: 'company-1',
        subject: 'Need help with order',
        category: 'operations_support',
        subcategory: null,
        priority: 'medium',
        status: 'open',
        description: 'Please help me follow up on this order request.',
        submitted_by: 'user-9',
        assigned_to: 'user-2',
        assigned_at: '2026-04-30T10:00:00.000Z',
        resolved_at: null,
        resolution_note: 'Following up with the outlet.',
        created_at: '2026-04-30T09:00:00.000Z',
        updated_at: '2026-04-30T10:00:00.000Z',
      },
      error: null,
    });
    const updatedSelect = vi.fn(() => ({ single: updatedSingle }));
    const updatedIdEq = vi.fn(() => ({ select: updatedSelect }));
    const updatedCompanyEq = vi.fn(() => ({ eq: updatedIdEq }));
    const update = vi.fn(() => ({ eq: updatedCompanyEq }));

    const activityInsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: currentSelect }) as never)
      .mockImplementationOnce(() => ({ update }) as never)
      .mockImplementationOnce(() => ({ insert: activityInsert }) as never);

    const result = await updateTicket(
      'ticket-1',
      { assigned_to: 'user-2', resolution_note: 'Following up with the outlet.' },
      { userId: 'user-1', companyId: 'company-1' },
    );

    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalledWith({
      assigned_to: 'user-2',
      resolution_note: 'Following up with the outlet.',
    });
    expect(currentCompanyEq).toHaveBeenCalledWith('company_id', 'company-1');
    expect(currentIdEq).toHaveBeenCalledWith('id', 'ticket-1');
    expect(updatedCompanyEq).toHaveBeenCalledWith('company_id', 'company-1');
    expect(updatedIdEq).toHaveBeenCalledWith('id', 'ticket-1');
    expect(activityInsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ ticket_id: 'ticket-1', event_type: 'owner_changed' }),
      expect.objectContaining({ ticket_id: 'ticket-1', event_type: 'resolution_note_updated' }),
    ]));
    expect(createNotifications).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ userId: 'user-9', title: 'Request owner assigned' }),
      expect.objectContaining({ userId: 'user-2', title: 'Request assigned to you' }),
    ]));
    expect(logUserAction).toHaveBeenCalledWith('user-1', 'update', 'ticket', 'ticket-1', {
      component: 'TicketService',
      assigned_to: 'user-2',
      resolution_note: 'Following up with the outlet.',
    });
  });
});
