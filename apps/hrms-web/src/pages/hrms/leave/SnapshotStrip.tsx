import React from 'react';
import { CalendarDays, Clock, Users, Bell } from 'lucide-react';
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

function Pill({
  icon,
  label,
  value,
  accentClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accentClass?: string;
}) {
  return (
    <div className={`flex items-center gap-2 border-l-2 pl-3 ${accentClass ?? 'border-primary/30'}`}>
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums leading-tight">{value}</p>
      </div>
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
      <div className="flex h-14 animate-pulse items-center gap-6 rounded-lg border bg-card/50 px-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-8 w-24 rounded bg-muted/50" />
        ))}
      </div>
    );
  }

  // Primary balance (first balance that requires a balance type)
  const primaryBalance = leaveBalances.find(b => b.remainingDays != null);
  const upcomingLeave = myUpcoming[0];

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border bg-card/60 px-4 py-3 shadow-sm">
      {primaryBalance && (
        <Pill
          icon={<CalendarDays className="h-4 w-4" />}
          label="Leave Available"
          value={`${formatDays(primaryBalance.remainingDays)} days`}
          accentClass="border-emerald-400/50"
        />
      )}
      <Pill
        icon={<Clock className="h-4 w-4" />}
        label="My Pending"
        value={myActivePending.length}
        accentClass={myActivePending.length > 0 ? 'border-amber-400/60' : 'border-primary/30'}
      />
      {upcomingLeave ? (
        <Pill
          icon={<CalendarDays className="h-4 w-4" />}
          label="Next Leave"
          value={fmtDateRange(upcomingLeave.startDate, upcomingLeave.endDate)}
          accentClass="border-blue-400/50"
        />
      ) : (
        <Pill
          icon={<CalendarDays className="h-4 w-4" />}
          label="Next Leave"
          value="None scheduled"
          accentClass="border-primary/20"
        />
      )}
      {isManager && (
        <>
          <Pill
            icon={<Bell className="h-4 w-4" />}
            label="Needs My Action"
            value={pendingForMeCount}
            accentClass={pendingForMeCount > 0 ? 'border-red-400/60' : 'border-primary/30'}
          />
          <Pill
            icon={<Users className="h-4 w-4" />}
            label="Team On Leave Today"
            value={teamOnLeaveToday.length}
            accentClass="border-violet-400/50"
          />
        </>
      )}
    </div>
  );
}
