import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CalendarRange, ClipboardCheck, Plus, ShieldCheck } from 'lucide-react';
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
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/8 via-background to-background shadow-sm">
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-start lg:justify-between lg:px-6">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                Leave Operations
              </Badge>
              <Badge variant="outline" className="rounded-md px-2.5 py-0.5 text-[11px] font-medium">
                {new Date().getFullYear()}
              </Badge>
              {canApproveRequests && leaveData.pendingForMeCount > 0 && (
                <Badge className="rounded-md border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
                  {leaveData.pendingForMeCount} approval{leaveData.pendingForMeCount === 1 ? '' : 's'} need action
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Leave Control Center</h1>
              <p className="max-w-3xl text-sm text-muted-foreground sm:text-[15px]">
                A single workspace for self-service leave, team coverage, approval routing, and policy-aware planning.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border bg-background/80 px-3 py-1">Balances and policy checks stay live</span>
              <span className="rounded-full border bg-background/80 px-3 py-1">Approval routing preserved</span>
              <span className="rounded-full border bg-background/80 px-3 py-1">Role-aware tabs and queues</span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[17rem]">
            <div className="rounded-xl border bg-background/80 p-3 shadow-sm backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ActiveIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{activeMeta.label}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{activeMeta.description}</p>
                </div>
              </div>
            </div>

            <Button
              size="sm"
              className="gap-2 self-start shadow-sm sm:self-auto"
              onClick={() => setShowApply(true)}
            >
              <Plus className="h-4 w-4" />
              Apply for Leave
            </Button>
          </div>
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

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-xl border bg-card/70 p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Action Required</p>
              <p className="text-xs text-muted-foreground">
                {canApproveRequests
                  ? 'Monitor requests that need your decision and upcoming leave that affects team capacity.'
                  : 'Keep upcoming leave, remaining balances, and policy checks in one place.'}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={() => setActiveTab(canApproveRequests && leaveData.pendingForMeCount > 0 ? 'approval-inbox' : 'my-leave')}
            >
              Open focus view <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="rounded-xl border bg-card/70 p-4 shadow-sm lg:hidden xl:hidden">
          <ContextPanel
            leaveTypes={leaveData.leaveTypes}
            leaveBalances={leaveData.leaveBalances}
            approvalPreview={leaveData.approvalPreview}
            isLoading={leaveData.isLoading}
            onApplyLeave={() => setShowApply(true)}
          />
        </div>
      </div>

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
