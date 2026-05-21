import React, { useState } from 'react';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApprovalInboxItems } from '@/hooks/useApprovalInboxItems';
import { reviewLeaveRequest } from '@/services/hrmsService';
import { notifyApprovalInboxChanged } from '@/lib/hrms/approvalInbox';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { LeaveRequest } from '@/types';
import { fmtTimestamp } from './utils';
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
  const [quickDecision, setQuickDecision] = useState<Record<string, { submitting: boolean }>>({});

  // Filter to leave requests only
  const leaveItems = items.filter(
    (item): item is Extract<typeof item, { entityType: 'leave_request' }> =>
      item.entityType === 'leave_request'
  );

  async function handleQuickDecision(entityId: string, decision: 'approved' | 'rejected') {
    if (!user?.id) return;
    setQuickDecision(prev => ({ ...prev, [entityId]: { submitting: true } }));
    try {
      const { error } = await reviewLeaveRequest(entityId, user.id, decision);
      if (error) {
        toast({ title: 'Error', description: error, variant: 'destructive' });
        return;
      }
      toast({ title: decision === 'approved' ? 'Request approved' : 'Request rejected' });
      notifyApprovalInboxChanged();
      onRefresh();
    } finally {
      setQuickDecision(prev => {
        const next = { ...prev };
        delete next[entityId];
        return next;
      });
    }
  }

  if (isLoading) {
    return <LoadingSkeleton rows={3} />;
  }

  if (leaveItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Inbox className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">All caught up — no leave requests need your attention.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {leaveItems.map(item => {
        const isSubmitting = quickDecision[item.entityId]?.submitting ?? false;
        const request = item.entity;
        return (
          <div
            key={item.entityId}
            className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-card px-3 py-3 shadow-sm dark:border-amber-800"
          >
            <div
              role="button"
              tabIndex={0}
              className="flex cursor-pointer items-start gap-3"
              onClick={() => setDrawerRequest(request)}
              onKeyDown={e => e.key === 'Enter' && setDrawerRequest(request)}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-sm font-semibold dark:bg-amber-900/30 dark:text-amber-400">
                {item.title.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold">{item.title}</span>
                  {item.subtitle && (
                    <Badge variant="outline" className="text-xs">{item.subtitle}</Badge>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{fmtTimestamp(item.updatedAt)}</span>
                  {item.currentApprovalStepName && <span>{item.currentApprovalStepName}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t pt-2">
              <span className="flex-1 text-xs text-muted-foreground">
                {item.currentApprovalStepName ?? 'Awaiting your review'}
              </span>
              <Button
                size="sm"
                className="h-7 bg-emerald-600 px-3 text-xs hover:bg-emerald-700 text-white"
                disabled={isSubmitting}
                onClick={() => handleQuickDecision(item.entityId, 'approved')}
              >
                Approve
              </Button>
              <Button
                size="sm"
                className="h-7 bg-red-600 px-3 text-xs hover:bg-red-700 text-white"
                disabled={isSubmitting}
                onClick={() => handleQuickDecision(item.entityId, 'rejected')}
              >
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={isSubmitting}
                onClick={() => setReviewRequest(request)}
              >
                With Note
              </Button>
            </div>
          </div>
        );
      })}

      <LeaveRequestDrawer
        request={drawerRequest}
        open={!!drawerRequest}
        onClose={() => setDrawerRequest(null)}
        canReview
        onReview={req => { setDrawerRequest(null); setReviewRequest(req); }}
      />
      <ReviewDialog
        request={reviewRequest}
        open={!!reviewRequest}
        onClose={() => setReviewRequest(null)}
        onSuccess={() => { onRefresh(); setReviewRequest(null); }}
      />
    </div>
  );
}
