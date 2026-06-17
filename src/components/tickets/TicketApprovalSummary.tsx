import { CheckCircle2, Clock3, ShieldCheck, XCircle } from 'lucide-react';

import { RequestBadge } from '@/components/tickets/RequestBadge';
import { approvalTone } from '@/lib/requestTones';
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
  const Icon = status === 'approved'
    ? CheckCircle2
    : status === 'rejected' || status === 'cancelled'
      ? XCircle
      : Clock3;

  const label = status === 'pending'
    ? 'Approval pending'
    : status === 'approved'
      ? 'Approved'
      : status === 'rejected'
        ? 'Approval rejected'
        : 'Approval cancelled';
  const waitingFor = ticket.current_approval_step_name
    ?? (ticket.current_approver_role ? formatRole(ticket.current_approver_role) : null);

  if (compact) {
    return <RequestBadge tone={approvalTone(status)} label={label} icon={Icon} />;
  }

  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="eyebrow flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5" />
        Approval
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <RequestBadge tone={approvalTone(status)} label={label} icon={Icon} />
        {status === 'pending' && waitingFor && (
          <span className="text-sm text-muted-foreground">Current step: {waitingFor}</span>
        )}
      </div>
    </div>
  );
}