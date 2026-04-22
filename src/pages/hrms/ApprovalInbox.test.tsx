import { describe, expect, it } from 'vitest';
import type { Appraisal, LeaveRequest, PayrollRun } from '@/types';
import {
  buildApprovalInboxItems,
  filterApprovalInboxItems,
  isApprovalAssignedToApprover,
} from '@/lib/hrms/approvalInbox';

function makeLeaveRequest(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 'leave-1',
    companyId: 'c1',
    employeeId: 'emp-1',
    employeeName: 'Aisyah Rahman',
    leaveTypeId: 'lt-1',
    leaveTypeName: 'Annual Leave',
    startDate: '2026-04-25',
    endDate: '2026-04-26',
    days: 2,
    status: 'pending',
    approvalInstanceId: 'ai-leave-1',
    approvalInstanceStatus: 'pending',
    currentApprovalStepOrder: 1,
    currentApprovalStepName: 'Manager Review',
    currentApproverUserId: 'user-1',
    currentApproverRole: undefined,
    approvalHistory: [],
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
    ...overrides,
  };
}

function makePayrollRun(overrides: Partial<PayrollRun> = {}): PayrollRun {
  return {
    id: 'pay-1',
    companyId: 'c1',
    periodYear: 2026,
    periodMonth: 4,
    status: 'draft',
    approvalInstanceId: 'ai-pay-1',
    approvalInstanceStatus: 'pending',
    currentApprovalStepOrder: 1,
    currentApprovalStepName: 'GM Review',
    currentApproverRole: 'general_manager',
    currentApproverUserId: undefined,
    approvalHistory: [],
    totalHeadcount: 24,
    totalGross: 50000,
    totalNet: 42000,
    createdBy: 'admin-1',
    createdAt: '2026-04-19T00:00:00.000Z',
    updatedAt: '2026-04-22T00:00:00.000Z',
    ...overrides,
  };
}

function makeAppraisal(overrides: Partial<Appraisal> = {}): Appraisal {
  return {
    id: 'app-1',
    companyId: 'c1',
    title: 'Annual Review 2026',
    cycle: 'annual',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    status: 'in_progress',
    approvalInstanceId: 'ai-app-1',
    approvalInstanceStatus: 'pending',
    currentApprovalStepOrder: 1,
    currentApprovalStepName: 'GM Review',
    currentApproverRole: 'general_manager',
    currentApproverUserId: undefined,
    approvalHistory: [],
    createdBy: 'manager-1',
    createdAt: '2026-04-18T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('isApprovalAssignedToApprover', () => {
  it('matches specific-user assignments without requiring a manager role', () => {
    expect(isApprovalAssignedToApprover({
      approvalInstanceStatus: 'pending',
      currentApproverUserId: 'accounts-1',
      currentApproverRole: undefined,
    }, { id: 'accounts-1', role: 'accounts' })).toBe(true);
  });

  it('ignores non-pending approvals', () => {
    expect(isApprovalAssignedToApprover({
      approvalInstanceStatus: 'rejected',
      currentApproverUserId: 'user-1',
      currentApproverRole: undefined,
    }, { id: 'user-1', role: 'manager' })).toBe(false);
  });
});

describe('buildApprovalInboxItems', () => {
  it('merges leave and payroll approvals assigned to the current approver and sorts by newest first', () => {
    const items = buildApprovalInboxItems(
      [
        makeLeaveRequest(),
        makeLeaveRequest({
          id: 'leave-2',
          currentApproverUserId: 'someone-else',
          updatedAt: '2026-04-23T00:00:00.000Z',
        }),
      ],
      [makePayrollRun()],
      [makeAppraisal()],
      { id: 'user-1', role: 'general_manager' },
    );

    expect(items.map(item => `${item.entityType}:${item.entityId}`)).toEqual([
      'appraisal:app-1',
      'payroll_run:pay-1',
      'leave_request:leave-1',
    ]);
  });

  it('filters by entity type after building the inbox', () => {
    const items = buildApprovalInboxItems(
      [makeLeaveRequest()],
      [makePayrollRun()],
      [makeAppraisal()],
      { id: 'user-1', role: 'general_manager' },
    );

    expect(filterApprovalInboxItems(items, 'leave_request')).toHaveLength(1);
    expect(filterApprovalInboxItems(items, 'payroll_run')).toHaveLength(1);
    expect(filterApprovalInboxItems(items, 'appraisal')).toHaveLength(1);
    expect(filterApprovalInboxItems(items, 'all')).toHaveLength(3);
  });
});