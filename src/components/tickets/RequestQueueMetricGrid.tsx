import type { ElementType } from 'react';
import { AlertTriangle, ClipboardList, Clock3, Inbox, ShieldCheck } from 'lucide-react';
import { MetricCard } from '@/components/shared/MetricCard';
import type { Tone } from '@/lib/statusTones';

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

export function RequestQueueMetricGrid({ metrics }: RequestQueueMetricGridProps) {
  const items: Array<{ label: string; value: number; icon: ElementType; tone: Tone }> = [
    { label: 'Active', value: metrics.active, icon: ClipboardList, tone: 'blue' },
    { label: 'Unassigned', value: metrics.unassigned, icon: Inbox, tone: metrics.unassigned > 0 ? 'amber' : 'slate' },
    { label: 'SLA breached', value: metrics.slaBreached, icon: Clock3, tone: metrics.slaBreached > 0 ? 'red' : 'slate' },
    { label: 'At risk', value: metrics.slaAtRisk, icon: AlertTriangle, tone: metrics.slaAtRisk > 0 ? 'amber' : 'slate' },
    { label: 'Approvals', value: metrics.awaitingApproval, icon: ShieldCheck, tone: metrics.awaitingApproval > 0 ? 'violet' : 'slate' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <MetricCard key={item.label} label={item.label} value={item.value} icon={item.icon} tone={item.tone} />
      ))}
    </div>
  );
}