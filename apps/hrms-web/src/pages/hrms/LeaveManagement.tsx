import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { matchesHrmsApproverRole, type HrmsApproverIdentity } from '@/lib/hrms/access';
import { useLeaveData } from '@/hooks/useLeaveData';
import type { LeaveDayPart, LeaveRequest, LeaveStatus } from '@/types';
import { type LeaveHoliday } from '@/services/hrmsService';
import { calculateLeaveDays as _calcLeaveDays } from './leave/utils';
import { SnapshotStrip } from './leave/SnapshotStrip';
import { LeaveTabSystem, type LeaveTabId } from './leave/LeaveTabSystem';
import { ContextPanel } from './leave/ContextPanel';
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

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export default function LeaveManagement() {
  const { user } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const [searchParams, setSearchParams] = useSearchParams();

  const canApproveRequests = hrmsAccess.canApproveRequests;
  const canViewTeam = canApproveRequests || hrmsAccess.canAccessEmployees;
  const selfServiceEmployeeId = user?.employeeId ?? user?.id;

  const approverIdentity: LeaveApproverIdentity = useMemo(() => ({
    id: user?.id,
    hrmsRoleIds:   hrmsAccess.roleIds,
    hrmsRoleCodes: hrmsAccess.roleCodes,
  }), [user?.id, hrmsAccess.roleIds, hrmsAccess.roleCodes]);

  const leaveData = useLeaveData();

  const [showApply, setShowApply] = useState(false);

  // Tab state persisted in URL
  const requestedTab = searchParams.get('tab') as LeaveTabId | null;
  const validTabs: LeaveTabId[] = ['my-leave', 'team-leave', 'approval-inbox', 'calendar'];
  const activeTab: LeaveTabId =
    requestedTab && validTabs.includes(requestedTab) &&
    (requestedTab !== 'team-leave' || canViewTeam) &&
    (requestedTab !== 'approval-inbox' || canApproveRequests) &&
    (requestedTab !== 'calendar' || canViewTeam)
      ? requestedTab
      : 'my-leave';

  function setActiveTab(tab: LeaveTabId) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'my-leave') next.delete('tab');
      else next.set('tab', tab);
      return next;
    });
  }

  return (
    <div className="w-full space-y-4">
      {/* Command Center Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">Leave Control Center</h1>
            <Badge className="shrink-0 rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
              {new Date().getFullYear()}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage requests, balances, and team approvals.
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1.5 self-start shadow-sm"
          onClick={() => setShowApply(true)}
        >
          <Plus className="h-4 w-4" />
          Apply for Leave
        </Button>
      </div>

      <SnapshotStrip
        leaveBalances={leaveData.leaveBalances}
        myActivePending={leaveData.myActivePending}
        myUpcoming={leaveData.myUpcoming}
        pendingForMeCount={leaveData.pendingForMeCount}
        teamOnLeaveToday={leaveData.teamOnLeaveToday}
        isManager={canApproveRequests || canViewTeam}
        isLoading={leaveData.isLoading}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Main tab area */}
        <div className="min-w-0 flex-1">
          <LeaveTabSystem
            activeTab={activeTab}
            onTabChange={setActiveTab}
            leaveTypes={leaveData.leaveTypes}
            leaveBalances={leaveData.leaveBalances}
            myActivePending={leaveData.myActivePending}
            myUpcoming={leaveData.myUpcoming}
            myHistory={leaveData.myHistory}
            approvalPreview={leaveData.approvalPreview}
            allRequests={leaveData.requests}
            selfServiceEmployeeId={selfServiceEmployeeId}
            approverIdentity={approverIdentity}
            canApproveRequests={canApproveRequests}
            canViewTeam={canViewTeam}
            pendingForMeCount={leaveData.pendingForMeCount}
            isLoading={leaveData.isLoading}
            onApplyLeave={() => setShowApply(true)}
            onRefresh={leaveData.invalidate}
          />
        </div>

        {/* Context panel (desktop) */}
        <div className="hidden w-80 shrink-0 lg:block xl:w-[22rem]">
          <ContextPanel
            leaveTypes={leaveData.leaveTypes}
            leaveBalances={leaveData.leaveBalances}
            approvalPreview={leaveData.approvalPreview}
            isLoading={leaveData.isLoading}
            onApplyLeave={() => setShowApply(true)}
          />
        </div>
      </div>

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
