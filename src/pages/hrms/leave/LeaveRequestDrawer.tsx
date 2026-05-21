import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2, XCircle, Clock, Calendar, FileText, Ban,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { LeaveRequest } from '@/types';

interface LeaveRequestDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: LeaveRequest | null;
  canReview: boolean;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  currentUserId?: string;
}

const STATUS_BADGE: Record<string, { className: string; icon: React.ReactNode }> = {
  pending:   { className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0', icon: <Clock className="h-3 w-3" /> },
  approved:  { className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected:  { className: 'bg-red-500/15 text-red-700 dark:text-red-400 border-0', icon: <XCircle className="h-3 w-3" /> },
  cancelled: { className: 'bg-gray-500/15 text-gray-500 border-0', icon: <Ban className="h-3 w-3" /> },
};

function formatTimestamp(value?: string): string {
  if (!value) return 'Unknown';
  try {
    return format(parseISO(value), 'dd MMM yyyy, h:mm a');
  } catch {
    return value;
  }
}

function formatDateRange(start: string, end: string): string {
  try {
    return `${format(parseISO(start), 'dd MMM yyyy')} — ${format(parseISO(end), 'dd MMM yyyy')}`;
  } catch {
    return `${start} — ${end}`;
  }
}

export default function LeaveRequestDrawer({
  open,
  onOpenChange,
  request,
  canReview,
  onApprove,
  onReject,
  onCancel,
  currentUserId,
}: LeaveRequestDrawerProps) {
  if (!request) return null;

  const statusBadge = STATUS_BADGE[request.status] ?? STATUS_BADGE.pending;
  const isOwnRequest = currentUserId && request.employeeId === currentUserId;
  const canCancelRequest = isOwnRequest && request.status === 'pending';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <SheetTitle className="text-base font-semibold text-foreground">
                {request.leaveTypeName ?? 'Leave Request'}
              </SheetTitle>
              <p className="text-sm text-muted-foreground">
                {request.employeeName ?? 'You'}
              </p>
            </div>
            <Badge variant="outline" className={cn('shrink-0 flex items-center gap-1 text-xs capitalize', statusBadge.className)}>
              {statusBadge.icon} {request.status}
            </Badge>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-5">
          <div className="space-y-4 py-4">
            {/* Details */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{formatDateRange(request.startDate, request.endDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{request.days} day{request.days !== 1 ? 's' : ''}</span>
              </div>
              {request.reason && (
                <div className="flex items-start gap-2 text-sm">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{request.reason}</span>
                </div>
              )}
              {request.reviewerNote && (
                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Reviewer note:</span> {request.reviewerNote}
                </div>
              )}
            </div>

            {/* Current Stage */}
            {request.status === 'pending' && request.currentApprovalStepName && (
              <div className="rounded-md bg-amber-500/5 border border-amber-200/50 dark:border-amber-800/30 px-3 py-2 text-xs">
                <span className="font-medium text-amber-700 dark:text-amber-400">Current step:</span>{' '}
                <span className="text-amber-600 dark:text-amber-300">
                  {request.currentApprovalStepName}
                  {request.currentApproverRole && ` · ${request.currentApproverRole.replace(/_/g, ' ')}`}
                </span>
              </div>
            )}

            <Separator />

            {/* Approval Timeline */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Approval Timeline
              </h4>
              {(request.approvalHistory?.length ?? 0) > 0 || request.status === 'pending' ? (
                <div className="relative pl-4 space-y-4">
                  {/* Timeline line */}
                  <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />

                  {request.approvalHistory?.map(decision => {
                    const isApproved = decision.decision === 'approved';
                    return (
                      <div key={decision.id} className="relative">
                        <div className={cn(
                          'absolute -left-4 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-background',
                          isApproved ? 'bg-emerald-500' : 'bg-red-500'
                        )}>
                          {isApproved
                            ? <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                            : <XCircle className="h-2.5 w-2.5 text-white" />
                          }
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <span>{decision.stepName ?? `Step ${decision.stepOrder}`}</span>
                            <span className={isApproved ? 'text-emerald-600' : 'text-red-600'}>
                              {decision.decision}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {decision.approverName ?? 'Unknown'} · {formatTimestamp(decision.decidedAt)}
                          </p>
                          {decision.note && (
                            <p className="text-xs text-muted-foreground/80 italic">"{decision.note}"</p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Pending step indicator */}
                  {request.status === 'pending' && (
                    <div className="relative">
                      <div className="absolute -left-4 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 ring-2 ring-background animate-pulse">
                        <Clock className="h-2.5 w-2.5 text-white" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-muted-foreground">
                          {request.currentApprovalStepName ?? 'Awaiting review'}
                        </p>
                        <p className="text-[11px] text-muted-foreground/70">
                          Waiting for {request.currentApproverRole
                            ? request.currentApproverRole.replace(/_/g, ' ')
                            : 'assigned approver'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {request.approvalInstanceId ? 'No approval decisions recorded.' : 'Direct review — no workflow configured.'}
                </p>
              )}
            </div>

            {/* Metadata */}
            <Separator />
            <div className="text-[11px] text-muted-foreground/60 space-y-0.5">
              <p>Created: {formatTimestamp(request.createdAt)}</p>
              {request.reviewedAt && <p>Reviewed: {formatTimestamp(request.reviewedAt)}</p>}
            </div>
          </div>
        </ScrollArea>

        {/* Action buttons */}
        {(canReview || canCancelRequest) && (
          <div className="border-t border-border/60 px-5 py-3 space-y-2 bg-background">
            {canReview && (
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={onApprove}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
                  onClick={onReject}
                >
                  <XCircle className="h-4 w-4 mr-1.5" /> Reject
                </Button>
              </div>
            )}
            {canCancelRequest && (
              <Button variant="outline" className="w-full text-muted-foreground" onClick={onCancel}>
                <Ban className="h-3.5 w-3.5 mr-1.5" /> Cancel Request
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
