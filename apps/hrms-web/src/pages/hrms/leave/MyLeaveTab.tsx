import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { LeaveRequest, LeaveType, LeaveBalance } from '@/types';
import type { LeaveApprovalPreview } from '@/services/hrmsService';
import { SectionHeading, EmptyState, LoadingSkeleton, RequestCard } from './shared';
import { LeaveBalanceCards } from './LeaveBalanceCards';
import { LeaveRequestDrawer } from './LeaveRequestDrawer';
import { ReviewDialog } from './ReviewDialog';

const HISTORY_INITIAL_SHOW = 5;

interface MyLeaveTabProps {
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  myActivePending: LeaveRequest[];
  myUpcoming: LeaveRequest[];
  myHistory: LeaveRequest[];
  approvalPreview: LeaveApprovalPreview | null;
  isLoading: boolean;
  onApplyLeave: () => void;
  onRefresh: () => void;
}

export function MyLeaveTab({
  leaveTypes,
  leaveBalances,
  myActivePending,
  myUpcoming,
  myHistory,
  approvalPreview,
  isLoading,
  onApplyLeave,
  onRefresh,
}: MyLeaveTabProps) {
  const [drawerRequest, setDrawerRequest] = useState<LeaveRequest | null>(null);
  const [reviewRequest, setReviewRequest] = useState<LeaveRequest | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const leaveYear = new Date().getFullYear();
  const visibleHistory = showAllHistory ? myHistory : myHistory.slice(0, HISTORY_INITIAL_SHOW);

  return (
    <div className="space-y-6">
      {/* Mobile-only balance summary — desktop sees it in the ContextPanel */}
      <section className="space-y-2 lg:hidden">
        <SectionHeading title={`Balances \u2014 ${leaveYear}`} />
        <LeaveBalanceCards
          leaveTypes={leaveTypes}
          leaveBalances={leaveBalances}
          leaveYear={leaveYear}
          isLoading={isLoading}
        />
      </section>

      {/* Pending Requests — urgency first */}
      <section className="space-y-2">
        <SectionHeading
          title="Pending Requests"
          count={myActivePending.length}
          colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        />
        {isLoading ? (
          <LoadingSkeleton rows={2} />
        ) : myActivePending.length === 0 ? (
          <EmptyState title="No pending requests." />
        ) : (
          <div className="space-y-2">
            {myActivePending.map(req => (
              <RequestCard key={req.id} req={req} onSelect={setDrawerRequest} />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Approved Leave */}
      {(isLoading || myUpcoming.length > 0) && (
        <section className="space-y-2">
          <SectionHeading
            title="Upcoming Leave"
            count={myUpcoming.length}
            colorClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          />
          {isLoading ? (
            <LoadingSkeleton rows={1} />
          ) : (
            <div className="space-y-2">
              {myUpcoming.map(req => (
                <RequestCard key={req.id} req={req} onSelect={setDrawerRequest} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Leave History */}
      <section className="space-y-2">
        <SectionHeading title="Leave History" />
        {isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : myHistory.length === 0 ? (
          <EmptyState
            title="No leave history yet."
            action={
              <button
                type="button"
                className="text-xs text-primary underline underline-offset-2"
                onClick={onApplyLeave}
              >
                Apply for leave \u2192
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {visibleHistory.map(req => (
              <RequestCard key={req.id} req={req} onSelect={setDrawerRequest} />
            ))}
            {myHistory.length > HISTORY_INITIAL_SHOW && (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowAllHistory(p => !p)}
              >
                {showAllHistory ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" /> Show{' '}
                    {myHistory.length - HISTORY_INITIAL_SHOW} more
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Approval flow info — toned down at bottom */}
      {approvalPreview && !isLoading && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
          <span>
            Approval flow:{' '}
            <span className="font-medium text-foreground">
              {approvalPreview.nextStepLabel ?? 'Direct review'}
            </span>
            {approvalPreview.fullFlow.length > 1 && (
              <> \u00b7 {approvalPreview.fullFlow.join(' \u2192 ')}</>
            )}
          </span>
        </div>
      )}

      <LeaveRequestDrawer
        request={drawerRequest}
        open={!!drawerRequest}
        onClose={() => setDrawerRequest(null)}
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
