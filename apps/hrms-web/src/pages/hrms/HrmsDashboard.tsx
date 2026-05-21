import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
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
  Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { useLeaveData } from '@/hooks/useLeaveData';
import { useApprovalInboxItems } from '@/hooks/useApprovalInboxItems';
import { listAnnouncements, listAttendanceRecords } from '@/services/hrmsService';
import { cn } from '@/lib/utils';
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

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  trend?: 'up' | 'down' | 'neutral';
  href?: string;
  loading?: boolean;
}

function MetricCard({ label, value, sub, icon: Icon, iconColor, href, loading }: MetricCardProps) {
  const inner = (
    <Card className={cn(
      'relative overflow-hidden shadow-sm transition-all',
      href && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5',
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="mt-1 h-8 w-16" />
            ) : (
              <p className="mt-1 text-2xl font-bold leading-none tabular-nums text-foreground">{value}</p>
            )}
            {sub && !loading && (
              <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
            )}
          </div>
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) return <Link to={href}>{inner}</Link>;
  return inner;
}

interface SectionHeaderProps {
  title: string;
  action?: { label: string; href: string };
}

function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {action && (
        <Link
          to={action.href}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {action.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

interface QuickActionCardProps {
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  href: string;
}

function QuickActionCard({ label, description, icon: Icon, iconColor, href }: QuickActionCardProps) {
  return (
    <Link to={href}>
      <Card className="cursor-pointer shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
        <CardContent className="flex items-center gap-3 p-4">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', iconColor)}>
            <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-foreground">{label}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/50" />
        </CardContent>
      </Card>
    </Link>
  );
}

interface LeaveRequestRowProps {
  request: LeaveRequest;
  leaveTypeName: string;
}

function LeaveRequestRow({ request, leaveTypeName }: LeaveRequestRowProps) {
  const statusStyles: Record<string, string> = {
    pending:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    approved:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    rejected:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    cancelled: 'bg-secondary text-secondary-foreground',
  };

  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Calendar className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{leaveTypeName}</p>
          <p className="text-xs text-muted-foreground">{fmtLeaveRange(request.startDate, request.endDate)}</p>
        </div>
      </div>
      <Badge className={cn('shrink-0 text-xs capitalize', statusStyles[request.status] ?? 'bg-secondary text-secondary-foreground')}>
        {request.status === 'pending' ? 'Pending' : request.status}
      </Badge>
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

  const priorityBadge: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700 border-red-200',
    high:   'bg-orange-100 text-orange-700 border-orange-200',
    normal: 'bg-blue-50 text-blue-600 border-blue-100',
    low:    'bg-gray-100 text-gray-500 border-gray-200',
  };

  return (
    <div className="w-full space-y-6">

      {/* ── Welcome Header ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/8 via-background to-background px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <span className="text-base font-bold">{getInitials(user?.name)}</span>
            </div>
            <div>
              <p className="text-lg font-semibold leading-tight text-foreground">
                {getGreeting()}, {firstName}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {format(new Date(), 'EEEE, d MMMM yyyy')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hrmsAccess.primaryRoleLabel && (
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-xs px-2.5 py-1">
                {hrmsAccess.primaryRoleLabel}
              </Badge>
            )}
            {hrmsAccess.canApproveRequests && approvalItems.length > 0 && (
              <Link to="/approvals">
                <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-600 text-xs px-2.5 py-1 shadow-sm">
                  <Inbox className="h-3 w-3" />
                  {approvalItems.length} pending
                </Badge>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Metric Strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <MetricCard
          label="Leave Available"
          value={primaryBalance != null ? `${primaryBalance.remainingDays}d` : '—'}
          sub={primaryBalance != null ? 'days remaining' : 'No balance data'}
          icon={Calendar}
          iconColor="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
          href="/leave"
          loading={leaveData.isLoading}
        />
        <MetricCard
          label="My Pending"
          value={leaveData.myActivePending.length}
          sub={leaveData.myActivePending.length === 1 ? 'leave request' : 'leave requests'}
          icon={Clock}
          iconColor={leaveData.myActivePending.length > 0
            ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
            : 'bg-muted text-muted-foreground'}
          href="/leave"
          loading={leaveData.isLoading}
        />
        <MetricCard
          label="Attendance Today"
          value={<span className={attendanceColor}>{attendanceLabel}</span>}
          sub={todayAttendance?.clockIn ? `In: ${todayAttendance.clockIn}` : undefined}
          icon={CheckCircle2}
          iconColor="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <MetricCard
          label="Upcoming Leave"
          value={leaveData.myUpcoming.length > 0 ? fmtLeaveRange(leaveData.myUpcoming[0].startDate, leaveData.myUpcoming[0].endDate) : '—'}
          sub={leaveData.myUpcoming.length > 0 ? leaveTypeMap.get(leaveData.myUpcoming[0].leaveTypeId) : 'None scheduled'}
          icon={CalendarCheck}
          iconColor="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
          href="/leave"
          loading={leaveData.isLoading}
        />
        {isManager && (
          <MetricCard
            label="Needs My Action"
            value={approvalItems.length}
            sub={approvalItems.length === 1 ? 'approval pending' : 'approvals pending'}
            icon={Inbox}
            iconColor={approvalItems.length > 0
              ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
              : 'bg-muted text-muted-foreground'}
            href="/approvals"
          />
        )}
      </div>

      {/* ── Main content grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

        {/* ── Left / Main column (2/3) ─────────────────────────────────────── */}
        <div className="space-y-6 xl:col-span-2">

          {/* Approval Queue — managers only */}
          {isManager && approvalItems.length > 0 && (
            <div className="space-y-3">
              <SectionHeader title="Action Required" action={{ label: 'View all', href: '/approvals' }} />
              <Card className="shadow-sm border-amber-200/60 dark:border-amber-800/30">
                <CardContent className="divide-y p-0">
                  {approvalItems.slice(0, 4).map((item) => (
                    <Link key={item.entityId} to="/approvals" className="block transition-colors hover:bg-muted/50">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                          <Inbox className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                        </div>
                        <Badge className="shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs border-amber-200">
                          Review
                        </Badge>
                      </div>
                    </Link>
                  ))}
                  {approvalItems.length > 4 && (
                    <div className="px-4 py-2.5 text-center">
                      <Link to="/approvals" className="text-xs font-medium text-primary hover:underline">
                        +{approvalItems.length - 4} more pending
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* My Leave Requests */}
          <div className="space-y-3">
            <SectionHeader
              title={activeAndUpcomingRequests.length > 0 ? 'My Active Leave' : 'My Recent Leave'}
              action={{ label: 'View all', href: '/leave' }}
            />
            <Card className="shadow-sm">
              <CardContent className="p-0">
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
                    <Calendar className="h-8 w-8 opacity-25" />
                    <p className="text-sm">No active or upcoming leave</p>
                    <Link to="/leave">
                      <Button variant="outline" size="sm" className="mt-1 gap-1.5">
                        Apply for Leave
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Announcements */}
          <div className="space-y-3">
            <SectionHeader title="Recent Announcements" action={{ label: 'View all', href: '/announcements' }} />
            {announcementsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Card key={i} className="shadow-sm">
                    <CardContent className="p-4">
                      <Skeleton className="h-4 w-48 mb-2" />
                      <Skeleton className="h-3 w-full mb-1" />
                      <Skeleton className="h-3 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : sortedAnnouncements.length > 0 ? (
              <div className="space-y-3">
                {sortedAnnouncements.map((ann) => (
                  <Link key={ann.id} to="/announcements">
                    <Card className={cn(
                      'shadow-sm cursor-pointer transition-all hover:shadow-md',
                      ann.pinned && 'border-primary/40',
                    )}>
                      <CardContent className="p-4">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Megaphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <p className="truncate text-sm font-semibold text-foreground">{ann.title}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] capitalize px-1.5 py-0.5',
                                priorityBadge[ann.priority] ?? '',
                              )}
                            >
                              {ann.priority}
                            </Badge>
                          </div>
                        </div>
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{ann.body}</p>
                        <p className="mt-2 text-[10px] text-muted-foreground/60">
                          {ann.authorName ?? 'HR'} · {timeAgo(ann.createdAt)}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="shadow-sm">
                <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                  <Megaphone className="h-8 w-8 opacity-25" />
                  <p className="text-sm">No announcements yet</p>
                </CardContent>
              </Card>
            )}
          </div>

        </div>

        {/* ── Right Sidebar (1/3) ──────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Leave Balances */}
          <div className="space-y-3">
            <SectionHeader title="Leave Balances" action={{ label: 'Manage', href: '/leave' }} />
            <Card className="shadow-sm">
              <CardContent className="p-4">
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
                  <div className="flex flex-col items-center gap-1 py-6 text-muted-foreground">
                    <AlertCircle className="h-6 w-6 opacity-30" />
                    <p className="text-sm">Balances not initialised</p>
                    <p className="text-xs text-center">Contact HR to set up your leave balances.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="space-y-3">
            <SectionHeader title="Quick Actions" />
            <div className="space-y-2">
              <QuickActionCard
                label="Apply for Leave"
                description="Submit a new leave request"
                icon={Calendar}
                iconColor="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                href="/leave"
              />
              {hrmsAccess.canApproveRequests && (
                <QuickActionCard
                  label="Approval Inbox"
                  description={approvalItems.length > 0 ? `${approvalItems.length} items need your review` : 'Review pending items'}
                  icon={Inbox}
                  iconColor="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                  href="/approvals"
                />
              )}
              {hrmsAccess.canAccessAppraisals && (
                <QuickActionCard
                  label="My Appraisals"
                  description="View performance reviews"
                  icon={Star}
                  iconColor="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
                  href="/appraisals"
                />
              )}
              {hrmsAccess.canAccessEmployees && (
                <QuickActionCard
                  label="Employee Directory"
                  description="Browse workforce records"
                  icon={Users}
                  iconColor="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  href="/employees"
                />
              )}
              {isHrAdmin && (
                <QuickActionCard
                  label="HRMS Settings"
                  description="Manage roles, flows, and config"
                  icon={Zap}
                  iconColor="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
                  href="/settings"
                />
              )}
            </div>
          </div>

          {/* Workforce context — managers/HR */}
          {isManager && (
            <div className="space-y-3">
              <SectionHeader title="Team at a Glance" action={{ label: 'Leave Calendar', href: '/leave/calendar' }} />
              <Card className="shadow-sm">
                <CardContent className="p-4">
                  {leaveData.isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Team on leave today</span>
                        </div>
                        <span className="font-bold tabular-nums text-foreground">{leaveData.teamOnLeaveToday.length}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Pending approvals</span>
                        </div>
                        <span className={cn('font-bold tabular-nums', approvalItems.length > 0 ? 'text-amber-600' : 'text-foreground')}>
                          {approvalItems.length}
                        </span>
                      </div>
                      {leaveData.teamOnLeaveToday.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Away Today</p>
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
                </CardContent>
              </Card>
            </div>
          )}

          {/* Performance / Appraisals teaser */}
          {hrmsAccess.canAccessAppraisals && (
            <div className="space-y-3">
              <SectionHeader title="Performance" action={{ label: 'View', href: '/appraisals' }} />
              <Card className="shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Appraisals</p>
                    <p className="text-xs text-muted-foreground">View performance reviews and cycles</p>
                  </div>
                  <Link to="/appraisals">
                    <Button variant="outline" size="sm" className="shrink-0 gap-1 text-xs">
                      Open <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
