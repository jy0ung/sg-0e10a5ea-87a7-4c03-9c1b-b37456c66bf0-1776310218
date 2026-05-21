import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar, ChevronRight, Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeaveRequest, LeaveBalance, LeaveType } from '@/types';

interface MyLeaveTabProps {
  requests: LeaveRequest[];
  pendingRequests: LeaveRequest[];
  upcomingLeave: LeaveRequest | null;
  balances: LeaveBalance[];
  leaveTypes: LeaveType[];
  onRequestClick: (request: LeaveRequest) => void;
  onApplyLeave: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  approved:  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  rejected:  'bg-red-500/15 text-red-700 dark:text-red-400',
  cancelled: 'bg-gray-500/15 text-gray-500',
};

function getStageLabel(req: LeaveRequest): string | null {
  if (req.status === 'pending' && req.currentApprovalStepName) {
    return `Waiting for ${req.currentApprovalStepName}`;
  }
  if (req.status === 'pending' && req.currentApproverRole) {
    return `Waiting for ${req.currentApproverRole.replace(/_/g, ' ')}`;
  }
  if (req.status === 'approved') return 'Completed';
  if (req.status === 'rejected' && req.currentApproverRole) {
    return `Rejected by ${req.currentApproverRole.replace(/_/g, ' ')}`;
  }
  return null;
}

function formatDateRange(start: string, end: string): string {
  try {
    const s = format(parseISO(start), 'dd MMM');
    const e = format(parseISO(end), 'dd MMM yyyy');
    return `${s} — ${e}`;
  } catch {
    return `${start} — ${end}`;
  }
}

function LeaveRequestRow({ request, onClick }: { request: LeaveRequest; onClick: () => void }) {
  const stage = getStageLabel(request);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3.5 py-2.5 transition-all hover:border-border hover:shadow-sm hover:bg-accent/30 group"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {request.leaveTypeName ?? 'Leave'}
          </span>
          <span className="text-xs text-muted-foreground">
            {request.days}d
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3 shrink-0" />
          <span>{formatDateRange(request.startDate, request.endDate)}</span>
        </div>
        {stage && (
          <p className="text-[11px] text-muted-foreground/70">{stage}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge
          variant="outline"
          className={cn('text-[11px] font-medium capitalize border-0 px-2 py-0.5', STATUS_STYLES[request.status])}
        >
          {request.status}
        </Badge>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      </div>
    </button>
  );
}

export default function MyLeaveTab({
  requests,
  pendingRequests,
  upcomingLeave,
  onRequestClick,
  onApplyLeave,
}: MyLeaveTabProps) {
  const today = new Date();
  const recentRequests = requests.slice(0, 12);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Upcoming Leave */}
      {upcomingLeave && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Upcoming Leave
          </h3>
          <button
            type="button"
            onClick={() => onRequestClick(upcomingLeave)}
            className="w-full rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-500/5 px-4 py-3 text-left transition-all hover:shadow-sm hover:border-emerald-300 dark:hover:border-emerald-700"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {upcomingLeave.leaveTypeName ?? 'Leave'} · {upcomingLeave.days} day{upcomingLeave.days !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateRange(upcomingLeave.startDate, upcomingLeave.endDate)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {differenceInCalendarDays(parseISO(upcomingLeave.startDate), today)}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">days away</p>
              </div>
            </div>
          </button>
        </section>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Pending Requests
            <Badge variant="outline" className="ml-2 text-[10px] bg-amber-500/10 text-amber-600 border-0">
              {pendingRequests.length}
            </Badge>
          </h3>
          <div className="space-y-1.5">
            {pendingRequests.map(req => (
              <LeaveRequestRow key={req.id} request={req} onClick={() => onRequestClick(req)} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Leave Activity */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Recent Activity
        </h3>
        {recentRequests.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border/60 px-4 py-6 text-center">
            <div className="flex-1">
              <Inbox className="h-5 w-5 text-muted-foreground/40 mx-auto mb-1.5" />
              <p className="text-sm text-muted-foreground">No leave history yet.</p>
              <Button variant="link" size="sm" className="text-xs mt-1 h-auto p-0" onClick={onApplyLeave}>
                Apply for leave →
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentRequests.map(req => (
              <LeaveRequestRow key={req.id} request={req} onClick={() => onRequestClick(req)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
