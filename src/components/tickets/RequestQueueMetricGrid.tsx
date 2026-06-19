import type { ElementType } from 'react';
import { AlertTriangle, Clock3, Inbox, UserCheck } from 'lucide-react';
import { MetricCard } from '@/components/shared/MetricCard';
import type { Tone } from '@/lib/statusTones';

interface RequestQueueMetrics {
  unassigned: number;
  inProgress: number;
  pendingRequester: number;
  slaBreached: number;
  slaAtRisk: number;
}

interface RequestQueueMetricGridProps {
  metrics: RequestQueueMetrics;
}

export function RequestQueueMetricGrid({ metrics }: RequestQueueMetricGridProps) {
  const items: Array<{ label: string; value: number; icon: ElementType; tone: Tone }> = [
    { label: 'Unassigned', value: metrics.unassigned, icon: Inbox, tone: metrics.unassigned > 0 ? 'amber' : 'slate' },
    { label: 'In Progress', value: metrics.inProgress, icon: UserCheck, tone: 'blue' },
    { label: 'Pending Requester', value: metrics.pendingRequester, icon: Clock3, tone: metrics.pendingRequester > 0 ? 'amber' : 'slate' },
    { label: 'SLA breached', value: metrics.slaBreached, icon: Clock3, tone: metrics.slaBreached > 0 ? 'red' : 'slate' },
    { label: 'At risk', value: metrics.slaAtRisk, icon: AlertTriangle, tone: metrics.slaAtRisk > 0 ? 'amber' : 'slate' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <MetricCard key={item.label} label={item.label} value={item.value} icon={item.icon} tone={item.tone} />
      ))}
    </div>
  );
}
