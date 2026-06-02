import React, { useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  History,
  TimerReset,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const totalRequestedDays = myHistory.reduce((sum, req) => sum + (req.days ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">My Leave Overview</h3>
            <p className="text-xs text-muted-foreground">
              Track active requests, upcoming plans, and historical usage in one workspace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
              <TimerReset className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button type="button" size="sm" onClick={onApplyLeave}>
              <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
              New request
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pending</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {myActivePending.length}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Upcoming</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {myUpcoming.length}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Days requested</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{totalRequestedDays}</p>
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
        <SectionHeading title={`Balances - ${leaveYear}`} />
        <LeaveBalanceCards
          leaveTypes={leaveTypes}
          leaveBalances={leaveBalances}
          leaveYear={leaveYear}
          isLoading={isLoading}
        />
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <SectionHeading
          title="Pending Requests"
          count={myActivePending.length}
          colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        />
        {isLoading ? (
          <LoadingSkeleton rows={2} />
        ) : myActivePending.length === 0 ? (
          <EmptyState
            title="No pending requests."
            action={
              <button
                type="button"
                className="text-xs text-primary underline underline-offset-2"
                onClick={onApplyLeave}
              >
                Start a new request
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {myActivePending.map(req => (
              <RequestCard key={req.id} req={req} onSelect={setDrawerRequest} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <SectionHeading
          title="Upcoming Leave"
          count={myUpcoming.length}
          colorClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        {isLoading ? (
          <LoadingSkeleton rows={1} />
        ) : myUpcoming.length === 0 ? (
          <EmptyState title="No upcoming leave scheduled." />
        ) : (
          <div className="space-y-2">
            {myUpcoming.map(req => (
              <RequestCard key={req.id} req={req} onSelect={setDrawerRequest} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading title="Leave History" count={myHistory.length} />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            {leaveYear} archive
          </span>
        </div>
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
                Apply for leave -&gt;
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

      {approvalPreview && !isLoading && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
          <span>
            Approval flow:{' '}
            <span className="font-medium text-foreground">
              {approvalPreview.nextStepLabel ?? 'Direct review'}
            </span>
            {approvalPreview.fullFlow.length > 1 && <> - {approvalPreview.fullFlow.join(' -> ')}</>}
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
