import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import type { LeaveApproverIdentity } from './LeaveManagement';
import { useLeaveData } from '@/hooks/useLeaveData';
import { TeamLeaveTab } from './leave/TeamLeaveTab';

/**
 * Team Leave — manager/approver view only.
 *
 * Hosts team coverage, upcoming absences, and actionable review of team leave
 * requests. Personal leave lives on the separate "My Leave" page; the dedicated
 * action queue lives on "/approvals". Route access is gated to Manager+/approver
 * via the `teamLeave` access key, so staff never reach this surface.
 */
export default function TeamLeave() {
  const { user } = useAuth();
  const hrmsAccess = useHrmsAccess();

  const canApproveRequests = hrmsAccess.canApproveRequests;
  const selfServiceEmployeeId = user?.employeeId ?? user?.id;

  const approverIdentity: LeaveApproverIdentity = useMemo(() => ({
    id: user?.id,
    hrmsRoleIds:   hrmsAccess.roleIds,
    hrmsRoleCodes: hrmsAccess.roleCodes,
  }), [user?.id, hrmsAccess.roleIds, hrmsAccess.roleCodes]);

  const leaveData = useLeaveData();

  return (
    <div className="w-full space-y-5">
      <section className="surface-card hero-gradient px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ClipboardCheck className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Team Leave</h1>
                {canApproveRequests && leaveData.pendingForMeCount > 0 && (
                  <Badge className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
                    {leaveData.pendingForMeCount} need action
                  </Badge>
                )}
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Monitor team coverage, upcoming absences, and process requests assigned to you.
              </p>
            </div>
          </div>

          {canApproveRequests && (
            <Button asChild size="sm" variant="outline" className="gap-2 self-start lg:self-auto">
              <Link to="/approvals">
                <Inbox className="h-4 w-4" />
                Approval Inbox
              </Link>
            </Button>
          )}
        </div>
      </section>

      <TeamLeaveTab
        requests={leaveData.requests}
        selfServiceEmployeeId={selfServiceEmployeeId}
        approverIdentity={approverIdentity}
        canApproveRequests={canApproveRequests}
        isLoading={leaveData.isLoading}
        onRefresh={leaveData.invalidate}
      />
    </div>
  );
}
