import { useState, useMemo, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useLeaveData } from '@/hooks/useLeaveData';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { reviewLeaveRequest } from '@/services/hrmsService';

import { Loader2, CalendarPlus, Settings } from 'lucide-react';

import type { LeaveRequest, PendingApproval } from '@/types';

// Sub-components
import SnapshotStrip from './leave/SnapshotStrip';
import ContextPanel from './leave/ContextPanel';
import MyLeaveTab from './leave/MyLeaveTab';
import TeamLeaveTab from './leave/TeamLeaveTab';
import ApprovalInboxTab from './leave/ApprovalInboxTab';
import LeaveCalendarTab from './leave/LeaveCalendarTab';
import LeaveBalanceCards from './leave/LeaveBalanceCards';
import LeaveRequestDrawer from './leave/LeaveRequestDrawer';
import ApplyLeaveDialog from './leave/ApplyLeaveDialog';
import ReviewDialog from './leave/ReviewDialog';

import { isRequestAssignedToApprover } from './leave/leaveHelpers';


// ─── Main Component ────────────────────────────────────────────────────────

export default function LeaveManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const {
    requests,
    leaveTypes,
    leaveBalances,
    pendingApprovals,
    myRequests,
    myPendingRequests,
    myUpcomingLeave,
    teamOnLeaveToday,
    myQueueCount,
    isManager,
    isApprover,
    isAdmin,
    canAccessApprovalInbox,
    isLoading,
  } = useLeaveData();

  // ─── State ─────────────────────────────────────────────────────────

  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null);

  // ─── Handlers ──────────────────────────────────────────────────────

  const openDrawer = useCallback((req: LeaveRequest) => {
    setSelectedRequest(req);
    setDrawerOpen(true);
  }, []);

  const startReview = useCallback((action: 'approved' | 'rejected', requestId: string) => {
    setReviewAction(action);
    setReviewRequestId(requestId);
    setDrawerOpen(false);
    setReviewOpen(true);
  }, []);

  const handleCancelRequest = useCallback(async () => {
    if (!selectedRequest || !user) return;
    const { error } = await reviewLeaveRequest(selectedRequest.id, user.id, 'cancelled');
    if (error) {
      toast({ title: 'Error', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Request cancelled' });
    setDrawerOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['leave-control-center'] });
  }, [selectedRequest, user, toast, queryClient]);

  // Determine if current user can review the selected request
  const canReviewSelected = useMemo(() => {
    if (!selectedRequest || !user || !isApprover) return false;
    if (selectedRequest.status !== 'pending') return false;
    if (selectedRequest.employeeId === user.id || selectedRequest.employeeId === user.employeeId) return false;
    return isRequestAssignedToApprover(selectedRequest, { id: user.id, role: user.role }, isManager);
  }, [selectedRequest, user, isApprover, isManager]);

  // Handle approval inbox actions
  const handleInboxApprove = useCallback((pa: PendingApproval) => {
    startReview('approved', pa.entityId);
  }, [startReview]);

  const handleInboxReject = useCallback((pa: PendingApproval) => {
    startReview('rejected', pa.entityId);
  }, [startReview]);

  const handleInboxViewDetails = useCallback((pa: PendingApproval) => {
    // Find the matching leave request for full detail view
    const req = requests.find(r => r.id === pa.entityId);
    if (req) openDrawer(req);
  }, [requests, openDrawer]);

  // ─── Determine available tabs ──────────────────────────────────────

  const tabs = useMemo(() => {
    const list: { id: string; label: string; badge?: number }[] = [
      { id: 'my-leave', label: 'My Leave' },
    ];
    if (isManager) {
      list.push({ id: 'team-leave', label: 'Team Leave', badge: teamOnLeaveToday.length || undefined });
    }
    if (canAccessApprovalInbox && myQueueCount > 0) {
      list.push({ id: 'approval-inbox', label: 'Approvals', badge: myQueueCount });
    }
    if (isManager) {
      list.push({ id: 'calendar', label: 'Calendar' });
    }
    return list;
  }, [isManager, canAccessApprovalInbox, myQueueCount, teamOnLeaveToday.length]);

  // ─── Loading ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const selfEmployeeId = user?.employeeId ?? user?.id ?? '';
  const companyId = user?.companyId ?? '';

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Leave Control Center"
        description="Manage leave applications, approvals, and team schedules"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Leave' }]}
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5" asChild>
                <a href="/settings">
                  <Settings className="h-3.5 w-3.5" /> Settings
                </a>
              </Button>
            )}
            {isMobile && (
              <Button size="sm" className="gap-1.5" onClick={() => setApplyDialogOpen(true)}>
                <CalendarPlus className="h-3.5 w-3.5" /> Apply
              </Button>
            )}
          </div>
        }
      />

      {/* Snapshot Strip */}
      <SnapshotStrip
        balances={leaveBalances}
        pendingCount={myPendingRequests.length}
        upcomingLeave={myUpcomingLeave}
        myQueueCount={myQueueCount}
        teamOnLeaveTodayCount={teamOnLeaveToday.length}
        isManager={isManager}
        canAccessApprovalInbox={canAccessApprovalInbox}
      />

      {/* Main Content: Tabs + Context Panel */}
      <div className="flex gap-5 items-start">
        {/* Tab Content (main area) */}
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="my-leave" className="space-y-3">
            <TabsList className="bg-muted/50 p-0.5">
              {tabs.map(tab => (
                <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1.5 relative data-[state=active]:shadow-sm">
                  {tab.label}
                  {tab.badge != null && tab.badge > 0 && (
                    <Badge variant="outline" className="ml-1 h-4 min-w-4 text-[9px] px-1 bg-primary/10 text-primary border-0">
                      {tab.badge}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="my-leave" className="mt-0">
              <MyLeaveTab
                requests={myRequests}
                pendingRequests={myPendingRequests}
                upcomingLeave={myUpcomingLeave}
                balances={leaveBalances}
                leaveTypes={leaveTypes}
                onRequestClick={openDrawer}
                onApplyLeave={() => setApplyDialogOpen(true)}
              />
            </TabsContent>

            {isManager && (
              <TabsContent value="team-leave" className="mt-0">
                <TeamLeaveTab
                  requests={requests}
                  teamOnLeaveToday={teamOnLeaveToday}
                  onRequestClick={openDrawer}
                />
              </TabsContent>
            )}

            {canAccessApprovalInbox && (
              <TabsContent value="approval-inbox" className="mt-0">
                <ApprovalInboxTab
                  approvals={pendingApprovals}
                  onApprove={handleInboxApprove}
                  onReject={handleInboxReject}
                  onViewDetails={handleInboxViewDetails}
                />
              </TabsContent>
            )}

            {isManager && (
              <TabsContent value="calendar" className="mt-0">
                <LeaveCalendarTab />
              </TabsContent>
            )}
          </Tabs>

          {/* Mobile-only balance section */}
          {isMobile && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Leave Balances
              </h3>
              <LeaveBalanceCards balances={leaveBalances} leaveTypes={leaveTypes} />
            </div>
          )}
        </div>

        {/* Context Panel (desktop only) */}
        {!isMobile && (
          <aside className="w-72 xl:w-80 shrink-0 sticky top-4">
            <div className="rounded-lg border border-border/60 bg-card/50 p-4">
              <ContextPanel
                balances={leaveBalances}
                leaveTypes={leaveTypes}
                onApplyLeave={() => setApplyDialogOpen(true)}
                isManager={isManager}
              />
            </div>
          </aside>
        )}
      </div>

      {/* Dialogs & Drawers */}
      <ApplyLeaveDialog
        open={applyDialogOpen}
        onOpenChange={setApplyDialogOpen}
        leaveTypes={leaveTypes}
        employeeId={selfEmployeeId}
        companyId={companyId}
      />

      <LeaveRequestDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        request={selectedRequest}
        canReview={canReviewSelected}
        onApprove={() => startReview('approved', selectedRequest?.id ?? '')}
        onReject={() => startReview('rejected', selectedRequest?.id ?? '')}
        onCancel={handleCancelRequest}
        currentUserId={user?.employeeId ?? user?.id}
      />

      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        requestId={reviewRequestId}
        action={reviewAction}
        userId={user?.id ?? ''}
      />
    </div>
  );
}
