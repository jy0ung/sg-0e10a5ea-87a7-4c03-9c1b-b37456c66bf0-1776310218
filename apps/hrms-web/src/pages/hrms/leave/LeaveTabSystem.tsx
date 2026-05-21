import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LeaveRequest, LeaveType, LeaveBalance } from '@/types';
import type { LeaveApprovalPreview } from '@/services/hrmsService';
import type { LeaveApproverIdentity } from '../LeaveManagement';
import { MyLeaveTab } from './MyLeaveTab';
import { TeamLeaveTab } from './TeamLeaveTab';
import { ApprovalInboxTab } from './ApprovalInboxTab';
import { LeaveCalendarTab } from './LeaveCalendarTab';

export type LeaveTabId = 'my-leave' | 'team-leave' | 'approval-inbox' | 'calendar';

interface LeaveTabSystemProps {
  activeTab: LeaveTabId;
  onTabChange: (tab: LeaveTabId) => void;
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  myActivePending: LeaveRequest[];
  myUpcoming: LeaveRequest[];
  myHistory: LeaveRequest[];
  approvalPreview: LeaveApprovalPreview | null;
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

const triggerClass =
  'h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none';

export function LeaveTabSystem({
  activeTab,
  onTabChange,
  leaveTypes,
  leaveBalances,
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
      <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b bg-transparent p-0">
        <TabsTrigger value="my-leave" className={triggerClass}>
          My Leave
          {myActivePending.length > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              {myActivePending.length}
            </span>
          )}
        </TabsTrigger>
        {canViewTeam && (
          <TabsTrigger value="team-leave" className={triggerClass}>
            Team Leave
          </TabsTrigger>
        )}
        {canApproveRequests && (
          <TabsTrigger value="approval-inbox" className={triggerClass}>
            Approval Inbox
            {pendingForMeCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-red-700 dark:bg-red-900/40 dark:text-red-400">
                {pendingForMeCount}
              </span>
            )}
          </TabsTrigger>
        )}
        {canViewTeam && (
          <TabsTrigger value="calendar" className={triggerClass}>
            Calendar
          </TabsTrigger>
        )}
      </TabsList>

      <div className="pt-5">
        <TabsContent value="my-leave" className="mt-0 animate-in fade-in-0 duration-150">
          <MyLeaveTab
            leaveTypes={leaveTypes}
            leaveBalances={leaveBalances}
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
          <TabsContent value="team-leave" className="mt-0 animate-in fade-in-0 duration-150">
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
          <TabsContent value="approval-inbox" className="mt-0 animate-in fade-in-0 duration-150">
            <ApprovalInboxTab onRefresh={onRefresh} />
          </TabsContent>
        )}

        {canViewTeam && (
          <TabsContent value="calendar" className="mt-0 animate-in fade-in-0 duration-150">
            <LeaveCalendarTab />
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}
