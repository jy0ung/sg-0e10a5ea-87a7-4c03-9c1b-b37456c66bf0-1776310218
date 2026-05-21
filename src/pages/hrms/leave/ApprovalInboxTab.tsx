import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import {
  CheckCircle2, XCircle, Calendar, Clock,
} from 'lucide-react';
import type { PendingApproval } from '@/types';

interface ApprovalInboxTabProps {
  approvals: PendingApproval[];
  onApprove: (approval: PendingApproval) => void;
  onReject: (approval: PendingApproval) => void;
  onViewDetails: (approval: PendingApproval) => void;
}

function formatDateShort(d: string): string {
  try { return format(parseISO(d), 'dd MMM'); } catch { return d; }
}

function getInitial(name?: string): string {
  return name?.charAt(0)?.toUpperCase() ?? '?';
}

export default function ApprovalInboxTab({
  approvals,
  onApprove,
  onReject,
  onViewDetails,
}: ApprovalInboxTabProps) {
  if (approvals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 mb-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        </div>
        <p className="text-sm font-medium text-foreground">All caught up</p>
        <p className="text-xs text-muted-foreground mt-0.5">No leave requests need your attention.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-fade-in">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Awaiting Your Decision
          <Badge variant="outline" className="ml-2 text-[10px] bg-amber-500/10 text-amber-600 border-0">
            {approvals.length}
          </Badge>
        </h3>
      </div>

      <div className="space-y-2">
        {approvals.map(pa => (
          <div
            key={pa.id}
            className="rounded-lg border border-border/60 bg-card transition-all hover:border-border hover:shadow-sm"
          >
            <button
              type="button"
              onClick={() => onViewDetails(pa)}
              className="w-full text-left px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary shrink-0 mt-0.5">
                  {getInitial(pa.requesterName)}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {pa.requesterName ?? pa.requesterId}
                    </span>
                  </div>
                  {pa.leaveRequest && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">
                        {pa.leaveRequest.leaveTypeName ?? 'Leave'} · {pa.leaveRequest.days} day{pa.leaveRequest.days !== 1 ? 's' : ''}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>
                          {formatDateShort(pa.leaveRequest.startDate)} — {formatDateShort(pa.leaveRequest.endDate)}
                        </span>
                      </div>
                      {pa.leaveRequest.reason && (
                        <p className="text-[11px] text-muted-foreground/70 line-clamp-1">
                          {pa.leaveRequest.reason}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                    <Clock className="h-3 w-3" />
                    <span>Step: {pa.currentStepName}</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span>{pa.flowName}</span>
                  </div>
                </div>
              </div>
            </button>

            {/* Quick actions */}
            <div className="flex items-center gap-2 px-4 pb-3">
              <Button
                size="sm"
                className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                onClick={(e) => { e.stopPropagation(); onApprove(pa); }}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950 text-xs"
                onClick={(e) => { e.stopPropagation(); onReject(pa); }}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
