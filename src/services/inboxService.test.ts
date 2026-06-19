import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  approvalToInbox,
  loadInbox,
  notificationToInbox,
  reconciliationToInbox,
  ticketToInbox,
} from './inboxService';
import * as notificationService from './notificationService';
import * as ticketService from './ticketService';
import * as reconciliationService from './reconciliationService';
import * as hrmsService from './hrmsService';
import type { ApprovalInboxItem } from '@/lib/hrms/approvalInbox';
import type { LeaveRequest, ReconciliationMatch } from '@/types';

vi.mock('./notificationService', () => ({
  getNotifications: vi.fn(),
}));
vi.mock('./ticketService', () => ({
  listMyTickets: vi.fn(),
}));
vi.mock('./reconciliationService', () => ({
  getReconciliationQueue: vi.fn(),
  getReconciliationStatusCounts: vi.fn(),
}));
vi.mock('./hrmsService', () => ({
  listLeaveRequests: vi.fn(),
  listPayrollRuns: vi.fn(),
  listAppraisals: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── mapping helpers ─────────────────────────────────────────────────────────

describe('approvalToInbox', () => {
  it('routes leave_request to /hrms/leave with amber tone', () => {
    const item: ApprovalInboxItem = {
      entityType: 'leave_request',
      entityId: 'leave-1',
      title: 'Alice · Annual Leave',
      subtitle: '2026-06-01 -> 2026-06-03 · 3 days',
      summary: 'Vacation',
      updatedAt: '2026-05-26T08:00:00Z',
      currentApprovalStepName: 'Manager',
      entity: { id: 'leave-1' } as LeaveRequest,
    };
    const out = approvalToInbox(item);
    expect(out).toMatchObject({
      id: 'approval:leave_request:leave-1',
      source: 'approval',
      href: '/hrms/leave',
      badge: 'Manager',
      badgeTone: 'amber',
    });
  });

  it('routes payroll_run to /hrms/payroll and appraisal to /hrms/appraisals', () => {
    expect(approvalToInbox({
      entityType: 'payroll_run', entityId: 'p1', title: 't', subtitle: 's', updatedAt: '2026-05-01T00:00:00Z',
      entity: {} as never,
    } as ApprovalInboxItem).href).toBe('/hrms/payroll');
    expect(approvalToInbox({
      entityType: 'appraisal', entityId: 'a1', title: 't', subtitle: 's', updatedAt: '2026-05-01T00:00:00Z',
      entity: {} as never,
    } as ApprovalInboxItem).href).toBe('/hrms/appraisals');
  });
});

describe('reconciliationToInbox', () => {
  const base: ReconciliationMatch = {
    id: 'm-1', objectType: 'sales_order', sourceSystem: 'dms',
    sourceTable: 'dms_raw_sales_orders', sourceRecordId: 'raw-1',
    canonicalTable: null, canonicalRecordId: null,
    matchStatus: 'candidate', confidenceScore: 0.9, matchRule: 'so_no',
    sourcePriority: 10, reviewOwner: null, reviewedAt: null,
    createdAt: '2026-05-25T00:00:00Z', updatedAt: '2026-05-26T00:00:00Z',
  };

  it('uses red tone for conflicts and amber for candidates', () => {
    expect(reconciliationToInbox({ ...base, matchStatus: 'conflict' }).badgeTone).toBe('red');
    expect(reconciliationToInbox({ ...base, matchStatus: 'candidate' }).badgeTone).toBe('amber');
  });

  it('builds deep link to /admin/reconciliation/:id', () => {
    expect(reconciliationToInbox(base).href).toBe('/admin/reconciliation/m-1');
  });
});

describe('ticketToInbox', () => {
  const baseTicket = {
    id: 't-1', company_id: 'co-1', subject: 'Need access', category: 'access' as never,
    subcategory: 'vpn', description: '', priority: 'high', status: 'open',
    custom_fields: {}, vso_number: null, requested_due_date: null, business_impact: null,
    desired_outcome: null, submitted_by: 'u-1', assigned_to: null, assigned_at: null,
    first_response_due_at: null, resolution_due_at: null, first_responded_at: null,
    approval_instance_id: null, approval_status: null, current_approval_step_name: null,
    current_approver_role: null, current_approver_user_id: null,
    resolved_at: null, resolution_note: null,
    created_at: '2026-05-26T00:00:00Z', updated_at: '2026-05-26T01:00:00Z',
    assigned_to_name: null, assigned_to_email: null,
  } as never;

  it('marks high/critical priority as red', () => {
    expect(ticketToInbox({ ...baseTicket, priority: 'high' }).badgeTone).toBe('red');
    expect(ticketToInbox({ ...baseTicket, priority: 'critical' }).badgeTone).toBe('red');
  });

  it('marks requester-action ticket statuses as amber regardless of priority', () => {
    expect(ticketToInbox({ ...baseTicket, priority: 'low', status: 'pending_requester' }).badgeTone).toBe('amber');
    expect(ticketToInbox({ ...baseTicket, priority: 'critical', status: 'completed_by_owner' }).badgeTone).toBe('amber');
  });
});

describe('notificationToInbox', () => {
  it('maps unread + tone by type', () => {
    const n = notificationToInbox({
      id: 'n-1', user_id: 'u-1', title: 't', message: 'm', type: 'warning',
      read: false, created_at: '2026-05-26T00:00:00Z',
    });
    expect(n).toMatchObject({ id: 'notification:n-1', unread: true, badgeTone: 'amber' });
  });
});

// ── loadInbox ───────────────────────────────────────────────────────────────

describe('loadInbox', () => {
  it('skips reconciliation pulls when includeReconciliation is false', async () => {
    vi.mocked(hrmsService.listLeaveRequests).mockResolvedValue({ data: [], error: null });
    vi.mocked(hrmsService.listPayrollRuns).mockResolvedValue({ data: [], error: null });
    vi.mocked(hrmsService.listAppraisals).mockResolvedValue({ data: [], error: null });
    vi.mocked(ticketService.listMyTickets).mockResolvedValue({ data: [], error: null });
    vi.mocked(notificationService.getNotifications).mockResolvedValue({ data: [], error: null });
    const reconSpy = vi.mocked(reconciliationService.getReconciliationQueue);

    const bundle = await loadInbox('co-1', {
      approver: null,
      userId: 'u-1',
      includeReconciliation: false,
    });

    expect(reconSpy).not.toHaveBeenCalled();
    expect(bundle.counts.total).toBe(0);
  });

  it('aggregates and sorts items by updatedAt desc, counts unread notifications only', async () => {
    vi.mocked(hrmsService.listLeaveRequests).mockResolvedValue({ data: [], error: null });
    vi.mocked(hrmsService.listPayrollRuns).mockResolvedValue({ data: [], error: null });
    vi.mocked(hrmsService.listAppraisals).mockResolvedValue({ data: [], error: null });
    vi.mocked(ticketService.listMyTickets).mockResolvedValue({
      data: [{
        id: 't-1', subject: 'Old ticket', category: 'access', subcategory: null,
        priority: 'medium', status: 'open', description: '', custom_fields: {},
        vso_number: null, requested_due_date: null, business_impact: null, desired_outcome: null,
        company_id: 'co-1', submitted_by: 'u-1', assigned_to: null, assigned_at: null,
        first_response_due_at: null, resolution_due_at: null, first_responded_at: null,
        approval_instance_id: null, approval_status: null, current_approval_step_name: null,
        current_approver_role: null, current_approver_user_id: null,
        resolved_at: null, resolution_note: null,
        created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:00Z',
        assigned_to_name: null, assigned_to_email: null,
      }] as never,
      error: null,
    });
    vi.mocked(notificationService.getNotifications).mockResolvedValue({
      data: [
        { id: 'n-1', user_id: 'u-1', title: 'newer', message: 'm', type: 'info', read: false, created_at: '2026-05-26T00:00:00Z' },
        { id: 'n-2', user_id: 'u-1', title: 'old read', message: 'm', type: 'info', read: true, created_at: '2026-05-10T00:00:00Z' },
      ],
      error: null,
    });
    vi.mocked(reconciliationService.getReconciliationQueue).mockResolvedValue({ data: [], error: null });
    vi.mocked(reconciliationService.getReconciliationStatusCounts).mockResolvedValue({ data: [], error: null });

    const bundle = await loadInbox('co-1', {
      approver: null,
      userId: 'u-1',
      includeReconciliation: true,
    });

    expect(bundle.items[0]!.id).toBe('notification:n-1');
    expect(bundle.counts.notification).toBe(1); // unread only
    expect(bundle.counts.ticket).toBe(1);
  });

  it('filters out resolved tickets and non-action reconciliation rows', async () => {
    vi.mocked(hrmsService.listLeaveRequests).mockResolvedValue({ data: [], error: null });
    vi.mocked(hrmsService.listPayrollRuns).mockResolvedValue({ data: [], error: null });
    vi.mocked(hrmsService.listAppraisals).mockResolvedValue({ data: [], error: null });
    vi.mocked(ticketService.listMyTickets).mockResolvedValue({
      data: [
        { id: 't-resolved', status: 'resolved', priority: 'low', subject: 'done', category: 'access', subcategory: null, updated_at: '2026-05-26T00:00:00Z', company_id: 'co-1' } as never,
        { id: 't-open',     status: 'open',     priority: 'low', subject: 'open', category: 'access', subcategory: null, updated_at: '2026-05-26T00:00:00Z', company_id: 'co-1' } as never,
      ] as never,
      error: null,
    });
    vi.mocked(notificationService.getNotifications).mockResolvedValue({ data: [], error: null });
    vi.mocked(reconciliationService.getReconciliationQueue).mockResolvedValue({
      data: [
        { id: 'm-accepted', matchStatus: 'accepted', objectType: 'sales_order', sourceSystem: 'dms',
          sourceTable: 't', sourceRecordId: 'r', canonicalTable: null, canonicalRecordId: null,
          confidenceScore: null, matchRule: null, sourcePriority: 0, reviewOwner: null, reviewedAt: null,
          createdAt: '2026-05-26T00:00:00Z', updatedAt: '2026-05-26T00:00:00Z' },
        { id: 'm-conflict', matchStatus: 'conflict', objectType: 'sales_order', sourceSystem: 'dms',
          sourceTable: 't', sourceRecordId: 'r', canonicalTable: null, canonicalRecordId: null,
          confidenceScore: null, matchRule: null, sourcePriority: 0, reviewOwner: null, reviewedAt: null,
          createdAt: '2026-05-26T00:00:00Z', updatedAt: '2026-05-26T00:00:00Z' },
      ],
      error: null,
    });
    vi.mocked(reconciliationService.getReconciliationStatusCounts).mockResolvedValue({
      data: [
        { matchStatus: 'conflict', total: 1 },
        { matchStatus: 'accepted', total: 1 },
      ],
      error: null,
    });

    const bundle = await loadInbox('co-1', { approver: null, userId: 'u-1', includeReconciliation: true });

    expect(bundle.items.map(i => i.id)).toEqual(
      expect.arrayContaining(['ticket:t-open', 'reconciliation:m-conflict']),
    );
    expect(bundle.items.find(i => i.id === 'ticket:t-resolved')).toBeUndefined();
    expect(bundle.items.find(i => i.id === 'reconciliation:m-accepted')).toBeUndefined();
    expect(bundle.counts.reconciliation).toBe(1); // counted from status-counts conflict only
  });

  it('collects per-source errors instead of throwing', async () => {
    vi.mocked(hrmsService.listLeaveRequests).mockResolvedValue({ data: [], error: 'leave boom' });
    vi.mocked(hrmsService.listPayrollRuns).mockResolvedValue({ data: [], error: null });
    vi.mocked(hrmsService.listAppraisals).mockResolvedValue({ data: [], error: null });
    vi.mocked(ticketService.listMyTickets).mockResolvedValue({ data: null, error: new Error('ticket boom') });
    vi.mocked(notificationService.getNotifications).mockResolvedValue({ data: [], error: null });

    const bundle = await loadInbox('co-1', { approver: null, userId: 'u-1', includeReconciliation: false });

    expect(bundle.errors.some(e => e.includes('leave boom'))).toBe(true);
    expect(bundle.errors.some(e => e.includes('ticket boom'))).toBe(true);
  });
});
