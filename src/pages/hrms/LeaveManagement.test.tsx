import { describe, it, expect } from 'vitest';
import type { LeaveRequest } from '@/types';
import { filterLeaveRequestsForView, isRequestAssignedToApprover } from './LeaveManagement';

function makeRequest(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 'req-1',
    companyId: 'c1',
    employeeId: 'emp-1',
    employeeName: 'Ahmad Ibrahim',
    leaveTypeId: 'lt-1',
    leaveTypeName: 'Annual Leave',
    startDate: '2026-04-24',
    endDate: '2026-04-24',
    days: 1,
    status: 'pending',
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('LeaveManagement queue helpers', () => {
  it('matches a request assigned to the current approver user', () => {
    const request = makeRequest({ currentApproverUserId: 'manager-1' });

    expect(isRequestAssignedToApprover(request, { id: 'manager-1', role: 'manager' }, true)).toBe(true);
    expect(isRequestAssignedToApprover(request, { id: 'manager-2', role: 'manager' }, true)).toBe(false);
  });

  it('matches a specific-user assignment even when the approver is not in a manager role', () => {
    const request = makeRequest({ currentApproverUserId: 'accounts-1' });

    expect(isRequestAssignedToApprover(request, { id: 'accounts-1', role: 'accounts' }, false)).toBe(true);
  });

  it('filters the my queue view down to assigned pending requests only', () => {
    const requests = [
      makeRequest({ id: 'req-1', employeeName: 'Ahmad Ibrahim', currentApproverUserId: 'manager-1' }),
      makeRequest({ id: 'req-2', employeeName: 'Farah Nordin', currentApproverRole: 'general_manager' }),
      makeRequest({ id: 'req-3', employeeName: 'Suresh Kumar', status: 'approved', currentApproverUserId: 'manager-1' }),
    ];

    const filtered = filterLeaveRequestsForView(
      requests,
      'all',
      'my_queue',
      { id: 'manager-1', role: 'manager' },
      true,
    );

    expect(filtered.map(request => request.id)).toEqual(['req-1']);
  });
});