import React from 'react';
import { CheckCircle2, Clock, Paperclip, XCircle } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LeaveRequest } from '@/types';
import { fmtTimestamp, fmtDateRange, formatDays, getStatusConfig } from './utils';

interface LeaveRequestDrawerProps {
  request: LeaveRequest | null;
  open: boolean;
  onClose: () => void;
  canReview?: boolean;
  isOwn?: boolean;
  onReview?: (req: LeaveRequest) => void;
}

function ApprovalTimeline({ req }: { req: LeaveRequest }) {
  return (
    <div className="space-y-3 border-l-2 border-border pl-4">
      {req.approvalHistory?.map(d => {
        const ok = d.decision === 'approved';
        return (
          <div key={d.id} className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              {ok
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                : <XCircle className="h-4 w-4 shrink-0 text-red-600" />
              }
              <span>{d.stepName ?? `Step ${d.stepOrder}`}</span>
              <Badge
                variant="outline"
                className={`text-xs ${ok
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
                }`}
              >
                {d.decision}
              </Badge>
            </div>
            <p className="ml-6 text-xs text-muted-foreground">
              {d.approverName ?? 'Unknown approver'} · {fmtTimestamp(d.decidedAt)}
            </p>
            {d.note && (
              <p className="ml-6 text-xs italic text-muted-foreground">"{d.note}"</p>
            )}
          </div>
        );
      })}
      {req.status === 'pending' && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0 text-amber-500" />
            <span>{req.currentApprovalStepName ?? 'Awaiting review'}</span>
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
              pending
            </Badge>
          </div>
          <p className="ml-6 text-xs text-muted-foreground">
            Waiting for {req.currentApproverRole ? 'assigned HRMS role' : 'assigned approver'}
          </p>
        </div>
      )}
      {!req.approvalHistory?.length && req.status !== 'pending' && (
        <p className="text-sm text-muted-foreground">No approval decisions recorded.</p>
      )}
    </div>
  );
}

export function LeaveRequestDrawer({
  request,
  open,
  onClose,
  canReview = false,
  onReview,
}: LeaveRequestDrawerProps) {
  if (!request) return null;

  const { label: statusLabel, className: statusClass } = getStatusConfig(request);

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b pb-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base">
                {request.employeeName ?? 'Leave Request'}
              </SheetTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {request.leaveTypeName ?? 'Leave'}
              </p>
            </div>
            <Badge variant="outline" className={`shrink-0 text-xs ${statusClass}`}>
              {statusLabel}
            </Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 py-5">
          {/* Dates */}
          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Dates</p>
            <p className="text-sm font-medium">{fmtDateRange(request.startDate, request.endDate)}</p>
            <p className="text-xs text-muted-foreground">{formatDays(request.days)} working day{request.days !== 1 ? 's' : ''}</p>
          </section>

          {/* Reason */}
          {request.reason && (
            <section className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Reason</p>
              <p className="text-sm">{request.reason}</p>
            </section>
          )}

          {/* Attachment */}
          {request.attachmentFileName && (
            <section className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Attachment</p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm">{request.attachmentFileName}</span>
              </div>
            </section>
          )}

          {/* Reviewer note */}
          {request.reviewerNote && (
            <section className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Reviewer Note</p>
              <p className="text-sm italic text-muted-foreground">"{request.reviewerNote}"</p>
            </section>
          )}

          {/* Approval timeline */}
          {(request.approvalInstanceId || request.approvalHistory?.length || request.status === 'pending') && (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Approval Timeline</p>
              <ApprovalTimeline req={request} />
            </section>
          )}
        </div>

        {/* Footer actions */}
        {canReview && onReview && request.status === 'pending' && (
          <div className="border-t pt-4">
            <Button
              size="sm"
              onClick={() => { onReview(request); onClose(); }}
              className="w-full"
            >
              Review Request
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
