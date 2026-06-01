import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  Megaphone,
  Star,
  TrendingUp,
  Users,
  AlertCircle,
  CalendarCheck,
  PlusCircle,
  Settings2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { useLeaveData } from '@/hooks/useLeaveData';
import { useApprovalInboxItems } from '@/hooks/useApprovalInboxItems';
import { listAnnouncements, listAttendanceRecords } from '@/services/hrmsService';
import { cn } from '@/lib/utils';
import { MetricCard } from '@/components/shared/MetricCard';
import { SectionCard } from '@/components/shared/SectionCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toneClass, type Tone } from '@/lib/statusTones';
import type { Announcement, LeaveBalance, LeaveRequest } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function fmtDate(iso: string): string {
  try {
    return format(new Date(iso), 'd MMM');
  } catch {
    return iso;
  }
}

function fmtLeaveRange(start: string, end: string): string {
  if (start === end) return fmtDate(start);
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface QuickActionRowProps {
  label: string;
  description: string;
  icon: React.ElementType;
  tone: Tone;
  href: string;
}

const ACTION_CHIP: Record<Tone, string> = {
  amber:   'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  red:     'bg-red-500/12 text-red-600 dark:text-red-400',
  blue:    'bg-blue-500/12 text-blue-600 dark:text-blue-400',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  violet:  'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  slate:   'bg-slate-500/12 text-slate-600 dark:text-slate-300',
  muted:   'bg-primary/10 text-primary',
};

function QuickActionRow({ label, description, icon: Icon, tone, href }: QuickActionRowProps) {
  return (
    <Link
      to={href}
      className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all hover:border-primary/30 hover:bg-muted/40"
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', ACTION_CHIP[tone])}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight text-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

const LEAVE_ROW_ICON_TONE = 'bg-primary/10 text-primary';

interface LeaveRequestRowProps {
  request: LeaveRequest;
  leaveTypeName: string;
}

function LeaveRequestRow({ request, leaveTypeName }: LeaveRequestRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50">
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', LEAVE_ROW_ICON_TONE)}>
          <Calendar className="h-3.5 w-3.5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{leaveTypeName}</p>
          <p className="text-xs text-muted-foreground">{fmtLeaveRange(request.startDate, request.endDate)}</p>
        </div>
      </div>
      <StatusBadge status={request.status} domain="leave" className="shrink-0" />
    </div>
  );
}

interface BalanceRowProps {
  balance: LeaveBalance;
  typeName: string;
}

function BalanceRow({ balance, typeName }: BalanceRowProps) {
  const pct = balance.entitledDays > 0
    ? Math.round((balance.remainingDays / balance.entitledDays) * 100)
    : 0;

  const barColor = balance.remainingDays <= 0
    ? 'bg-red-500'
    : balance.remainingDays <= 3
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{typeName}</span>
        <span className="tabular-nums text-muted-foreground">
          {balance.remainingDays} / {balance.entitledDays} days
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HrmsDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hrmsAccess = useHrmsAccess();
  const today = new Date().toISOString().slice(0, 10);

  const selfServiceEmployeeId = user?.employeeId ?? user?.id;

  const leaveData = useLeaveData();
  const { items: approvalItems } = useApprovalInboxItems({
    enabled: hrmsAccess.canApproveRequests,
  });

  // Announcements — 3 most recent
  const { data: announcements = [], isPending: announcementsLoading } = useQuery({
    queryKey: ['announcements-dashboard', user?.companyId],
    queryFn: async (): Promise<Announcement[]> => {
      const res = await listAnnouncements(user!.companyId);
      return res.data.slice(0, 4);
    },
    enabled: !!user?.companyId,
  });

  // Attendance today (self-service)
  const { data: todayAttendance } = useQuery({
    queryKey: ['attendance-today', user?.companyId, selfServiceEmployeeId, today],
    queryFn: async () => {
      const res = await listAttendanceRecords(user!.companyId, {
        employeeId: selfServiceEmployeeId,
        dateFrom: today,
        dateTo: today,
      });
      return res.data[0] ?? null;
    },
    enabled: !!user?.companyId && !!selfServiceEmployeeId,
  });

  // Derived values
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const primaryBalance = leaveData.leaveBalances.find((b) => b.remainingDays != null) ?? null;

  const leaveTypeMap = useMemo(
    () => new Map(leaveData.leaveTypes.map((t) => [t.id, t.name])),
    [leaveData.leaveTypes],
  );

  const activeAndUpcomingRequests = useMemo(
    () => leaveData.myRequests
      .filter((r) => r.status === 'pending' || (r.status === 'approved' && r.endDate >= today))
      .slice(0, 5),
    [leaveData.myRequests, today],
  );

  const balancesToShow = leaveData.leaveBalances.slice(0, 5);

  const isManager = hrmsAccess.canApproveRequests || hrmsAccess.canAccessEmployees;
  const isHrAdmin = hrmsAccess.canAccessSettings;

  const attendanceLabel =
    todayAttendance?.status === 'present' ? 'Clocked In'
    : todayAttendance?.status === 'absent' ? 'Absent'
    : todayAttendance?.status === 'on_leave' ? 'On Leave'
    : todayAttendance?.status === 'half_day' ? 'Half Day'
    : 'Not Recorded';

  const attendanceColor =
    todayAttendance?.status === 'present' ? 'text-emerald-600'
    : todayAttendance?.status === 'absent' ? 'text-red-600'
    : todayAttendance?.status === 'on_leave' ? 'text-blue-600'
    : 'text-muted-foreground';

  // Priority announcements first
  const sortedAnnouncements = [...announcements].sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const aOrder = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
    const bOrder = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
    return aOrder - bOrder;
  });

  const announcementTone: Record<string, Tone> = {
    urgent: 'red',
    high:   'amber',
    normal: 'blue',
    low:    'slate',
  };

  return (
    <div className="w-full space-y-6">

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <header className="surface-card hero-gradient flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <span className="text-base font-bold">{getInitials(user?.name)}</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold leading-tight tracking-tight text-foreground">
                {getGreeting()}, {firstName}
              </h1>
              {hrmsAccess.primaryRoleLabel && (
                <Badge variant="outline" className="border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] text-primary">
                  {hrmsAccess.primaryRoleLabel}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {format(new Date(), 'EEEE, d MMMM yyyy')}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/leave">
              <PlusCircle className="h-4 w-4" aria-hidden />
              Apply for leave
            </Link>
          </Button>
          {hrmsAccess.canApproveRequests && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/approvals">
                <Inbox className="h-4 w-4" aria-hidden />
                Approvals
                {approvalItems.length > 0 && (
                  <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                    {approvalItems.length}
                  </span>
                )}
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* ── Metric Strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        <MetricCard
          label="Leave Available"
          value={primaryBalance != null ? `${primaryBalance.remainingDays}d` : '—'}
          hint={primaryBalance != null ? 'days remaining' : 'No balance data'}
          icon={Calendar}
          tone="emerald"
          onClick={() => navigate('/leave')}
          loading={leaveData.isLoading}
          data-testid="hrms-metric-leave-available"
        />
        <MetricCard
          label="My Pending"
          value={leaveData.myActivePending.length}
          hint={leaveData.myActivePending.length === 1 ? 'leave request' : 'leave requests'}
          icon={Clock}
          tone={leaveData.myActivePending.length > 0 ? 'amber' : 'muted'}
          onClick={() => navigate('/leave')}
          loading={leaveData.isLoading}
          data-testid="hrms-metric-pending"
        />
        <MetricCard
          label="Attendance Today"
          value={<span className={attendanceColor}>{attendanceLabel}</span>}
          hint={todayAttendance?.clockIn ? `In: ${todayAttendance.clockIn}` : undefined}
          icon={CheckCircle2}
          tone="blue"
        />
        <MetricCard
          label="Upcoming Leave"
          value={leaveData.myUpcoming.length > 0 ? fmtLeaveRange(leaveData.myUpcoming[0].startDate, leaveData.myUpcoming[0].endDate) : '—'}
          hint={leaveData.myUpcoming.length > 0 ? leaveTypeMap.get(leaveData.myUpcoming[0].leaveTypeId) : 'None scheduled'}
          icon={CalendarCheck}
          tone="violet"
          onClick={() => navigate('/leave')}
          loading={leaveData.isLoading}
        />
        {isManager && (
          <MetricCard
            label="Needs My Action"
            value={approvalItems.length}
            hint={approvalItems.length === 1 ? 'approval pending' : 'approvals pending'}
            icon={Inbox}
            tone={approvalItems.length > 0 ? 'amber' : 'muted'}
            onClick={() => navigate('/approvals')}
            data-testid="hrms-metric-approvals"
          />
        )}
      </div>

      {/* ── Main content grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

        {/* ── Left / Main column (2/3) ─────────────────────────────────────── */}
        <div className="space-y-6 xl:col-span-2">

          {/* Action Required — managers only */}
          {isManager && approvalItems.length > 0 && (
            <SectionCard
              title="Action required"
              description={`${approvalItems.length} ${approvalItems.length === 1 ? 'item needs' : 'items need'} your review`}
              icon={Inbox}
              action={{ label: 'View all', to: '/approvals' }}
              bodyClassName="p-0"
            >
              <div className="divide-y">
                {approvalItems.slice(0, 5).map((item) => (
                  <Link key={item.entityId} to="/approvals" className="block transition-colors hover:bg-muted/50">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400">
                        <Inbox className="h-3.5 w-3.5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                      </div>
                      <Badge className={cn('shrink-0 text-xs', toneClass('amber'))}>Review</Badge>
                    </div>
                  </Link>
                ))}
                {approvalItems.length > 5 && (
                  <div className="px-4 py-2.5 text-center">
                    <Link to="/approvals" className="text-xs font-semibold text-primary hover:underline">
                      +{approvalItems.length - 5} more pending
                    </Link>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* My Leave Requests */}
          <SectionCard
            title={activeAndUpcomingRequests.length > 0 ? 'My active leave' : 'My recent leave'}
            description="Requests in progress and upcoming time off"
            icon={Calendar}
            action={{ label: 'View all', to: '/leave' }}
            bodyClassName="p-0"
          >
            {leaveData.isLoading ? (
              <div className="divide-y">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : activeAndUpcomingRequests.length > 0 ? (
              <div className="divide-y">
                {activeAndUpcomingRequests.map((req) => (
                  <LeaveRequestRow
                    key={req.id}
                    request={req}
                    leaveTypeName={leaveTypeMap.get(req.leaveTypeId) ?? 'Leave'}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <Calendar className="h-8 w-8 opacity-25" aria-hidden />
                <p className="text-sm">No active or upcoming leave</p>
                <Button asChild variant="outline" size="sm" className="mt-1 gap-1.5">
                  <Link to="/leave">Apply for leave</Link>
                </Button>
              </div>
            )}
          </SectionCard>

          {/* Announcements */}
          <SectionCard
            title="Recent announcements"
            description="Company communications and notices"
            icon={Megaphone}
            action={{ label: 'View all', to: '/announcements' }}
            bodyClassName="p-0"
          >
            {announcementsLoading ? (
              <div className="divide-y">
                {[1, 2].map((i) => (
                  <div key={i} className="px-4 py-3">
                    <Skeleton className="mb-2 h-4 w-48" />
                    <Skeleton className="mb-1 h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            ) : sortedAnnouncements.length > 0 ? (
              <div className="divide-y">
                {sortedAnnouncements.map((ann) => (
                  <Link
                    key={ann.id}
                    to="/announcements"
                    className={cn('block px-4 py-3 transition-colors hover:bg-muted/50', ann.pinned && 'bg-primary/[0.03]')}
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Megaphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <p className="truncate text-sm font-semibold text-foreground">{ann.title}</p>
                      </div>
                      <Badge className={cn('shrink-0 text-[10px] capitalize', toneClass(announcementTone[ann.priority] ?? 'slate'))}>
                        {ann.priority}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{ann.body}</p>
                    <p className="mt-1.5 text-[10px] text-muted-foreground/60">
                      {ann.authorName ?? 'HR'} · {timeAgo(ann.createdAt)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <Megaphone className="h-8 w-8 opacity-25" aria-hidden />
                <p className="text-sm">No announcements yet</p>
              </div>
            )}
          </SectionCard>

        </div>

        {/* ── Right Sidebar (1/3) ──────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Leave Balances */}
          <SectionCard
            title="Leave balances"
            description="Entitlement remaining by type"
            icon={CalendarCheck}
            action={{ label: 'Manage', to: '/leave' }}
          >
            {leaveData.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : balancesToShow.length > 0 ? (
              <div className="space-y-3.5">
                {balancesToShow.map((balance) => (
                  <BalanceRow
                    key={balance.id}
                    balance={balance}
                    typeName={leaveData.leaveTypes.find((t) => t.id === balance.leaveTypeId)?.name ?? 'Leave'}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
                <AlertCircle className="h-6 w-6 opacity-30" aria-hidden />
                <p className="text-sm">Balances not initialised</p>
                <p className="text-xs">Contact HR to set up your leave balances.</p>
              </div>
            )}
          </SectionCard>

          {/* Quick Actions */}
          <SectionCard title="Quick actions" icon={TrendingUp} bodyClassName="space-y-2 p-3">
            <QuickActionRow
              label="Apply for leave"
              description="Submit a new leave request"
              icon={Calendar}
              tone="emerald"
              href="/leave"
            />
            {hrmsAccess.canApproveRequests && (
              <QuickActionRow
                label="Approval inbox"
                description={approvalItems.length > 0 ? `${approvalItems.length} items need your review` : 'Review pending items'}
                icon={Inbox}
                tone="amber"
                href="/approvals"
              />
            )}
            {hrmsAccess.canAccessAppraisals && (
              <QuickActionRow
                label="My appraisals"
                description="View performance reviews"
                icon={Star}
                tone="violet"
                href="/appraisals"
              />
            )}
            {hrmsAccess.canAccessEmployees && (
              <QuickActionRow
                label="Employee directory"
                description="Browse workforce records"
                icon={Users}
                tone="blue"
                href="/employees"
              />
            )}
            {isHrAdmin && (
              <QuickActionRow
                label="HRMS settings"
                description="Manage roles, flows, and config"
                icon={Settings2}
                tone="slate"
                href="/settings"
              />
            )}
          </SectionCard>

          {/* Workforce context — managers/HR */}
          {isManager && (
            <SectionCard
              title="Team at a glance"
              description="Who's out and what's pending"
              icon={Users}
              action={{ label: 'Calendar', to: '/leave/calendar' }}
            >
              {leaveData.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="text-sm font-medium">Team on leave today</span>
                    </div>
                    <span className="font-bold tabular-nums text-foreground">{leaveData.teamOnLeaveToday.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="text-sm font-medium">Pending approvals</span>
                    </div>
                    <span className={cn('font-bold tabular-nums', approvalItems.length > 0 ? 'text-amber-600' : 'text-foreground')}>
                      {approvalItems.length}
                    </span>
                  </div>
                  {leaveData.teamOnLeaveToday.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Away today</p>
                      {leaveData.teamOnLeaveToday.slice(0, 3).map((req) => (
                        <div key={req.id} className="flex items-center gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                            {getInitials(req.employeeName)}
                          </div>
                          <span className="truncate text-xs text-foreground">{req.employeeName}</span>
                        </div>
                      ))}
                      {leaveData.teamOnLeaveToday.length > 3 && (
                        <p className="text-xs text-muted-foreground">+{leaveData.teamOnLeaveToday.length - 3} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          )}

          {/* Performance / Appraisals teaser */}
          {hrmsAccess.canAccessAppraisals && (
            <SectionCard title="Performance" icon={Star} action={{ label: 'Open', to: '/appraisals' }}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-400">
                  <TrendingUp className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Appraisals</p>
                  <p className="text-xs text-muted-foreground">View performance reviews and cycles</p>
                </div>
                <Button asChild variant="outline" size="sm" className="shrink-0 gap-1 text-xs">
                  <Link to="/appraisals">
                    Open <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </Button>
              </div>
            </SectionCard>
          )}

        </div>
      </div>
    </div>
  );
}
