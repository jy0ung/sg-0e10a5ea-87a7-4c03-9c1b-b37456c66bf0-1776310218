import React from 'react';
import type { LeaveBalance, LeaveRequest } from '@/types';
import { formatDays, fmtDateRange } from './utils';

// ── SnapshotStrip ────────────────────────────────────────────────────────────

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
        className={`font-bold leading-none tabular-nums ${
          compact ? 'text-base' : 'text-2xl'
        } ${valueClass}`}
      >
        {value}
      </span>
      <span className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {sub && (
        <span className="mt-0.5 max-w-[10rem] truncate text-xs text-muted-foreground">{sub}</span>
      )}
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
    return (
      <div className="flex h-[4.5rem] animate-pulse items-center rounded-xl border bg-card/50 shadow-sm" />
    );
  }

  const primaryBalance = leaveBalances.find(b => b.remainingDays != null);
  const upcomingLeave = myUpcoming[0];
  const pendingValue = myActivePending.length;
  const actionValue = pendingForMeCount;
  const teamValue = teamOnLeaveToday.length;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grid grid-cols-2 divide-x divide-y sm:flex sm:flex-nowrap sm:divide-y-0">
        {primaryBalance != null && (
          <KpiStat
            label="Leave Available"
            value={formatDays(primaryBalance.remainingDays)}
            valueClass={
              primaryBalance.remainingDays <= 0
                ? 'text-red-600 dark:text-red-400'
                : primaryBalance.remainingDays <= 3
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
            }
            sub="days remaining"
          />
        )}
        <KpiStat
          label="My Pending"
          value={pendingValue}
          valueClass={
            pendingValue > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground'
          }
        />
        <KpiStat
          label="Next Leave"
          value={
            upcomingLeave ? fmtDateRange(upcomingLeave.startDate, upcomingLeave.endDate) : '\u2014'
          }
          valueClass={
            upcomingLeave
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-muted-foreground'
          }
          sub={
            upcomingLeave
              ? `${formatDays(upcomingLeave.days)} day${upcomingLeave.days !== 1 ? 's' : ''}`
              : 'None scheduled'
          }
          compact
        />
        {isManager && (
          <>
            <KpiStat
              label="Needs My Action"
              value={actionValue}
              valueClass={
                actionValue > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
              }
            />
            <KpiStat
              label="Team Away Today"
              value={teamValue}
              valueClass={
                teamValue > 0
                  ? 'text-violet-600 dark:text-violet-400'
                  : 'text-muted-foreground'
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
