import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { addTicketComment, cancelMyTicket, createTicket, listMyTickets, listTicketActivity, updateTicket } from './ticketService';
import { logUserAction } from './auditService';
import { createNotifications } from './notificationService';
import { evaluateRoutingRules } from './requestRoutingService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
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

vi.mock('./requestRoutingService', () => ({
  evaluateRoutingRules: vi.fn().mockResolvedValue(null),
}));

describe('ticketService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  function mockNoActiveInternalRequestApprovalFlow() {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const activeEq = vi.fn(() => ({ order }));
    const entityEq = vi.fn(() => ({ eq: activeEq }));
    const companyEq = vi.fn(() => ({ eq: entityEq }));
    const select = vi.fn(() => ({ eq: companyEq }));
    return { select, companyEq, entityEq, activeEq, order };
  }

  function mockProfilesDepartmentLookup() {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    return { select };
  }

  // request_subcategories.select('approval_flow_id').eq().eq().eq().maybeSingle()
  // — used by getInternalRequestApprovalPlan to honor a subcategory-pinned flow.
  // Default mock returns no pin so the resolver falls through to the category pin.
  // The chain has three .eq() calls: company_id, category_key, subcategory_key.
  function mockNoSubcategoryFlowPin() {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const subcategoryKeyEq = vi.fn(() => ({ maybeSingle }));
    const categoryKeyEq = vi.fn(() => ({ eq: subcategoryKeyEq }));
    const companyEq = vi.fn(() => ({ eq: categoryKeyEq }));
    const select = vi.fn(() => ({ eq: companyEq }));
    return { select };
  }

  // request_categories.select('approval_flow_id').eq().eq().maybeSingle()
  // — used by getInternalRequestApprovalPlan to honor a category-pinned flow.
  // Default mock returns no pin so the resolver falls through to the flow scorer.
  function mockNoCategoryFlowPin() {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const categoryKeyEq = vi.fn(() => ({ maybeSingle }));
    const companyEq = vi.fn(() => ({ eq: categoryKeyEq }));
    const select = vi.fn(() => ({ eq: companyEq }));
    return { select };
  }

  function mockNoInternalRequestApprovalMetadata() {
    const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const entityEq = vi.fn(() => ({ in: inFn }));
    const select = vi.fn(() => ({ eq: entityEq }));
    return { select, entityEq, inFn };
  }

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
    const profilesLookup = mockProfilesDepartmentLookup();
    // subcategory pin lookup runs before the category pin because it is the
    // more specific resolution. This test passes a non-null subcategory so
    // the DB call fires (a null subcategory would short-circuit in the
    // service and skip the round-trip).
    const subcategoryPinLookup = mockNoSubcategoryFlowPin();
    const categoryPinLookup = mockNoCategoryFlowPin();
    const approvalFlowSelect = mockNoActiveInternalRequestApprovalFlow();
    const single = vi.fn().mockResolvedValue({ data: { id: 'ticket-1' }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: profilesLookup.select }) as never)
      .mockImplementationOnce(() => ({ select: subcategoryPinLookup.select }) as never)
      .mockImplementationOnce(() => ({ select: categoryPinLookup.select }) as never)
      .mockImplementationOnce(() => ({ select: approvalFlowSelect.select }) as never)
      .mockImplementationOnce(() => ({ insert }) as never);

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
    expect(logUserAction).toHaveBeenCalledWith('user-1', 'create', 'ticket', 'ticket-1', { component: 'TicketService' });
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
        first_response_due_at: '2026-04-30T13:00:00.000Z',
        resolution_due_at: '2026-05-02T09:00:00.000Z',
        first_responded_at: null,
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
        first_response_due_at: '2026-04-30T13:00:00.000Z',
        resolution_due_at: '2026-05-02T09:00:00.000Z',
        first_responded_at: '2026-04-30T10:00:00.000Z',
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
    const approvalMetadataSelect = mockNoInternalRequestApprovalMetadata();

    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: currentSelect }) as never)
      .mockImplementationOnce(() => ({ update }) as never)
      .mockImplementationOnce(() => ({ select: approvalMetadataSelect.select }) as never)
      .mockImplementationOnce(() => ({ insert: activityInsert }) as never);

    const result = await updateTicket(
      'ticket-1',
      { assigned_to: 'user-2', resolution_note: 'Following up with the outlet.' },
      { userId: 'user-1', companyId: 'company-1' },
    );

    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalledWith({
      assigned_to: 'user-2',
      assigned_at: expect.any(String),
      first_responded_at: expect.any(String),
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
      assigned_at: expect.any(String),
      first_responded_at: expect.any(String),
      resolution_note: 'Following up with the outlet.',
    });
  });

  it('scopes ticket activity queries to the current company to prevent cross-tenant data leaks', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const companyEq = vi.fn(() => ({ order }));
    const inFn = vi.fn(() => ({ eq: companyEq }));
    const select = vi.fn(() => ({ in: inFn }));
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    const result = await listTicketActivity(['ticket-1', 'ticket-2'], 'company-1');

    expect(result.error).toBeNull();
    expect(inFn).toHaveBeenCalledWith('ticket_id', ['ticket-1', 'ticket-2']);
    expect(companyEq).toHaveBeenCalledWith('company_id', 'company-1');
  });

  it('auto-assigns the ticket when a routing rule matches the submission context', async () => {
    vi.mocked(evaluateRoutingRules).mockResolvedValueOnce('agent-7');

    const profilesLookup = mockProfilesDepartmentLookup();
    const categoryPinLookup = mockNoCategoryFlowPin();
    const approvalFlowSelect = mockNoActiveInternalRequestApprovalFlow();
    const single = vi.fn().mockResolvedValue({ data: { id: 'ticket-2' }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: profilesLookup.select }) as never)
      .mockImplementationOnce(() => ({ select: categoryPinLookup.select }) as never)
      .mockImplementationOnce(() => ({ select: approvalFlowSelect.select }) as never)
      .mockImplementationOnce(() => ({ insert }) as never);

    const result = await createTicket({
      subject: 'VIN Transfer needed',
      category: 'operations_support',
      subcategory: null,
      priority: 'high',
      description: 'Please process the VIN transfer.',
    }, {
      userId: 'user-3',
      companyId: 'company-1',
      submitterRole: 'sales_advisor',
    });

    expect(result.error).toBeNull();
    expect(evaluateRoutingRules).toHaveBeenCalledWith('company-1', {
      category: 'operations_support',
      subcategory: null,
      priority: 'high',
      submitterRole: 'sales_advisor',
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      assigned_to: 'agent-7',
      assigned_at: expect.any(String),
    }));
    expect(createNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'agent-7', title: 'Request assigned to you' }),
      ]),
    );
  });

  it('adds request comments as activity and notifies requester and owner', async () => {
    const currentSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'ticket-1',
        company_id: 'company-1',
        subject: 'Need help with order',
        category: 'operations_support',
        subcategory: null,
        priority: 'medium',
        status: 'in_progress',
        description: 'Please help me follow up on this order request.',
        submitted_by: 'user-9',
        assigned_to: 'user-2',
        assigned_at: '2026-04-30T10:00:00.000Z',
        resolved_at: null,
        resolution_note: null,
        custom_fields: {},
        created_at: '2026-04-30T09:00:00.000Z',
        updated_at: '2026-04-30T10:00:00.000Z',
      },
      error: null,
    });
    const currentIdEq = vi.fn(() => ({ single: currentSingle }));
    const currentCompanyEq = vi.fn(() => ({ eq: currentIdEq }));
    const currentSelect = vi.fn(() => ({ eq: currentCompanyEq }));

    const activitySingle = vi.fn().mockResolvedValue({
      data: {
        id: 'activity-1',
        ticket_id: 'ticket-1',
        company_id: 'company-1',
        actor_id: 'admin-1',
        event_type: 'comment_added',
        message: 'Please attach the latest supporting document.',
        metadata: { comment: true },
        created_at: '2026-04-30T11:00:00.000Z',
      },
      error: null,
    });
    const activitySelect = vi.fn(() => ({ single: activitySingle }));
    const activityInsert = vi.fn(() => ({ select: activitySelect }));

    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: currentSelect }) as never)
      .mockImplementationOnce(() => ({ insert: activityInsert }) as never);

    const result = await addTicketComment(
      'ticket-1',
      { message: '  Please attach the latest supporting document.  ' },
      { userId: 'admin-1', companyId: 'company-1' },
    );

    expect(result.error).toBeNull();
    expect(activityInsert).toHaveBeenCalledWith(expect.objectContaining({
      ticket_id: 'ticket-1',
      event_type: 'comment_added',
      message: 'Please attach the latest supporting document.',
      metadata: { comment: true },
    }));
    expect(createNotifications).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ userId: 'user-9', title: 'New request comment' }),
      expect.objectContaining({ userId: 'user-2', title: 'New request comment' }),
    ]));
    expect(logUserAction).toHaveBeenCalledWith('admin-1', 'create', 'ticket_comment', 'ticket-1', { component: 'TicketService' });
  });

  it('cancels an open unassigned requester ticket through the scoped RPC', async () => {
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
        first_response_due_at: '2026-04-30T13:00:00.000Z',
        resolution_due_at: '2026-05-02T09:00:00.000Z',
        first_responded_at: null,
        resolved_at: null,
        resolution_note: null,
        custom_fields: {},
        created_at: '2026-04-30T09:00:00.000Z',
        updated_at: '2026-04-30T09:00:00.000Z',
      },
      error: null,
    });
    const currentIdEq = vi.fn(() => ({ single: currentSingle }));
    const currentCompanyEq = vi.fn(() => ({ eq: currentIdEq }));
    const currentSelect = vi.fn(() => ({ eq: currentCompanyEq }));

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        id: 'ticket-1',
        company_id: 'company-1',
        subject: 'Need help with order',
        category: 'operations_support',
        subcategory: null,
        priority: 'medium',
        status: 'cancelled',
        description: 'Please help me follow up on this order request.',
        submitted_by: 'user-9',
        assigned_to: null,
        assigned_at: null,
        first_response_due_at: '2026-04-30T13:00:00.000Z',
        resolution_due_at: '2026-05-02T09:00:00.000Z',
        first_responded_at: null,
        resolved_at: '2026-04-30T10:00:00.000Z',
        resolution_note: 'Cancelled by requester.',
        custom_fields: {},
        created_at: '2026-04-30T09:00:00.000Z',
        updated_at: '2026-04-30T10:00:00.000Z',
      },
      error: null,
    } as never);

    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: currentSelect }) as never)
      .mockImplementationOnce(() => ({ insert: activityInsert }) as never);

    const result = await cancelMyTicket(
      'ticket-1',
      { reason: 'Cancelled by requester.' },
      { userId: 'user-9', companyId: 'company-1' },
    );

    expect(result.error).toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith('cancel_own_ticket', {
      p_ticket_id: 'ticket-1',
      p_cancellation_note: 'Cancelled by requester.',
    });
    expect(activityInsert).toHaveBeenCalledWith(expect.objectContaining({
      ticket_id: 'ticket-1',
      event_type: 'status_changed',
      message: 'Request cancelled by requester.',
      metadata: { before: 'open', after: 'cancelled', reason: 'Cancelled by requester.' },
    }));
    expect(logUserAction).toHaveBeenCalledWith('user-9', 'update', 'ticket', 'ticket-1', {
      component: 'TicketService',
      status: 'cancelled',
    });
  });
});
