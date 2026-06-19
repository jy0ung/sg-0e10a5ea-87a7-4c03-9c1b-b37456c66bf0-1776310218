import { AlertTriangle, Clock3, MessageSquare, RotateCcw, Shuffle, UserRoundCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RequestOperationalIndicator } from '@/services/requestManagementService';

function compactDuration(ms: number) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `${Math.max(1, hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function TicketOperationalBadges({ indicator }: { indicator?: RequestOperationalIndicator }) {
  if (!indicator) return null;
  const flags = [
    indicator.breached ? { label: 'Breached', className: 'border-red-200 bg-red-50 text-red-700' } : null,
    indicator.at_risk ? { label: 'At risk', className: 'border-amber-200 bg-amber-50 text-amber-700' } : null,
    indicator.stuck ? { label: 'Stuck', className: 'border-orange-200 bg-orange-50 text-orange-700' } : null,
    indicator.stale ? { label: 'Inactive', className: 'border-slate-200 bg-slate-50 text-slate-700' } : null,
    indicator.reopen_count > 0 ? { label: `Reopened ${indicator.reopen_count}`, className: 'border-cyan-200 bg-cyan-50 text-cyan-700' } : null,
  ].filter(Boolean) as Array<{ label: string; className: string }>;

  if (flags.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Badge key={flag.label} variant="outline" className={cn('h-5 rounded-sm px-1.5 text-[10px]', flag.className)}>
          {flag.label}
        </Badge>
      ))}
    </div>
  );
}

export function TicketOperationalIndicatorGrid({ indicator }: { indicator?: RequestOperationalIndicator }) {
  if (!indicator) return null;

  const items = [
    { label: 'Request age', value: compactDuration(indicator.request_age_ms), icon: Clock3 },
    { label: 'In status', value: compactDuration(indicator.time_in_current_status_ms), icon: AlertTriangle },
    { label: 'Pending requester', value: compactDuration(indicator.time_pending_requester_ms), icon: UserRoundCheck },
    { label: 'Pending owner', value: compactDuration(indicator.time_pending_owner_ms), icon: UserRoundCheck },
    { label: 'Handovers', value: String(indicator.handover_count), icon: Shuffle },
    { label: 'Requester follow-ups', value: String(indicator.requester_follow_up_count), icon: UserRoundCheck },
    { label: 'Chat messages', value: String(indicator.chat_message_count), icon: MessageSquare },
    { label: 'Reopen attempts', value: String(indicator.reopen_count), icon: RotateCcw },
  ];

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="eyebrow mb-2">Aging and bottlenecks</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-2 py-1.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="h-3 w-3" />
                {item.label}
              </span>
              <span className="text-xs font-semibold tabular-nums text-foreground">{item.value}</span>
            </div>
          );
        })}
      </div>
      <TicketOperationalBadges indicator={indicator} />
    </div>
  );
}
