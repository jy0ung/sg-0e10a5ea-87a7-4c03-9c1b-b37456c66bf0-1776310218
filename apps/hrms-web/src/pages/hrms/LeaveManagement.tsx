import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CalendarRange, Plus } from 'lucide-react';
import { matchesHrmsApproverRole, type HrmsApproverIdentity } from '@/lib/hrms/access';
import { useLeaveData } from '@/hooks/useLeaveData';
import type { LeaveDayPart, LeaveRequest, LeaveStatus } from '@/types';
import { type LeaveHoliday } from '@/services/hrmsService';
import { calculateLeaveDays as _calcLeaveDays } from './leave/utils';
import { MyLeaveTab } from './leave/MyLeaveTab';
import { ApplyLeaveDialog } from './leave/ApplyLeaveDialog';

// ─── Preserved exports (used by other modules) ───────────────────────────────

export type LeaveApproverIdentity = HrmsApproverIdentity;

// eslint-disable-next-line react-refresh/only-export-components
export function isRequestAssignedToApprover(
  request: LeaveRequest,
  approver: LeaveApproverIdentity,
  _canApproveRequests: boolean,
): boolean {
  if (request.status !== 'pending' || !approver) return false;
  if (request.currentApproverUserId) return request.currentApproverUserId === (approver as { id?: string | null }).id;
  if (request.currentApproverRole) return matchesHrmsApproverRole(request.currentApproverRole, approver);
  return false;
}

// eslint-disable-next-line react-refresh/only-export-components
export function filterLeaveRequestsForView(
  requests: LeaveRequest[],
  filterStatus: LeaveStatus | 'all',
  viewMode: 'all' | 'my_queue',
  approver: LeaveApproverIdentity,
  canApproveRequests: boolean,
): LeaveRequest[] {
  const filteredByStatus = filterStatus === 'all'
    ? requests
    : requests.filter(request => request.status === filterStatus);
  return viewMode === 'my_queue'
    ? filteredByStatus.filter(request => isRequestAssignedToApprover(request, approver, canApproveRequests))
    : filteredByStatus;
}

// eslint-disable-next-line react-refresh/only-export-components
export function calculateLeaveDays(
  startDate: string | undefined,
  endDate: string | undefined,
  dayPart: LeaveDayPart,
  holidays: LeaveHoliday[] = [],
): number {
  return _calcLeaveDays(startDate, endDate, dayPart, holidays);
}

// ─── My Leave (personal only) ─────────────────────────────────────────────────

export default function LeaveManagement() {
  const leaveData = useLeaveData();
  const [showApply, setShowApply] = useState(false);

  return (
    <div className="w-full space-y-3">
      <section className="surface-card px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarRange className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">My Leave</h1>
              <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
                Review your leave applications, dates, statuses, and approval progress.
              </p>
            </div>
          </div>

          <Button size="sm" className="h-8 gap-1.5 self-start shadow-sm sm:self-auto" onClick={() => setShowApply(true)}>
            <Plus className="h-4 w-4" />
            New request
          </Button>
        </div>
      </section>

      <MyLeaveTab
        myActivePending={leaveData.myActivePending}
        myUpcoming={leaveData.myUpcoming}
        myHistory={leaveData.myHistory}
        isLoading={leaveData.isLoading}
        onApplyLeave={() => setShowApply(true)}
      />

      <ApplyLeaveDialog
        open={showApply}
        onClose={() => setShowApply(false)}
        leaveTypes={leaveData.leaveTypes}
        leaveBalances={leaveData.leaveBalances}
        holidays={leaveData.holidays}
        employeeInfo={leaveData.employeeInfo}
        approvalPreview={leaveData.approvalPreview}
        onSuccess={leaveData.invalidate}
      />
    </div>
  );
}
