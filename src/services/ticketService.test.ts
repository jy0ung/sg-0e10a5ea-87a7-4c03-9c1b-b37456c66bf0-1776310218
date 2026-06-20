import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  addTicketComment,
  cancelMyTicket,
  closeTicketByRequester,
  createTicket,
  getTicketNextAction,
  listMyTickets,
  listTicketActivity,
  markTicketCompletedByOwner,
  requestTicketMoreInformation,
  reopenTicketByRequester,
  submitRequesterTicketUpdate,
  updateTicket,
  type TicketStatus,
} from './ticketService';
import { logUserAction } from './auditService';
import { createNotifications } from './notificationService';
import { evaluateRoutingRules } from '@flc/internal-requests';

const mockSupabaseClient = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabaseClient,
}));

vi.mock('@flc/supabase', () => ({
  supabase: mockSupabaseClient,
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

vi.mock('@flc/internal-requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@flc/internal-requests')>()),
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

  function workflowTicket(status: TicketStatus) {
    return {
      id: 'ticket-workflow',
      company_id: 'company-1',
      subject: 'Workflow request',
      category: 'operations_support',
      subcategory: null,
      priority: 'medium',
      status,
      description: 'Verify the automated workflow.',
      submitted_by: 'requester-1',
      assigned_to: 'owner-1',
      assigned_at: '2099-01-15T09:00:00.000Z',
      first_response_due_at: '2099-01-15T13:00:00.000Z',
      resolution_due_at: '2099-01-16T09:00:00.000Z',
      first_responded_at: '2099-01-15T09:30:00.000Z',
      resolved_at: null,
      resolution_note: null,
      custom_fields: {},
      sla_status: 'on_track',
      sla_breach_reason: null,
      created_at: '2099-01-15T08:00:00.000Z',
      updated_at: '2099-01-15T09:30:00.000Z',
    };
  }

  function mockTicketFetch(ticket: ReturnType<typeof workflowTicket>) {
    const single = vi.fn().mockResolvedValue({ data: ticket, error: null });
    const idEq = vi.fn(() => ({ single }));
    const companyEq = vi.fn(() => ({ eq: idEq }));
    const select = vi.fn(() => ({ eq: companyEq }));
    return { select };
  }

  function mockTicketUpdate(ticket: ReturnType<typeof workflowTicket>) {
    const single = vi.fn().mockResolvedValue({ data: ticket, error: null });
    const select = vi.fn(() => ({ single }));
    const idEq = vi.fn(() => ({ select }));
    const companyEq = vi.fn(() => ({ eq: idEq }));
    const update = vi.fn(() => ({ eq: companyEq }));
    return { update };
  }

  function mockCommentInsert(ticketId: string, actorId: string, message: string) {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: `comment-${ticketId}`,
        ticket_id: ticketId,
        company_id: 'company-1',
        actor_id: actorId,
        event_type: 'comment_added',
        message,
        metadata: { comment: true },
        created_at: '2099-01-15T10:00:00.000Z',
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    return { insert };
  }

  function mockActivityInsert() {
    return { insert: vi.fn().mockResolvedValue({ error: null }) };
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
      last_action_by: 'user-1',
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
      last_action_by: 'user-1',
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

  it('auto-starts the first queue opener when a non-requestor opens an unassigned open ticket', async () => {
    const currentSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'ticket-7',
        company_id: 'company-1',
        subject: 'Need branch support',
        category: 'operations_support',
        subcategory: null,
        priority: 'medium',
        status: 'open',
        description: 'Need branch support.',
        submitted_by: 'requestor-1',
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

    const updatedSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'ticket-7',
        company_id: 'company-1',
        subject: 'Need branch support',
        category: 'operations_support',
        subcategory: null,
        priority: 'medium',
        status: 'in_progress',
        description: 'Need branch support.',
        submitted_by: 'requestor-1',
        assigned_to: 'agent-1',
        assigned_at: '2026-04-30T10:00:00.000Z',
        first_response_due_at: '2026-04-30T13:00:00.000Z',
        resolution_due_at: '2026-05-02T09:00:00.000Z',
        first_responded_at: '2026-04-30T10:00:00.000Z',
        resolved_at: null,
        resolution_note: null,
        custom_fields: {},
        created_at: '2026-04-30T09:00:00.000Z',
        updated_at: '2026-04-30T10:00:00.000Z',
      },
      error: null,
    });
    const updatedSelect = vi.fn(() => ({ single: updatedSingle }));
    const updatedIdEq = vi.fn(() => ({ select: updatedSelect }));
    const updatedCompanyEq = vi.fn(() => ({ eq: updatedIdEq }));
    const update = vi.fn(() => ({ eq: updatedCompanyEq }));

    const approvalMetadataSelect = mockNoInternalRequestApprovalMetadata();
    const activityInsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: currentSelect }) as never)
      .mockImplementationOnce(() => ({ update }) as never)
      .mockImplementationOnce(() => ({ select: approvalMetadataSelect.select }) as never)
      .mockImplementationOnce(() => ({ insert: activityInsert }) as never);

    const result = await updateTicket(
      'ticket-7',
      { mark_opened: true },
      { userId: 'agent-1', companyId: 'company-1' },
    );

    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'in_progress',
      assigned_to: 'agent-1',
      assigned_at: expect.any(String),
      first_responded_at: expect.any(String),
    }));
    expect(activityInsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ ticket_id: 'ticket-7', event_type: 'status_changed' }),
      expect.objectContaining({ ticket_id: 'ticket-7', event_type: 'owner_changed' }),
    ]));
  });

  it('does not auto-start when requester opens their own ticket', async () => {
    const currentSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'ticket-8',
        company_id: 'company-1',
        subject: 'Need branch support',
        category: 'operations_support',
        subcategory: null,
        priority: 'medium',
        status: 'open',
        description: 'Need branch support.',
        submitted_by: 'requestor-1',
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

    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: currentSelect }) as never);

    const result = await updateTicket(
      'ticket-8',
      { mark_opened: true },
      { userId: 'requestor-1', companyId: 'company-1' },
    );

    expect(result.error).toBeNull();
    expect(result.data?.status).toBe('open');
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('auto-starts an assigned open ticket without changing its owner', async () => {
    const currentTicket = {
      id: 'ticket-9',
      company_id: 'company-1',
      subject: 'Assigned request',
      category: 'operations_support',
      subcategory: null,
      priority: 'medium',
      status: 'open',
      description: 'Already assigned.',
      submitted_by: 'requestor-1',
      assigned_to: 'owner-1',
      assigned_at: '2026-04-30T09:30:00.000Z',
      first_response_due_at: '2026-04-30T13:00:00.000Z',
      resolution_due_at: '2026-05-02T09:00:00.000Z',
      first_responded_at: null,
      resolved_at: null,
      resolution_note: null,
      custom_fields: {},
      created_at: '2026-04-30T09:00:00.000Z',
      updated_at: '2026-04-30T09:30:00.000Z',
    };
    const currentSingle = vi.fn().mockResolvedValue({ data: currentTicket, error: null });
    const currentIdEq = vi.fn(() => ({ single: currentSingle }));
    const currentCompanyEq = vi.fn(() => ({ eq: currentIdEq }));
    const currentSelect = vi.fn(() => ({ eq: currentCompanyEq }));

    const updatedSingle = vi.fn().mockResolvedValue({
      data: {
        ...currentTicket,
        status: 'in_progress',
        first_responded_at: '2026-04-30T10:00:00.000Z',
        updated_at: '2026-04-30T10:00:00.000Z',
      },
      error: null,
    });
    const updatedSelect = vi.fn(() => ({ single: updatedSingle }));
    const updatedIdEq = vi.fn(() => ({ select: updatedSelect }));
    const updatedCompanyEq = vi.fn(() => ({ eq: updatedIdEq }));
    const update = vi.fn(() => ({ eq: updatedCompanyEq }));
    const approvalMetadataSelect = mockNoInternalRequestApprovalMetadata();
    const activityInsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: currentSelect }) as never)
      .mockImplementationOnce(() => ({ update }) as never)
      .mockImplementationOnce(() => ({ select: approvalMetadataSelect.select }) as never)
      .mockImplementationOnce(() => ({ insert: activityInsert }) as never);

    const result = await updateTicket(
      'ticket-9',
      { mark_opened: true },
      { userId: 'manager-1', companyId: 'company-1' },
    );

    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'in_progress',
      assigned_to: 'owner-1',
      assigned_at: '2026-04-30T09:30:00.000Z',
      first_responded_at: expect.any(String),
    }));
    expect(activityInsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ ticket_id: 'ticket-9', event_type: 'status_changed' }),
    ]));
    expect(activityInsert).not.toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ ticket_id: 'ticket-9', event_type: 'owner_changed' }),
    ]));
  });

  it('keeps the automated status model tied to the correct responsible party and next action', () => {
    expect(getTicketNextAction('open')).toEqual({
      responsibleParty: 'Owner',
      nextAction: 'Owner to review request',
    });
    expect(getTicketNextAction('in_progress')).toEqual({
      responsibleParty: 'Owner',
      nextAction: 'Owner to resolve request',
    });
    expect(getTicketNextAction('pending_requester')).toEqual({
      responsibleParty: 'Requester',
      nextAction: 'Requester to provide information',
    });
    expect(getTicketNextAction('pending_owner_review')).toEqual({
      responsibleParty: 'Owner',
      nextAction: 'Owner to review requester response',
    });
    expect(getTicketNextAction('completed_by_owner')).toEqual({
      responsibleParty: 'Requester',
      nextAction: 'Requester to confirm and close',
    });
    expect(getTicketNextAction('reopened')).toEqual({
      responsibleParty: 'Owner',
      nextAction: 'Owner to review reopened request',
    });
  });

  it('moves an owner information request to Pending Requester and records the workflow event', async () => {
    const current = workflowTicket('in_progress');
    const updated = {
      ...current,
      status: 'pending_requester' as const,
      current_responsible_party: 'Requester',
      next_action: 'Requester to provide information',
      updated_at: '2099-01-15T10:00:00.000Z',
    };
    const currentForComment = mockTicketFetch(current);
    const commentInsert = mockCommentInsert(current.id, 'owner-1', 'Please provide the signed form.');
    const currentForWorkflow = mockTicketFetch(current);
    const ticketUpdate = mockTicketUpdate(updated);
    const approvalMetadata = mockNoInternalRequestApprovalMetadata();
    const activityInsert = mockActivityInsert();

    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: currentForComment.select }) as never)
      .mockImplementationOnce(() => ({ insert: commentInsert.insert }) as never)
      .mockImplementationOnce(() => ({ select: currentForWorkflow.select }) as never)
      .mockImplementationOnce(() => ({ update: ticketUpdate.update }) as never)
      .mockImplementationOnce(() => ({ select: approvalMetadata.select }) as never)
      .mockImplementationOnce(() => ({ insert: activityInsert.insert }) as never);

    const result = await requestTicketMoreInformation(
      current.id,
      { message: 'Please provide the signed form.' },
      { userId: 'owner-1', companyId: 'company-1' },
    );

    expect(result.data?.status).toBe('pending_requester');
    expect(ticketUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending_requester',
      current_responsible_party: 'Requester',
      next_action: 'Requester to provide information',
    }));
    expect(activityInsert.insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ event_type: 'owner_requested_more_information' }),
      expect.objectContaining({ event_type: 'status_changed' }),
    ]));
  });

  it('moves a requester reply to Pending Owner Review and records the workflow event', async () => {
    const current = workflowTicket('pending_requester');
    const updated = {
      ...current,
      status: 'pending_owner_review' as const,
      current_responsible_party: 'Owner',
      next_action: 'Owner to review requester response',
      updated_at: '2026-06-19T10:30:00.000Z',
    };
    const currentForComment = mockTicketFetch(current);
    const commentInsert = mockCommentInsert(current.id, 'requester-1', 'The signed form is attached.');
    const currentForWorkflow = mockTicketFetch(current);
    const ticketUpdate = mockTicketUpdate(updated);
    const approvalMetadata = mockNoInternalRequestApprovalMetadata();
    const activityInsert = mockActivityInsert();

    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: currentForComment.select }) as never)
      .mockImplementationOnce(() => ({ insert: commentInsert.insert }) as never)
      .mockImplementationOnce(() => ({ select: currentForWorkflow.select }) as never)
      .mockImplementationOnce(() => ({ update: ticketUpdate.update }) as never)
      .mockImplementationOnce(() => ({ select: approvalMetadata.select }) as never)
      .mockImplementationOnce(() => ({ insert: activityInsert.insert }) as never);

    const result = await submitRequesterTicketUpdate(
      current.id,
      { message: 'The signed form is attached.' },
      { userId: 'requester-1', companyId: 'company-1' },
    );

    expect(result.data?.status).toBe('pending_owner_review');
    expect(ticketUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending_owner_review',
      current_responsible_party: 'Owner',
      next_action: 'Owner to review requester response',
    }));
    expect(activityInsert.insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ event_type: 'requester_update_submitted' }),
      expect.objectContaining({ event_type: 'status_changed' }),
    ]));
  });

  it('moves owner completion to requester confirmation with the required completion controls', async () => {
    const current = workflowTicket('in_progress');
    const updated = {
      ...current,
      status: 'completed_by_owner' as const,
      current_responsible_party: 'Requester',
      next_action: 'Requester to confirm and close',
      resolution_note: 'Access restored and verified.',
      updated_at: '2099-01-15T11:00:00.000Z',
    };
    const currentForWorkflow = mockTicketFetch(current);
    const ticketUpdate = mockTicketUpdate(updated);
    const approvalMetadata = mockNoInternalRequestApprovalMetadata();
    const activityInsert = mockActivityInsert();

    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: currentForWorkflow.select }) as never)
      .mockImplementationOnce(() => ({ update: ticketUpdate.update }) as never)
      .mockImplementationOnce(() => ({ select: approvalMetadata.select }) as never)
      .mockImplementationOnce(() => ({ insert: activityInsert.insert }) as never);

    const result = await markTicketCompletedByOwner(
      current.id,
      {
        resolutionNote: 'Access restored and verified.',
        completionCategory: 'resolved',
        checklistConfirmed: true,
      },
      { userId: 'owner-1', companyId: 'company-1' },
    );

    expect(result.data?.status).toBe('completed_by_owner');
    expect(ticketUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed_by_owner',
      current_responsible_party: 'Requester',
      next_action: 'Requester to confirm and close',
      completion_category: 'resolved',
      completion_checklist_confirmed: true,
    }));
    expect(activityInsert.insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ event_type: 'owner_completed_request' }),
      expect.objectContaining({ event_type: 'status_changed' }),
    ]));
  });

  it('moves requester closure to Closed and persists feedback outside the active queue', async () => {
    const current = {
      ...workflowTicket('completed_by_owner'),
      resolution_note: 'Access restored and verified.',
    };
    const updated = {
      ...current,
      status: 'closed' as const,
      current_responsible_party: 'None',
      next_action: 'No further action',
      closed_at: '2099-01-15T11:30:00.000Z',
      updated_at: '2099-01-15T11:30:00.000Z',
    };
    const currentForWorkflow = mockTicketFetch(current);
    const ticketUpdate = mockTicketUpdate(updated);
    const approvalMetadata = mockNoInternalRequestApprovalMetadata();
    const workflowActivity = mockActivityInsert();
    const feedbackInsert = vi.fn().mockResolvedValue({ error: null });
    const feedbackActivity = mockActivityInsert();

    vi.mocked(supabase.from)
      .mockImplementationOnce(() => ({ select: currentForWorkflow.select }) as never)
      .mockImplementationOnce(() => ({ update: ticketUpdate.update }) as never)
      .mockImplementationOnce(() => ({ select: approvalMetadata.select }) as never)
      .mockImplementationOnce(() => ({ insert: workflowActivity.insert }) as never)
      .mockImplementationOnce(() => ({ insert: feedbackInsert }) as never)
      .mockImplementationOnce(() => ({ insert: feedbackActivity.insert }) as never);

    const result = await closeTicketByRequester(
      current.id,
      {
        confirmedResolved: true,
        satisfactionRating: 5,
        feedbackComment: 'Resolved promptly.',
      },
      { userId: 'requester-1', companyId: 'company-1' },
    );

    expect(result.data?.status).toBe('closed');
    expect(ticketUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'closed',
      current_responsible_party: 'None',
      next_action: 'No further action',
      closure_confirmed: true,
      satisfaction_rating: 5,
      closure_feedback: 'Resolved promptly.',
      closed_at: expect.any(String),
    }));
    expect(workflowActivity.insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ event_type: 'requester_closed_request' }),
      expect.objectContaining({ event_type: 'status_changed' }),
    ]));
    expect(feedbackInsert).toHaveBeenCalledWith(expect.objectContaining({
      requester_id: 'requester-1',
      confirmed_resolved: true,
      satisfaction_rating: 5,
    }));
  });

  it('blocks owner completion until Phase 2 closure controls are supplied', async () => {
    const missingSummary = await markTicketCompletedByOwner(
      'ticket-1',
      { resolutionNote: ' ', completionCategory: 'resolved', checklistConfirmed: true },
      { userId: 'owner-1', companyId: 'company-1' },
    );
    expect(missingSummary.error?.message).toBe('Resolution summary is required.');

    const missingChecklist = await markTicketCompletedByOwner(
      'ticket-1',
      { resolutionNote: 'Completed the request.', completionCategory: 'resolved', checklistConfirmed: false },
      { userId: 'owner-1', companyId: 'company-1' },
    );
    expect(missingChecklist.error?.message).toContain('Confirm the completion checklist');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('blocks requester closure and reopen without required confirmation data', async () => {
    const noConfirmation = await closeTicketByRequester(
      'ticket-1',
      { confirmedResolved: false, satisfactionRating: 5 },
      { userId: 'requester-1', companyId: 'company-1' },
    );
    expect(noConfirmation.error?.message).toBe('Confirm the request is resolved before closing it.');

    const badRating = await closeTicketByRequester(
      'ticket-1',
      { confirmedResolved: true, satisfactionRating: 0 },
      { userId: 'requester-1', companyId: 'company-1' },
    );
    expect(badRating.error?.message).toBe('Satisfaction rating must be between 1 and 5.');

    const noReopenReason = await reopenTicketByRequester(
      'ticket-1',
      { reason: ' ' },
      { userId: 'requester-1', companyId: 'company-1' },
    );
    expect(noReopenReason.error?.message).toBe('Reopen reason is required.');
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
