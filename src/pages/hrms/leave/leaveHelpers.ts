import type { LeaveRequest } from '@/types';

/**
 * Pure helper: check if a leave request is assigned to a specific approver.
 * Extracted for testability.
 */
export function isRequestAssignedToApprover(
  request: LeaveRequest,
  approver: { id?: string; role?: string },
  isManager: boolean,
): boolean {
  if (request.status !== 'pending') return false;
  if (request.currentApproverUserId) {
    return request.currentApproverUserId === approver.id;
  }
  if (request.currentApproverRole) {
    return request.currentApproverRole === approver.role;
  }
  return isManager;
}

/**
 * Pure helper: filter leave requests by status and view mode.
 */
export function filterLeaveRequestsForView(
  requests: LeaveRequest[],
  statusFilter: string,
  viewMode: string,
  approver: { id?: string; role?: string },
  isManager: boolean,
): LeaveRequest[] {
  const filteredByStatus = statusFilter === 'all'
    ? requests
    : requests.filter(r => r.status === statusFilter);

  return viewMode === 'my_queue'
    ? filteredByStatus.filter(request => isRequestAssignedToApprover(request, approver, isManager))
    : filteredByStatus;
}
