import { AlertTriangle, ClipboardList, Clock3, Inbox, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RequestQueueMetrics {
  active: number;
  unassigned: number;
  slaBreached: number;
  slaAtRisk: number;
  awaitingApproval: number;
}

interface RequestQueueMetricGridProps {
  metrics: RequestQueueMetrics;
}

interface MetricItem {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: string;
}

export function RequestQueueMetricGrid({ metrics }: RequestQueueMetricGridProps) {
  const items: MetricItem[] = [
    {
      label: 'Active',
      value: metrics.active,
      icon: <ClipboardList className="h-4 w-4" />,
      accent: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Unassigned',
      value: metrics.unassigned,
      icon: <Inbox className="h-4 w-4" />,
      accent: metrics.unassigned > 0 ? 'text-amber-600 dark:text-amber-400' : undefined,
    },
    {
      label: 'SLA Breached',
      value: metrics.slaBreached,
      icon: <Clock3 className="h-4 w-4" />,
      accent: metrics.slaBreached > 0 ? 'text-red-600 dark:text-red-400' : undefined,
    },
    {
      label: 'At Risk',
      value: metrics.slaAtRisk,
      icon: <AlertTriangle className="h-4 w-4" />,
      accent: metrics.slaAtRisk > 0 ? 'text-orange-600 dark:text-orange-400' : undefined,
    },
    {
      label: 'Approvals',
      value: metrics.awaitingApproval,
      icon: <ShieldCheck className="h-4 w-4" />,
      accent: metrics.awaitingApproval > 0 ? 'text-purple-600 dark:text-purple-400' : undefined,
    },
  ];

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="kpi-card flex min-w-[130px] flex-1 items-center gap-3 !p-3"
        >
          <div className={cn('shrink-0', item.accent ?? 'text-muted-foreground')}>
            {item.icon}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-none tabular-nums text-foreground">{item.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}