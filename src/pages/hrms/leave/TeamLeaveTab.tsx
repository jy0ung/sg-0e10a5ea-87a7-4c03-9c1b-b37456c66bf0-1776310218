import { Badge } from '@/components/ui/badge';

import { format, parseISO } from 'date-fns';
import {
  Calendar, Users, Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeaveRequest } from '@/types';

interface TeamLeaveTabProps {
  requests: LeaveRequest[];
  teamOnLeaveToday: LeaveRequest[];
  onRequestClick: (request: LeaveRequest) => void;
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  approved:  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  rejected:  'bg-red-500/15 text-red-700 dark:text-red-400',
  cancelled: 'bg-gray-500/15 text-gray-500',
};

function formatDateShort(d: string): string {
  try { return format(parseISO(d), 'dd MMM'); } catch { return d; }
}

function getInitial(name?: string): string {
  return name?.charAt(0)?.toUpperCase() ?? '?';
}

export default function TeamLeaveTab({
  requests,
  teamOnLeaveToday,
  onRequestClick,
}: TeamLeaveTabProps) {
  const pendingTeamRequests = requests.filter(r => r.status === 'pending');

  // Upcoming week: approved leave starting within 7 days
  const today = new Date();
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const todayStr = today.toISOString().slice(0, 10);
  const weekStr = weekAhead.toISOString().slice(0, 10);
  const upcomingThisWeek = requests.filter(r =>
    r.status === 'approved' && r.startDate >= todayStr && r.startDate <= weekStr
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Team On Leave Today */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          On Leave Today
          {teamOnLeaveToday.length > 0 && (
            <Badge variant="outline" className="ml-2 text-[10px] bg-primary/10 text-primary border-0">
              {teamOnLeaveToday.length}
            </Badge>
          )}
        </h3>
        {teamOnLeaveToday.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 px-4 py-4 text-center">
            <Users className="h-4 w-4 text-muted-foreground/40 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Full team available today</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {teamOnLeaveToday.map(req => (
              <button
                key={req.id}
                type="button"
                onClick={() => onRequestClick(req)}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 transition-all hover:shadow-sm hover:border-border group"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {getInitial(req.employeeName)}
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium text-foreground">{req.employeeName ?? 'Employee'}</p>
                  <p className="text-[10px] text-muted-foreground">{req.leaveTypeName}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming This Week */}
      {upcomingThisWeek.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Upcoming This Week
          </h3>
          <div className="space-y-1.5">
            {upcomingThisWeek.map(req => (
              <TeamRequestRow key={req.id} request={req} onClick={() => onRequestClick(req)} />
            ))}
          </div>
        </section>
      )}

      {/* Pending Team Leave */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Pending Team Leave
          {pendingTeamRequests.length > 0 && (
            <Badge variant="outline" className="ml-2 text-[10px] bg-amber-500/10 text-amber-600 border-0">
              {pendingTeamRequests.length}
            </Badge>
          )}
        </h3>
        {pendingTeamRequests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 px-4 py-4 text-center">
            <Inbox className="h-4 w-4 text-muted-foreground/40 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">No pending team leave requests</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {pendingTeamRequests.map(req => (
              <TeamRequestRow key={req.id} request={req} onClick={() => onRequestClick(req)} />
            ))}
          </div>
        )}
      </section>

      {/* All Team Requests */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          All Team Leave
        </h3>
        {requests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 px-4 py-4 text-center">
            <p className="text-xs text-muted-foreground">No team leave records</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {requests.slice(0, 20).map(req => (
              <TeamRequestRow key={req.id} request={req} onClick={() => onRequestClick(req)} />
            ))}
            {requests.length > 20 && (
              <p className="text-[11px] text-muted-foreground text-center pt-1">
                Showing 20 of {requests.length} requests
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function TeamRequestRow({ request, onClick }: { request: LeaveRequest; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3.5 py-2.5 transition-all hover:border-border hover:shadow-sm hover:bg-accent/30 group"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary shrink-0">
        {getInitial(request.employeeName)}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {request.employeeName ?? 'Employee'}
          </span>
          <span className="text-xs text-muted-foreground">
            {request.leaveTypeName} · {request.days}d
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3 shrink-0" />
          <span>{formatDateShort(request.startDate)} — {formatDateShort(request.endDate)}</span>
        </div>
      </div>
      <Badge
        variant="outline"
        className={cn('text-[11px] font-medium capitalize border-0 px-2 py-0.5 shrink-0', STATUS_STYLES[request.status])}
      >
        {request.status}
      </Badge>
    </button>
  );
}
