import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LeaveRequest, LeaveType, LeaveBalance } from '@/types';
import type { LeaveApprovalPreview, LeaveHoliday } from '@/services/hrmsService';
import type { LeaveApproverIdentity } from '../LeaveManagement';
import { MyLeaveTab } from './MyLeaveTab';
import { TeamLeaveTab } from './TeamLeaveTab';
import { ApprovalInboxTab } from './ApprovalInboxTab';
import { LeaveCalendarTab } from './LeaveCalendarTab';

export type LeaveTabId = 'my-leave' | 'team-leave' | 'approval-inbox' | 'calendar';

interface LeaveTabSystemProps {
  activeTab: LeaveTabId;
  onTabChange: (tab: LeaveTabId) => void;
  // My Leave props
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  holidays: LeaveHoliday[];
  myActivePending: LeaveRequest[];
  myUpcoming: LeaveRequest[];
  myHistory: LeaveRequest[];
  approvalPreview: LeaveApprovalPreview | null;
  // Team Leave props
  allRequests: LeaveRequest[];
  selfServiceEmployeeId: string | undefined;
  approverIdentity: LeaveApproverIdentity;
  canApproveRequests: boolean;
  canViewTeam: boolean;
  pendingForMeCount: number;
  isLoading: boolean;
  onApplyLeave: () => void;
  onRefresh: () => void;
}

export function LeaveTabSystem({
  activeTab,
  onTabChange,
  leaveTypes,
  leaveBalances,
  holidays,
  myActivePending,
  myUpcoming,
  myHistory,
  approvalPreview,
  allRequests,
  selfServiceEmployeeId,
  approverIdentity,
  canApproveRequests,
  canViewTeam,
  pendingForMeCount,
  isLoading,
  onApplyLeave,
  onRefresh,
}: LeaveTabSystemProps) {
  return (
    <Tabs value={activeTab} onValueChange={v => onTabChange(v as LeaveTabId)}>
      <TabsList className="h-auto flex-wrap gap-1 bg-card border rounded-lg p-1.5 justify-start">
        <TabsTrigger value="my-leave" className="relative text-sm">
          My Leave
          {myActivePending.length > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              {myActivePending.length}
            </span>
          )}
        </TabsTrigger>
        {canViewTeam && (
          <TabsTrigger value="team-leave" className="text-sm">Team Leave</TabsTrigger>
        )}
        {canApproveRequests && (
          <TabsTrigger value="approval-inbox" className="relative text-sm">
            Approval Inbox
            {pendingForMeCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-red-700 dark:bg-red-900/40 dark:text-red-400">
                {pendingForMeCount}
              </span>
            )}
          </TabsTrigger>
        )}
        {canViewTeam && (
          <TabsTrigger value="calendar" className="text-sm">Leave Calendar</TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="my-leave" className="mt-4 animate-in fade-in-0 duration-150">
        <MyLeaveTab
          leaveTypes={leaveTypes}
          leaveBalances={leaveBalances}
          holidays={holidays}
          myActivePending={myActivePending}
          myUpcoming={myUpcoming}
          myHistory={myHistory}
          approvalPreview={approvalPreview}
          isLoading={isLoading}
          onApplyLeave={onApplyLeave}
          onRefresh={onRefresh}
        />
      </TabsContent>

      {canViewTeam && (
        <TabsContent value="team-leave" className="mt-4 animate-in fade-in-0 duration-150">
          <TeamLeaveTab
            requests={allRequests}
            selfServiceEmployeeId={selfServiceEmployeeId}
            approverIdentity={approverIdentity}
            canApproveRequests={canApproveRequests}
            isLoading={isLoading}
            onRefresh={onRefresh}
          />
        </TabsContent>
      )}

      {canApproveRequests && (
        <TabsContent value="approval-inbox" className="mt-4 animate-in fade-in-0 duration-150">
          <ApprovalInboxTab onRefresh={onRefresh} />
        </TabsContent>
      )}

      {canViewTeam && (
        <TabsContent value="calendar" className="mt-4 animate-in fade-in-0 duration-150">
          <LeaveCalendarTab />
        </TabsContent>
      )}
    </Tabs>
  );
}
