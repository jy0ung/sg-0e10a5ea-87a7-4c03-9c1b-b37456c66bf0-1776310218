import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRequestOperationalIndicators,
  bulkArchiveRequests,
  bulkNotifyRequestParticipants,
  bulkUpdateRequestPriority,
  getRequestManagementDashboard,
} from './requestManagementService';
import {
  listCompanyTickets,
  listTicketActivity,
  listTicketChatSummaries,
  type CompanyTicketRecord,
  type TicketActivityRecord,
} from './ticketService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('./ticketService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ticketService')>()),
  listCompanyTickets: vi.fn(),
  listTicketActivity: vi.fn(),
  listTicketChatSummaries: vi.fn(),
  updateTicket: vi.fn(),
}));

vi.mock('./notificationService', () => ({
  createNotifications: vi.fn(),
}));

vi.mock('./auditService', () => ({
  logUserAction: vi.fn(),
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    error: vi.fn(),
  },
}));

const baseTicket = {
  id: 'ticket-1',
  company_id: 'company-1',
  subject: 'Customer request',
  category: 'general',
  subcategory: null,
  priority: 'medium',
  status: 'pending_owner_review',
  description: 'A request that needs owner review.',
  requested_due_date: null,
  business_impact: null,
  desired_outcome: null,
  custom_fields: {},
  vso_number: null,
  submitted_by: 'requester-1',
  submitted_by_name: 'Requester',
  submitted_by_email: 'requester@example.com',
  assigned_to: 'owner-1',
  assigned_to_name: 'Owner',
  assigned_to_email: 'owner@example.com',
  backup_owner_id: 'backup-1',
  backup_owner_name: 'Backup',
  escalation_owner_id: 'escalation-1',
  escalation_owner_name: 'Escalation',
  responsible_queue: 'Owner',
  current_responsible_party: 'Owner',
  next_action: 'Owner to review requester response',
  status_changed_at: '2026-06-12T00:00:00.000Z',
  last_action_by: 'requester-1',
  last_action_by_name: 'Requester',
  sla_status: 'on_track',
  sla_paused_at: null,
  sla_pause_duration_ms: 0,
  sla_breach_reason: null,
  assigned_at: '2026-06-10T00:00:00.000Z',
  first_response_due_at: '2026-06-11T00:00:00.000Z',
  resolution_due_at: '2026-06-18T00:00:00.000Z',
  first_responded_at: '2026-06-10T02:00:00.000Z',
  approval_instance_id: null,
  approval_status: null,
  current_approval_step_name: null,
  current_approver_role: null,
  current_approver_user_id: null,
  resolved_at: null,
  resolution_note: null,
  completion_category: null,
  completion_checklist_confirmed: false,
  completion_attachment_required: false,
  closure_confirmed: null,
  satisfaction_rating: null,
  closure_feedback: null,
  closed_at: null,
  reopen_count: 1,
  reopened_at: '2026-06-11T00:00:00.000Z',
  last_reopen_reason: 'Issue returned',
  previous_owner_id: 'owner-1',
  created_at: '2026-06-10T00:00:00.000Z',
  updated_at: '2026-06-14T00:00:00.000Z',
} as CompanyTicketRecord;

const activities: TicketActivityRecord[] = [
  {
    id: 'a1',
    ticket_id: 'ticket-1',
    actor_id: 'owner-1',
    actor_name: 'Owner',
    event_type: 'status_changed',
    message: 'Status changed.',
    metadata: { before: 'in_progress', after: 'pending_requester' },
    created_at: '2026-06-10T04:00:00.000Z',
  },
  {
    id: 'a2',
    ticket_id: 'ticket-1',
    actor_id: 'requester-1',
    actor_name: 'Requester',
    event_type: 'status_changed',
    message: 'Status changed.',
    metadata: { before: 'pending_requester', after: 'pending_owner_review' },
    created_at: '2026-06-11T04:00:00.000Z',
  },
  {
    id: 'a3',
    ticket_id: 'ticket-1',
    actor_id: 'owner-2',
    actor_name: 'Owner 2',
    event_type: 'owner_changed',
    message: 'Owner changed.',
    metadata: { before: 'owner-1', after: 'owner-2' },
    created_at: '2026-06-12T00:00:00.000Z',
  },
  {
    id: 'a4',
    ticket_id: 'ticket-1',
    actor_id: 'requester-1',
    actor_name: 'Requester',
    event_type: 'requester_update_submitted',
    message: 'Requester replied.',
    metadata: {},
    created_at: '2026-06-11T04:00:00.000Z',
  },
];

describe('requestManagementService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('computes aging, bottleneck, handover, chat, and reopen indicators from activity', () => {
    vi.setSystemTime(new Date('2026-06-19T00:00:00.000Z'));

    const indicators = buildRequestOperationalIndicators(
      [baseTicket],
      { 'ticket-1': activities },
      { 'ticket-1': { ticket_id: 'ticket-1', message_count: 6, unread_count: 2, latest_message_at: '2026-06-18T00:00:00.000Z' } },
    );

    expect(indicators['ticket-1']).toMatchObject({
      handover_count: 1,
      requester_follow_up_count: 1,
      chat_message_count: 6,
      reopen_count: 1,
      stuck: true,
      stale: true,
      breached: true,
    });
    expect(indicators['ticket-1'].time_pending_requester_ms).toBe(24 * 60 * 60 * 1000);
    expect(indicators['ticket-1'].time_pending_owner_ms).toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
  });

  it('loads activity and chat summaries only for active dashboard requests', async () => {
    const activeTicket = { ...baseTicket, id: 'ticket-active', status: 'in_progress' } as CompanyTicketRecord;
    const closedTicket = {
      ...baseTicket,
      id: 'ticket-closed',
      status: 'closed',
      closed_at: '2026-06-18T00:00:00.000Z',
      resolved_at: '2026-06-17T00:00:00.000Z',
    } as CompanyTicketRecord;

    vi.mocked(listCompanyTickets).mockResolvedValue({
      data: [activeTicket, closedTicket],
      error: null,
    } as Awaited<ReturnType<typeof listCompanyTickets>>);
    vi.mocked(listTicketActivity).mockResolvedValue({
      data: { 'ticket-active': activities },
      error: null,
    } as Awaited<ReturnType<typeof listTicketActivity>>);
    vi.mocked(listTicketChatSummaries).mockResolvedValue({
      data: {
        'ticket-active': {
          ticket_id: 'ticket-active',
          message_count: 3,
          unread_count: 1,
          latest_message_at: '2026-06-18T00:00:00.000Z',
        },
      },
      error: null,
    } as Awaited<ReturnType<typeof listTicketChatSummaries>>);

    const result = await getRequestManagementDashboard('company-1', 'manager-1');

    expect(listTicketActivity).toHaveBeenCalledWith(['ticket-active'], 'company-1');
    expect(listTicketChatSummaries).toHaveBeenCalledWith(['ticket-active'], 'manager-1', 'company-1');
    expect(result.data).toMatchObject({
      total_pending: 1,
      completed: 1,
    });
    expect(result.data?.indicators_by_ticket['ticket-active']).toBeDefined();
    expect(result.data?.indicators_by_ticket['ticket-closed']).toBeUndefined();
  });

  it('requires explicit governance context before destructive or noisy bulk actions', async () => {
    await expect(
      bulkUpdateRequestPriority(['ticket-1'], 'high', '', { userId: 'admin-1', companyId: 'company-1' }),
    ).resolves.toMatchObject({ updated: 0, error: expect.any(Error) });

    await expect(
      bulkArchiveRequests(['ticket-1'], '', { userId: 'admin-1', companyId: 'company-1' }),
    ).resolves.toMatchObject({ updated: 0, error: expect.any(Error) });

    await expect(
      bulkNotifyRequestParticipants([baseTicket], { audience: 'owners', message: ' ' }, { userId: 'admin-1', companyId: 'company-1' }),
    ).resolves.toMatchObject({ notified: 0, error: expect.any(Error) });
  });
});
