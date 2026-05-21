import React, { useState } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApprovalInboxItems } from '@/hooks/useApprovalInboxItems';
import { reviewLeaveRequest } from '@/services/hrmsService';
import { notifyApprovalInboxChanged } from '@/lib/hrms/approvalInbox';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { LeaveRequest } from '@/types';
import { fmtDateRange, formatDays } from './utils';
import { LoadingSkeleton } from './shared';
import { LeaveRequestDrawer } from './LeaveRequestDrawer';
import { ReviewDialog } from './ReviewDialog';

interface ApprovalInboxTabProps {
  onRefresh: () => void;
}

export function ApprovalInboxTab({ onRefresh }: ApprovalInboxTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { items, isPending: isLoading } = useApprovalInboxItems();
  const [drawerRequest, setDrawerRequest] = useState<LeaveRequest | null>(null);
  const [reviewRequest, setReviewRequest] = useState<LeaveRequest | null>(null);
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});

  const leaveItems = items.filter(
    (item): item is Extract<typeof item, { entityType: 'leave_request' }> =>
      item.entityType === 'leave_request',
  );

  // Oldest first — longest waiting get priority
  const sorted = [...leaveItems].sort(
    (a, b) =>
      new Date(a.entity.createdAt).getTime() - new Date(b.entity.createdAt).getTime(),
  );

  async function handleDecision(entityId: string, decision: 'approved' | 'rejected') {
    if (!user?.id) return;
    setDeciding(prev => ({ ...prev, [entityId]: true }));
    try {
      const { error } = await reviewLeaveRequest(entityId, user.id, decision);
      if (error) {
        toast({ title: 'Error', description: error, variant: 'destructive' });
      } else {
        toast({ title: decision === 'approved' ? 'Request approved' : 'Request rejected' });
        notifyApprovalInboxChanged();
        onRefresh();
      }
    } finally {
      setDeciding(prev => {
        const next = { ...prev };
        delete next[entityId];
        return next;
      });
    }
  }

  if (isLoading) return <LoadingSkeleton rows={3} />;

  return (
    <div className="space-y-4">
      {/* Header count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sorted.length === 0
            ? 'No requests awaiting your decision'
            : `${sorted.length} request${sorted.length !== 1 ? 's' : ''} awaiting your decision`}
        </p>
        {sorted.length > 0 && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {sorted.length}
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="font-medium">All caught up</p>
            <p className="text-sm text-muted-foreground">
              No leave requests need your attention right now.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(item => {
            const request = item.entity;
            const isDeciding = deciding[item.entityId] ?? false;
            const submittedDate = new Date(request.createdAt);
            const daysWaiting = Math.floor(
              (Date.now() - submittedDate.getTime()) / (1000 * 60 * 60 * 24),
            );

            return (
              <div
                key={item.entityId}
                className="overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow"
              >
                {/* Main row — click to open drawer */}
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  onClick={() => setDrawerRequest(request)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-base font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {(request.employeeName ?? 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold">
                        {request.employeeName ?? 'Unknown Employee'}
                      </span>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                        {request.leaveTypeName ?? 'Leave'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fmtDateRange(request.startDate, request.endDate)}
                      <span className="mx-1.5 opacity-40">\u00b7</span>
                      <span className="tabular-nums">
                        {formatDays(request.days)} day{request.days !== 1 ? 's' : ''}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {daysWaiting === 0 ? 'Today' : `${daysWaiting}d ago`}
                    </span>
                    {'currentApprovalStepName' in item && item.currentApprovalStepName && (
                      <span className="text-xs text-muted-foreground">
                        {item.currentApprovalStepName as string}
                      </span>
                    )}
                  </div>
                </button>

                {/* Reason preview */}
                {request.reason && (
                  <p className="line-clamp-1 border-t px-4 py-2 text-xs italic text-muted-foreground">
                    &ldquo;{request.reason}&rdquo;
                  </p>
                )}

                {/* Action bar */}
                <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-4 py-2.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs"
                    disabled={isDeciding}
                    onClick={() => setDrawerRequest(request)}
                  >
                    Details
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-amber-300 px-3 text-xs text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300"
                    disabled={isDeciding}
                    onClick={() => setReviewRequest(request)}
                  >
                    Add Note
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 bg-red-600 px-3 text-xs text-white hover:bg-red-700"
                    disabled={isDeciding}
                    onClick={() => handleDecision(item.entityId, 'rejected')}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                    disabled={isDeciding}
                    onClick={() => handleDecision(item.entityId, 'approved')}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LeaveRequestDrawer
        request={drawerRequest}
        open={!!drawerRequest}
        onClose={() => setDrawerRequest(null)}
        canReview
        onReview={req => {
          setDrawerRequest(null);
          setReviewRequest(req);
        }}
      />
      <ReviewDialog
        request={reviewRequest}
        open={!!reviewRequest}
        onClose={() => setReviewRequest(null)}
        onSuccess={() => {
          onRefresh();
          setReviewRequest(null);
        }}
      />
    </div>
  );
}
