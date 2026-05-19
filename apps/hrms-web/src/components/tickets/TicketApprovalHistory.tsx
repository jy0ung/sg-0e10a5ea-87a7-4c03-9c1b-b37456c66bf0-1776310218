import { CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { getInternalRequestApprovalWithHistory } from '@/services/requestApprovalService';
import type { ApprovalDecision } from '@/types';

interface Props {
  ticketId: string;
}

function DecisionRow({ decision }: { decision: ApprovalDecision }) {
  const approved = decision.decision === 'approved';
  return (
    <li className="flex items-start gap-2">
      {approved ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-foreground">
          {decision.stepName ?? `Step ${decision.stepOrder}`}
          <span
            className={cn(
              'ml-1.5 text-[10px] font-semibold uppercase tracking-wide',
              approved ? 'text-emerald-600' : 'text-red-500',
            )}
          >
            {decision.decision}
          </span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {decision.approverName ?? 'Unknown approver'}
          {' · '}
          {formatDistanceToNow(new Date(decision.decidedAt), { addSuffix: true })}
        </p>
        {decision.note && (
          <p className="mt-0.5 text-[11px] italic text-muted-foreground">
            &ldquo;{decision.note}&rdquo;
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * Renders the full approval decision trail for an internal request.
 * Self-contained: fetches its own data via React Query using ticketId.
 * Only renders when the ticket has an active or completed approval instance.
 */
export function TicketApprovalHistory({ ticketId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['approvalHistory', ticketId],
    queryFn: () => getInternalRequestApprovalWithHistory(ticketId),
    staleTime: 30_000,
    enabled: !!ticketId,
  });

  const approval = data?.data;
  const decisions = approval?.history ?? [];
  const isPending = approval?.status === 'pending';

  if (isLoading) {
    return (
      <div className="mt-2 flex items-center gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading approval trail…
      </div>
    );
  }

  // Nothing to show when there is no approval instance at all, or when the
  // approval is completed but no decisions were recorded (should not happen in
  // practice but guard defensively).
  if (!approval || (decisions.length === 0 && !isPending)) return null;

  return (
    <div className="border-t border-border pt-2.5">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Approval trail
      </p>
      <ol className="space-y-2.5">
        {decisions.map((d) => (
          <DecisionRow key={d.id} decision={d} />
        ))}

        {/* Current pending step — shown after any past decisions */}
        {isPending && (
          <li className="flex items-start gap-2">
            <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-[11px] font-medium text-foreground">
                {approval.currentStepName ?? 'Pending step'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {approval.currentApproverRole
                  ? `Awaiting: ${approval.currentApproverRole.replace(/_/g, ' ')}`
                  : 'Awaiting approval'}
              </p>
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}
