import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarRange, ClipboardCheck, Plus, ShieldCheck } from 'lucide-react';
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

  const activeTabMeta: Record<LeaveTabId, { label: string; description: string; icon: React.ElementType }> = {
    'my-leave': {
      label: 'My Leave',
      description: 'Track pending requests, approved time away, and history.',
      icon: CalendarRange,
    },
    'team-leave': {
      label: 'Team Leave',
      description: 'Monitor team coverage and upcoming absences.',
      icon: ClipboardCheck,
    },
    'approval-inbox': {
      label: 'Approval Inbox',
      description: 'Review only requests that currently need your decision.',
      icon: ShieldCheck,
    },
    calendar: {
      label: 'Leave Calendar',
      description: 'Plan around approved leave and team availability.',
      icon: CalendarRange,
    },
  };

  const activeMeta = activeTabMeta[activeTab];
  const ActiveIcon = activeMeta.icon;

  function setActiveTab(tab: LeaveTabId) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'my-leave') next.delete('tab');
      else next.set('tab', tab);
      return next;
    });
  }

  return (
    <div className="w-full space-y-5">
      <section className="surface-card hero-gradient px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ActiveIcon className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{activeMeta.label}</h1>
                {canApproveRequests && leaveData.pendingForMeCount > 0 && (
                  <Badge className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
                    {leaveData.pendingForMeCount} need action
                  </Badge>
                )}
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">{activeMeta.description}</p>
            </div>
          </div>

          <Button size="sm" className="gap-2 self-start shadow-sm lg:self-auto" onClick={() => setShowApply(true)}>
            <Plus className="h-4 w-4" />
            Apply for Leave
          </Button>
        </div>
      </section>

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

        {/* Context panel (mobile) */}
        <div className="lg:hidden">
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
