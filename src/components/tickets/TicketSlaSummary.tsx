import { Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  formatSlaCompactLabel,
  formatSlaCheck,
  formatSlaState,
  getTicketSlaSummary,
  type TicketSlaInput,
  type TicketSlaState,
} from '@/lib/ticketSla';

const slaVariant: Record<TicketSlaState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  breached: 'destructive',
  at_risk: 'secondary',
  pending: 'outline',
  met: 'outline',
  not_configured: 'outline',
};

interface TicketSlaSummaryProps {
  ticket: TicketSlaInput;
  compact?: boolean;
}

export function TicketSlaSummary({ ticket, compact = false }: TicketSlaSummaryProps) {
  const sla = getTicketSlaSummary(ticket);

  if (compact) {
    return (
      <Badge variant={slaVariant[sla.overall]} className="inline-flex items-center gap-1">
        <Clock3 className="h-3 w-3" />
        {formatSlaCompactLabel(sla)}
      </Badge>
    );
  }

  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          SLA
        </p>
        <Badge variant={slaVariant[sla.overall]}>{formatSlaState(sla.overall)}</Badge>
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
