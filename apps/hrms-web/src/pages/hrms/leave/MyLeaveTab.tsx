import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  History,
} from 'lucide-react';
import type { LeaveRequest } from '@/types';
import { SectionHeading, EmptyState, LoadingSkeleton, RequestCard } from './shared';
import { LeaveRequestDrawer } from './LeaveRequestDrawer';

const HISTORY_INITIAL_SHOW = 5;

interface MyLeaveTabProps {
  myActivePending: LeaveRequest[];
  myUpcoming: LeaveRequest[];
  myHistory: LeaveRequest[];
  isLoading: boolean;
  onApplyLeave: () => void;
}

export function MyLeaveTab({
  myActivePending,
  myUpcoming,
  myHistory,
  isLoading,
  onApplyLeave,
}: MyLeaveTabProps) {
  const [drawerRequest, setDrawerRequest] = useState<LeaveRequest | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const leaveYear = new Date().getFullYear();
  const visibleHistory = showAllHistory ? myHistory : myHistory.slice(0, HISTORY_INITIAL_SHOW);

  return (
    <div className="space-y-3">
      <section className="space-y-2.5 rounded-lg border bg-card p-3 shadow-sm sm:p-3.5">
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
          <div className="space-y-1.5">
            {myActivePending.map(req => (
              <RequestCard key={req.id} req={req} onSelect={setDrawerRequest} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2.5 rounded-lg border bg-card p-3 shadow-sm sm:p-3.5">
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
          <div className="space-y-1.5">
            {myUpcoming.map(req => (
              <RequestCard key={req.id} req={req} onSelect={setDrawerRequest} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2.5 rounded-lg border bg-card p-3 shadow-sm sm:p-3.5">
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
          <div className="space-y-1.5">
            {visibleHistory.map(req => (
              <RequestCard key={req.id} req={req} onSelect={setDrawerRequest} />
            ))}
            {myHistory.length > HISTORY_INITIAL_SHOW && (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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

      <LeaveRequestDrawer
        request={drawerRequest}
        open={!!drawerRequest}
        onClose={() => setDrawerRequest(null)}
      />
    </div>
  );
}
