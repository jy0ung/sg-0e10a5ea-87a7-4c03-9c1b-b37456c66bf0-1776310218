import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LeaveRequest, LeaveType, LeaveBalance } from '@/types';
import type { LeaveApprovalPreview, LeaveHoliday } from '@/services/hrmsService';
import { formatDays, fmtDateRange } from './utils';
import { SectionHeading, EmptyState, LoadingSkeleton, StatusBadge } from './shared';
import { LeaveBalanceCards } from './LeaveBalanceCards';
import { LeaveRequestDrawer } from './LeaveRequestDrawer';
import { ReviewDialog } from './ReviewDialog';

interface MyLeaveTabProps {
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  holidays: LeaveHoliday[];
  myActivePending: LeaveRequest[];
  myUpcoming: LeaveRequest[];
  myHistory: LeaveRequest[];
  approvalPreview: LeaveApprovalPreview | null;
  isLoading: boolean;
  onApplyLeave: () => void;
  onRefresh: () => void;
}

function RequestRow({
  req,
  canReview,
  onSelect,
  onReview,
}: {
  req: LeaveRequest;
  canReview: boolean;
  onSelect: (r: LeaveRequest) => void;
  onReview: (r: LeaveRequest) => void;
}) {
  return (
    <button
      type="button"
      className="w-full text-left"
      onClick={() => onSelect(req)}
    >
      <div className={[
        'flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-sm transition-shadow hover:shadow',
        canReview ? 'border-amber-200 dark:border-amber-800' : '',
      ].join(' ')}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium">{req.leaveTypeName ?? 'Leave'}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatDays(req.days)} day{req.days !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {fmtDateRange(req.startDate, req.endDate)}
          </p>
        </div>
        <StatusBadge req={req} />
        {canReview && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 border-amber-300 px-2 text-xs text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300"
            onClick={e => { e.stopPropagation(); onReview(req); }}
          >
            Review
          </Button>
        )}
      </div>
    </button>
  );
}

export function MyLeaveTab({
  leaveTypes,
  leaveBalances,
  holidays: _holidays,
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

  const leaveYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      {/* Approval flow info */}
      {approvalPreview && !isLoading && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span>
            Your leave follows the{' '}
            <span className="font-medium">{approvalPreview.nextStepLabel ?? 'direct review'}</span>{' '}
            approval workflow.
            {approvalPreview.fullFlow.length > 1 && (
              <> Flow: {approvalPreview.fullFlow.join(' → ')}</>
            )}
          </span>
        </div>
      )}

      {/* Leave balances */}
      <section className="space-y-2">
        <SectionHeading title={`Leave Balances — ${leaveYear}`} />
        <LeaveBalanceCards
          leaveTypes={leaveTypes}
          leaveBalances={leaveBalances}
          leaveYear={leaveYear}
          isLoading={isLoading}
        />
      </section>

      {/* Pending */}
      <section className="space-y-2">
        <SectionHeading
          title="Pending Requests"
          count={myActivePending.length}
          colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        />
        {isLoading ? <LoadingSkeleton rows={2} /> : myActivePending.length === 0 ? (
          <EmptyState title="No pending requests." />
        ) : (
          <div className="space-y-1.5">
            {myActivePending.map(req => (
              <RequestRow
                key={req.id}
                req={req}
                canReview={false}
                onSelect={setDrawerRequest}
                onReview={setReviewRequest}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming */}
      {(isLoading || myUpcoming.length > 0) && (
        <section className="space-y-2">
          <SectionHeading
            title="Upcoming Approved Leave"
            count={myUpcoming.length}
            colorClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          />
          {isLoading ? <LoadingSkeleton rows={1} /> : (
            <div className="space-y-1.5">
              {myUpcoming.map(req => (
                <RequestRow key={req.id} req={req} canReview={false} onSelect={setDrawerRequest} onReview={setReviewRequest} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* History */}
      <section className="space-y-2">
        <SectionHeading title="Leave History" />
        {isLoading ? <LoadingSkeleton rows={3} /> : myHistory.length === 0 ? (
          <EmptyState
            title="No leave history yet."
            action={
              <button type="button" className="text-primary underline underline-offset-2" onClick={onApplyLeave}>
                Apply for leave →
              </button>
            }
          />
        ) : (
          <div className="space-y-1.5">
            {myHistory.map(req => (
              <RequestRow key={req.id} req={req} canReview={false} onSelect={setDrawerRequest} onReview={setReviewRequest} />
            ))}
          </div>
        )}
      </section>

      <LeaveRequestDrawer
        request={drawerRequest}
        open={!!drawerRequest}
        onClose={() => setDrawerRequest(null)}
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
