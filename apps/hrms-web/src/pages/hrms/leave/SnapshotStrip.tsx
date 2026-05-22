import React from 'react';
import { AlertTriangle, CalendarClock, ShieldCheck, Users } from 'lucide-react';
import type { LeaveBalance, LeaveRequest } from '@/types';
import { formatDays, fmtDateRange } from './utils';

interface SnapshotStripProps {
  leaveBalances: LeaveBalance[];
  myActivePending: LeaveRequest[];
  myUpcoming: LeaveRequest[];
  pendingForMeCount: number;
  teamOnLeaveToday: LeaveRequest[];
  isManager: boolean;
  isLoading: boolean;
}

function KpiStat({
  label,
  value,
  valueClass = 'text-foreground',
  sub,
  compact = false,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-4 text-center sm:px-5">
      <span
        className={`font-bold leading-none tabular-nums ${compact ? 'text-base' : 'text-2xl'} ${valueClass}`}
      >
        {value}
      </span>
      <span className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {sub && <span className="mt-0.5 max-w-[10rem] truncate text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

export function SnapshotStrip({
  leaveBalances,
  myActivePending,
  myUpcoming,
  pendingForMeCount,
  teamOnLeaveToday,
  isManager,
  isLoading,
}: SnapshotStripProps) {
  if (isLoading) {
    return <div className="flex h-[4.5rem] animate-pulse items-center rounded-xl border bg-card/50 shadow-sm" />;
  }

  const primaryBalance = leaveBalances.find(b => b.remainingDays != null);
  const upcomingLeave = myUpcoming[0];
  const pendingValue = myActivePending.length;
  const actionValue = pendingForMeCount;
  const teamValue = teamOnLeaveToday.length;
  const balancesMissing = primaryBalance == null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grid grid-cols-2 divide-x divide-y sm:flex sm:flex-nowrap sm:divide-y-0">
        <KpiStat
          label="Annual Leave Available"
          value={balancesMissing ? '—' : formatDays(primaryBalance.remainingDays)}
          valueClass={
            balancesMissing
              ? 'text-muted-foreground'
              : primaryBalance.remainingDays <= 0
                ? 'text-red-600 dark:text-red-400'
                : primaryBalance.remainingDays <= 3
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
          }
          sub={balancesMissing ? 'Balance not initialized' : 'days remaining'}
        />
        <KpiStat
          label="Pending Requests"
          value={pendingValue}
          valueClass={pendingValue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}
        />
        <KpiStat
          label="Upcoming Leave"
          value={upcomingLeave ? fmtDateRange(upcomingLeave.startDate, upcomingLeave.endDate) : '—'}
          valueClass={upcomingLeave ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}
          sub={upcomingLeave ? `${formatDays(upcomingLeave.days)} day${upcomingLeave.days !== 1 ? 's' : ''}` : 'None scheduled'}
          compact
        />
        {isManager && (
          <>
            <KpiStat
              label="Needs My Action"
              value={actionValue}
              valueClass={actionValue > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}
            />
            <KpiStat
              label="Team On Leave Today"
              value={teamValue}
              valueClass={teamValue > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground'}
            />
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          Working days only, weekends and public holidays excluded
        </span>
        {isManager && (
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Approval queue shows only requests assigned to you
          </span>
        )}
        {teamValue > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {teamValue} teammate{teamValue === 1 ? '' : 's'} away today
          </span>
        )}
        {balancesMissing && (
          <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Leave balances need HR initialization
          </span>
        )}
      </div>
    </div>
  );
}
