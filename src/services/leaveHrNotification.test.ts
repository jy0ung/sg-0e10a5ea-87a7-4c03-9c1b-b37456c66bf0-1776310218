/**
 * Unit tests for the HR leave-decision notification helper in
 * packages/hrms-services/src/leave/leaveService.ts.
 *
 * We import reviewLeaveRequest directly from the package (not from the main-app
 * wrapper) so the real notification code runs. The Supabase client is mocked
 * via @flc/supabase to intercept all DB calls without a live instance.
 *
 * Because notifyHrUsersOfLeaveDecision is fire-and-forget (void promise), we
 * use vi.waitFor() to poll until the notification insert lands.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewLeaveRequest } from '@flc/hrms-services';

// ─── Shared mock state ────────────────────────────────────────────────────────

type QueuedResult = { data: unknown; error: { message: string } | null };

const queuedResults: QueuedResult[] = [];
const insertCalls: Array<{ table: string; values: unknown }> = [];

function queueResolves(...results: QueuedResult[]) {
  queuedResults.push(...results);
}

function drainResolve(): QueuedResult {
  return queuedResults.shift() ?? { data: null, error: null };
}

// ─── @flc/supabase mock ───────────────────────────────────────────────────────
// Intercepts every .from() call and returns a chainable proxy whose terminal
// methods (.single, .maybeSingle, .then) drain from the shared queue.
vi.mock('@flc/supabase', () => {
  function makeProxy(table: string): any {
    const proxy: Record<string, any> = {};

    proxy.select  = (..._a: unknown[]) => proxy;
    proxy.eq      = (..._a: unknown[]) => proxy;
    proxy.in      = (..._a: unknown[]) => proxy;
    proxy.or      = (..._a: unknown[]) => proxy;
    proxy.not     = (..._a: unknown[]) => proxy;
    proxy.order   = (..._a: unknown[]) => proxy;
    proxy.limit   = (..._a: unknown[]) => proxy;
    proxy.delete  = (..._a: unknown[]) => proxy;
    proxy.upsert  = (..._a: unknown[]) => proxy;

    proxy.update = (_v: unknown) => proxy;

    proxy.insert = (values: unknown) => {
      insertCalls.push({ table, values });
      return proxy;
    };

    proxy.single      = () => Promise.resolve(drainResolve());
    proxy.maybeSingle = () => Promise.resolve(drainResolve());
    proxy.then = (
      resolve: (v: QueuedResult) => unknown,
      reject?: (r: unknown) => unknown,
    ) => Promise.resolve(drainResolve()).then(resolve, reject);

    return proxy;
  }

  return {
    supabase: {
      from: (table: string) => makeProxy(table),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    },
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Queues every DB response consumed by a complete single-step leave-review
 * flow, including the notification side-effect queries.
 *
 * The step is configured as `specific_user` so userMatchesAssignedApproverRole
 * is never called (no extra DB queries needed for the role check).
 */
function queueSingleStepReview(opts: {
  decision: 'approved' | 'rejected';
  includeHrRole?: boolean;
  hrAssigneeProfileId?: string;
}) {
  const { decision: _decision, includeHrRole = true, hrAssigneeProfileId = 'hr-user-1' } = opts;

  // 1. leave_requests — fetch owner + company for reviewLeaveRequest
  queueResolves({ data: { employee_id: 'requester-1', company_id: 'c1' }, error: null });

  // 2. profiles — resolveRequiredProfileId: direct profile-id match
  queueResolves({ data: { id: 'requester-1' }, error: null });

  // 3. approval_instances — load pending instance (reviewer is specific user)
  queueResolves({
    data: {
      id: 'instance-1',
      flow_id: 'flow-1',
      requester_id: 'requester-1',
      status: 'pending',
      current_step_id: 'step-1',
      current_step_order: 1,
      current_step_name: 'Manager Review',
      current_approver_role: null,
      current_approver_user_id: 'reviewer-1',
    },
    error: null,
  });

  // 4. approval_steps — single step (no next step → final decision)
  queueResolves({
    data: [
      {
        id: 'step-1',
        step_order: 1,
        name: 'Manager Review',
        approver_type: 'specific_user',
        approver_role: null,
        approver_user_id: 'reviewer-1',
        fallback_approver_user_id: null,
        escalation_rule: null,
        condition_rule: null,
        is_active: true,
        allow_self_approval: false,
      },
    ],
    error: null,
  });

  // 5. approval_decisions.insert
  queueResolves({ data: null, error: null });

  // 6. approval_instances.update — finalise instance
  queueResolves({ data: null, error: null });

  // 7. leave_requests.update — updateEntityStatus callback
  queueResolves({ data: null, error: null });

  // ── notifyHrUsersOfLeaveDecision (fire-and-forget) ─────────────────────────

  // 8. leave_requests — fetch details for notification message
  queueResolves({
    data: {
      start_date: '2026-06-01',
      end_date: '2026-06-05',
      days: 5,
      leave_types: { name: 'Annual Leave' },
    },
    error: null,
  });

  // 9. profiles — fetch requester display name
  queueResolves({ data: { name: 'Ahmad Zain' }, error: null });

  // 10. hrms_roles — resolve HR role IDs for the company
  queueResolves({
    data: includeHrRole ? [{ id: 'hr-role-1' }] : [],
    error: null,
  });

  if (!includeHrRole) return; // function returns early after empty hrRoleIds

  // 11. employee_hrms_role_assignments — active HR assignees
  queueResolves({ data: [{ profile_id: hrAssigneeProfileId }], error: null });

  // 12. notifications.insert (queue a drain target even if it may not be consumed)
  queueResolves({ data: null, error: null });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  queuedResults.length = 0;
  insertCalls.length = 0;
});

describe('HR leave-decision notification (via reviewLeaveRequest)', () => {
  it('inserts info-type notifications for active HR users on final approval', async () => {
    queueSingleStepReview({ decision: 'approved', hrAssigneeProfileId: 'hr-user-1' });

    await reviewLeaveRequest({ requestId: 'leave-1', reviewerId: 'reviewer-1', decision: 'approved' });

    // The notification is fire-and-forget; poll until the insert lands.
    await vi.waitFor(() => {
      expect(insertCalls.find(c => c.table === 'notifications')).toBeDefined();
    });

    const notif = insertCalls.find(c => c.table === 'notifications')!;
    expect(notif.values).toMatchObject([
      expect.objectContaining({
        user_id: 'hr-user-1',
        title: 'Leave Approved',
        type: 'info',
        read: false,
      }),
    ]);
    const message = (notif.values as Array<{ message: string }>)[0]?.message;
    expect(message).toContain('Ahmad Zain');
    expect(message).toContain('5 days');
    expect(message).toContain('Annual Leave');
    expect(message).toContain('approved');
  });

  it('inserts warning-type notifications on final rejection', async () => {
    queueSingleStepReview({ decision: 'rejected', hrAssigneeProfileId: 'hr-user-1' });

    await reviewLeaveRequest({ requestId: 'leave-1', reviewerId: 'reviewer-1', decision: 'rejected' });

    await vi.waitFor(() => {
      expect(insertCalls.find(c => c.table === 'notifications')).toBeDefined();
    });

    const notif = insertCalls.find(c => c.table === 'notifications')!;
    expect(notif.values).toMatchObject([
      expect.objectContaining({ title: 'Leave Rejected', type: 'warning', read: false }),
    ]);
    const message = (notif.values as Array<{ message: string }>)[0]?.message;
    expect(message).toContain('rejected');
  });

  it('sends no notification when no HR roles are configured for the company', async () => {
    queueSingleStepReview({ decision: 'approved', includeHrRole: false });

    await reviewLeaveRequest({ requestId: 'leave-1', reviewerId: 'reviewer-1', decision: 'approved' });

    // Give the async notification path time to settle before asserting absence.
    await new Promise<void>(resolve => setTimeout(resolve, 50));

    expect(insertCalls.find(c => c.table === 'notifications')).toBeUndefined();
  });

  it('excludes the leave requester from HR notifications when they hold an HR role', async () => {
    // hr-user-1 happens to be the same profile as the requester.
    queueSingleStepReview({ decision: 'approved', hrAssigneeProfileId: 'requester-1' });

    await reviewLeaveRequest({ requestId: 'leave-1', reviewerId: 'reviewer-1', decision: 'approved' });

    await new Promise<void>(resolve => setTimeout(resolve, 50));

    expect(insertCalls.find(c => c.table === 'notifications')).toBeUndefined();
  });
});
