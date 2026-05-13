import { CheckCircle2, Clock3, ShieldCheck, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TicketRecord } from '@/services/ticketService';

interface TicketApprovalSummaryProps {
  ticket: Pick<TicketRecord, 'approval_status' | 'current_approval_step_name' | 'current_approver_role' | 'current_approver_user_id'>;
  compact?: boolean;
}

function formatRole(value: string) {
  return value.replace(/_/g, ' ');
}

export function TicketApprovalSummary({ ticket, compact = false }: TicketApprovalSummaryProps) {
  if (!ticket.approval_status) return null;

  const status = ticket.approval_status;
  const icon = status === 'approved'
    ? <CheckCircle2 className="h-3.5 w-3.5" />
    : status === 'rejected'
      ? <XCircle className="h-3.5 w-3.5" />
      : status === 'cancelled'
        ? <XCircle className="h-3.5 w-3.5" />
        : <Clock3 className="h-3.5 w-3.5" />;

  const label = status === 'pending'
    ? 'Approval pending'
    : status === 'approved'
      ? 'Approved'
      : status === 'rejected'
        ? 'Approval rejected'
        : 'Approval cancelled';
  const waitingFor = ticket.current_approval_step_name
    ?? (ticket.current_approver_role ? formatRole(ticket.current_approver_role) : null);

  const stateClassName = cn(
    'inline-flex items-center gap-1.5',
    status === 'approved' && 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
    status === 'pending' && 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
    (status === 'rejected' || status === 'cancelled') && 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300',
  );

  if (compact) {
    return (
      <Badge variant="outline" className={stateClassName}>
        {icon}
        {label}
      </Badge>
    );
  }

  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Approval
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={stateClassName}>
          {icon}
          {label}
        </Badge>
        {status === 'pending' && waitingFor && (
          <span className="text-sm text-muted-foreground">Current step: {waitingFor}</span>
        )}
      </div>
    </div>
  );
}