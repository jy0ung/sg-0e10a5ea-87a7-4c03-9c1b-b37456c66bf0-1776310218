import { Clock3 } from 'lucide-react';
import { RequestBadge } from '@/components/tickets/RequestBadge';
import { slaTone } from '@/lib/requestTones';
import {
  formatSlaCompactLabel,
  formatSlaCheck,
  formatSlaState,
  getTicketSlaSummary,
  type TicketSlaInput,
} from '@/lib/ticketSla';

interface TicketSlaSummaryProps {
  ticket: TicketSlaInput;
  compact?: boolean;
}

export function TicketSlaSummary({ ticket, compact = false }: TicketSlaSummaryProps) {
  const sla = getTicketSlaSummary(ticket);

  if (compact) {
    return <RequestBadge tone={slaTone(sla.overall)} label={formatSlaCompactLabel(sla)} icon={Clock3} />;
  }

  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-2">
          <Clock3 className="h-3.5 w-3.5" />
          SLA
        </p>
        <RequestBadge tone={slaTone(sla.overall)} label={formatSlaState(sla.overall)} />
      </div>
      <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">First response</p>
          <p className="text-foreground">{formatSlaCheck(sla.response)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Resolution</p>
          <p className="text-foreground">{formatSlaCheck(sla.resolution)}</p>
        </div>
      </div>
    </div>
  );
}
