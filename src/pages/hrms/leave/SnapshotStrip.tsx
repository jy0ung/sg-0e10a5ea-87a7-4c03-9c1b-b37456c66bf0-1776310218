import {
  CalendarDays, Clock, CalendarCheck, AlertCircle, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeaveBalance, LeaveRequest } from '@/types';

interface SnapshotStripProps {
  balances: LeaveBalance[];
  pendingCount: number;
  upcomingLeave: LeaveRequest | null;
  myQueueCount: number;
  teamOnLeaveTodayCount: number;
  isManager: boolean;
  canAccessApprovalInbox: boolean;
}

interface MetricPill {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: string;
  visible: boolean;
}

export default function SnapshotStrip({
  balances,
  pendingCount,
  upcomingLeave,
  myQueueCount,
  teamOnLeaveTodayCount,
  isManager,
  canAccessApprovalInbox,
}: SnapshotStripProps) {
  // Find annual leave balance
  const annualBalance = balances.find(b =>
    (b as unknown as { leaveTypeName?: string }).leaveTypeName?.toLowerCase().includes('annual')
  );
  const annualAvailable = annualBalance?.remainingDays ?? '—';

  const metrics: MetricPill[] = [
    {
      label: 'Annual Leave',
      value: annualAvailable,
      icon: <CalendarDays className="h-3.5 w-3.5" />,
      accent: 'text-emerald-600 dark:text-emerald-400',
      visible: true,
    },
    {
      label: 'Pending',
      value: pendingCount,
      icon: <Clock className="h-3.5 w-3.5" />,
      accent: pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
      visible: true,
    },
    {
      label: 'Upcoming',
      value: upcomingLeave ? `${upcomingLeave.startDate.slice(5)}` : '—',
      icon: <CalendarCheck className="h-3.5 w-3.5" />,
      accent: 'text-primary',
      visible: true,
    },
    {
      label: 'Needs Action',
      value: myQueueCount,
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      accent: myQueueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
      visible: canAccessApprovalInbox,
    },
    {
      label: 'On Leave Today',
      value: teamOnLeaveTodayCount,
      icon: <Users className="h-3.5 w-3.5" />,
      accent: 'text-primary',
      visible: isManager,
    },
  ];

  const visibleMetrics = metrics.filter(m => m.visible);

  return (
    <div className="flex flex-wrap gap-2">
      {visibleMetrics.map(metric => (
        <div
          key={metric.label}
          className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3.5 py-2 transition-colors hover:bg-accent/30"
        >
          <span className={cn('shrink-0', metric.accent ?? 'text-muted-foreground')}>
            {metric.icon}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 leading-none mb-0.5">
              {metric.label}
            </p>
            <p className={cn('text-sm font-bold leading-none', metric.accent)}>
              {metric.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
