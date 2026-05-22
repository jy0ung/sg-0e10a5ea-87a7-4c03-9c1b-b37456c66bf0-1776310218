import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Award,
  Briefcase,
  Building2,
  Calendar,
  Clock,
  CreditCard,
  Flame,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { useAuth } from '@/contexts/AuthContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import {
  listEmployeeDirectory,
  listLeaveRequests,
  listAttendanceRecords,
  listLeaveTypes,
} from '@/services/hrmsService';
import type { Employee } from '@/types';
import { cn } from '@/lib/utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try { return format(new Date(iso), 'd MMM yyyy'); } catch { return iso; }
}

function daysAgo(iso?: string | null): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24)));
}

// ─── Detail Row ───────────────────────────────────────────────────────────────

interface DetailRowProps {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}

function DetailRow({ icon: Icon, label, value }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm font-medium text-foreground">{value ?? '—'}</div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  tone = 'info',
}: {
  label: string;
  value: React.ReactNode;
  description?: string;
  icon: React.ElementType;
  tone?: 'good' | 'warning' | 'info';
}) {
  const toneClass = tone === 'good'
    ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-blue-600 dark:text-blue-400';

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

// ─── Profile Header ───────────────────────────────────────────────────────────

function ProfileHeader({ employee, loading }: { employee?: Employee; loading: boolean }) {
  const statusColor: Record<string, string> = {
    active:     'bg-emerald-100 text-emerald-700 border-emerald-200',
    inactive:   'bg-gray-100 text-gray-500 border-gray-200',
    terminated: 'bg-red-100 text-red-700 border-red-200',
    on_leave:   'bg-blue-100 text-blue-700 border-blue-200',
  };

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        {loading ? (
          <Skeleton className="h-20 w-20 shrink-0 rounded-2xl" />
        ) : (
          <div className={cn(
            'flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-xl font-bold shadow-md ring-1 ring-border/40',
            'bg-primary text-primary-foreground',
          )}>
            {getInitials(employee?.name)}
          </div>
        )}
        <div className="flex-1 space-y-1.5">
          {loading ? (
            <>
              <Skeleton className="h-7 w-48" />
              <Skeleton className="mt-1 h-4 w-32" />
              <Skeleton className="mt-1 h-4 w-24" />
            </>
          ) : employee ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{employee.name}</h1>
                <Badge
                  variant="outline"
                  className={cn('text-xs capitalize', statusColor[employee.status] ?? 'bg-secondary text-secondary-foreground')}
                >
                  {employee.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {[employee.jobTitleName, employee.departmentName, employee.branchId].filter(Boolean).join(' · ')}
              </p>
              <p className="text-xs font-mono text-muted-foreground">
                {employee.staffCode ?? employee.id.slice(0, 8).toUpperCase()}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Employee not found</p>
          )}
        </div>
      </div>

    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ employee }: { employee: Employee }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <DetailRow icon={Mail} label="Email" value={employee.email} />
          <DetailRow icon={Phone} label="Phone" value={employee.contactNo} />
          <DetailRow icon={User} label="IC No." value={employee.icNo} />
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Organisation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <DetailRow icon={Building2} label="Department" value={employee.departmentName} />
          <DetailRow icon={Briefcase} label="Job Title" value={employee.jobTitleName} />
          <DetailRow icon={UserCheck} label="Manager" value={employee.managerName} />
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <DetailRow icon={User} label="Employee ID" value={<span className="font-mono text-xs">{employee.id}</span>} />
          <DetailRow icon={Users} label="Role" value={employee.role} />
          <DetailRow icon={Award} label="Staff Code" value={employee.staffCode ?? '—'} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Employment Tab ───────────────────────────────────────────────────────────

function EmploymentTab({ employee }: { employee: Employee }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">Employment Details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
        <DetailRow icon={Calendar} label="Join Date" value={fmtDate(employee.joinDate)} />
        <DetailRow icon={Calendar} label="Resign Date" value={employee.resignDate ? fmtDate(employee.resignDate) : 'Current'} />
        <DetailRow icon={MapPin} label="Branch" value={employee.branchId ?? '—'} />
        <DetailRow icon={Users} label="Role" value={employee.role} />
        <DetailRow icon={User} label="Staff Code" value={employee.staffCode} />
        <DetailRow icon={Flame} label="Profile Age" value={`${daysAgo(employee.joinDate) ?? 0} days since join`} />
      </CardContent>
    </Card>
  );
}

// ─── Leave Tab ────────────────────────────────────────────────────────────────

interface LeaveTabProps {
  employeeId: string;
  companyId: string;
}

function LeaveTab({ employeeId, companyId }: LeaveTabProps) {
  const { data: leaveData, isPending: loading } = useQuery({
    queryKey: ['employee-leave', companyId, employeeId],
    queryFn: async () => {
      const [reqRes, typeRes] = await Promise.all([
        listLeaveRequests(companyId, { employeeId }),
        listLeaveTypes(companyId),
      ]);
      return {
        requests: reqRes.data,
        leaveTypes: typeRes.data,
      };
    },
    enabled: !!companyId && !!employeeId,
  });

  const typeMap = useMemo(
    () => new Map((leaveData?.leaveTypes ?? []).map((t) => [t.id, t.name])),
    [leaveData?.leaveTypes],
  );

  const summary = useMemo(() => {
    const requests = leaveData?.requests ?? [];
    return {
      total: requests.length,
      pending: requests.filter((req) => req.status === 'pending').length,
      approved: requests.filter((req) => req.status === 'approved').length,
      lastRequestDaysAgo: daysAgo(requests[0]?.createdAt) ?? null,
    };
  }, [leaveData?.requests]);

  const statusStyles: Record<string, string> = {
    pending:   'bg-amber-100 text-amber-700',
    approved:  'bg-emerald-100 text-emerald-700',
    rejected:  'bg-red-100 text-red-700',
    cancelled: 'bg-secondary text-secondary-foreground',
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  if (!leaveData?.requests.length) {
    return (
      <HrmsEmptyState
        icon={Calendar}
        title="No leave records"
        description="This employee has no leave requests on file."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Leave requests" value={summary.total} description="All recorded requests" icon={Calendar} tone="info" />
        <StatCard label="Pending" value={summary.pending} description="Awaiting approval" icon={Clock} tone="warning" />
        <StatCard label="Approved" value={summary.approved} description="Confirmed leave" icon={ShieldCheck} tone="good" />
        <StatCard
          label="Latest request"
          value={summary.lastRequestDaysAgo == null ? '—' : `${summary.lastRequestDaysAgo}d`}
          description="Since newest submission"
          icon={Flame}
          tone="info"
        />
      </div>

      <Card className="shadow-sm">
        <CardContent className="divide-y p-0">
          {leaveData.requests.map((req) => (
            <div key={req.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Calendar className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {typeMap.get(req.leaveTypeId) ?? req.leaveTypeName ?? 'Leave'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {req.startDate === req.endDate ? fmtDate(req.startDate) : `${fmtDate(req.startDate)} – ${fmtDate(req.endDate)}`}
                    {' · '}{req.days} day{req.days !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <Badge className={cn('shrink-0 text-xs capitalize', statusStyles[req.status] ?? '')}>
                {req.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Attendance Tab ────────────────────────────────────────────────────────────

interface AttendanceTabProps {
  employeeId: string;
  companyId: string;
}

function AttendanceTab({ employeeId, companyId }: AttendanceTabProps) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFrom = thirtyDaysAgo.toISOString().slice(0, 10);
  const dateTo = new Date().toISOString().slice(0, 10);

  const { data: records = [], isPending: loading } = useQuery({
    queryKey: ['employee-attendance', companyId, employeeId, dateFrom, dateTo],
    queryFn: async () => {
      const res = await listAttendanceRecords(companyId, { employeeId, dateFrom, dateTo });
      return res.data;
    },
    enabled: !!companyId && !!employeeId,
  });

  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>;
  }

  if (!records.length) {
    return (
      <HrmsEmptyState
        icon={Clock}
        title="No attendance records"
        description="No records found for the last 30 days."
      />
    );
  }

  const workSummary = {
    total: records.length,
    clocked: records.filter((rec) => rec.clockIn || rec.clockOut).length,
    hours: records.reduce((sum, rec) => sum + (rec.hoursWorked ?? 0), 0),
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Records" value={workSummary.total} description="In the last 30 days" icon={Clock} tone="info" />
        <StatCard label="Clocked entries" value={workSummary.clocked} description="With attendance punches" icon={UserCheck} tone="good" />
        <StatCard label="Worked hours" value={workSummary.hours.toFixed(1)} description="Total reported hours" icon={Award} tone="warning" />
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-muted-foreground">Last 30 days</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {records.slice(0, 30).map((rec) => (
            <div key={rec.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{fmtDate(rec.date)}</p>
                  {(rec.clockIn || rec.clockOut) && (
                    <p className="text-xs text-muted-foreground">
                      {rec.clockIn && `In: ${rec.clockIn}`}{rec.clockIn && rec.clockOut ? ' · ' : ''}{rec.clockOut && `Out: ${rec.clockOut}`}
                      {rec.hoursWorked != null && ` · ${rec.hoursWorked}h`}
                    </p>
                  )}
                </div>
              </div>
              <StatusBadge status={rec.status} className="shrink-0 capitalize text-xs" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: employees = [], isPending: loadingEmployee } = useQuery({
    queryKey: ['employee-directory', user?.companyId],
    queryFn: async () => {
      const res = await listEmployeeDirectory(user!.companyId);
      return res.data;
    },
    enabled: !!user?.companyId,
    staleTime: 2 * 60 * 1000,
  });

  const employee: Employee | undefined = useMemo(
    () => employees.find((e) => e.id === id),
    [employees, id],
  );

  const canSeeFinancialTabs = hrmsAccess.canAccessPayroll;
  const canSeeTeamData = hrmsAccess.canAccessEmployees;
  const hasEmployee = !!employee;

  if (!loadingEmployee && !employee) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <HrmsEmptyState
          icon={User}
          title="Employee not found"
          description="This employee record does not exist or you do not have access."
          action={{ label: 'Back to Directory', onClick: () => navigate('/employees') }}
        />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => navigate('/employees')}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Employee Directory
            </button>
            <ProfileHeader employee={employee} loading={loadingEmployee} />
          </div>

          {!loadingEmployee && employee && (
            <div className="hidden flex-col items-end gap-2 lg:flex">
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <ShieldCheck className="mr-1 h-3 w-3" />
                Accessible HRMS profile
              </Badge>
              <p className="max-w-sm text-right text-xs text-muted-foreground">
                The profile page mirrors the enterprise shell and keeps leave, attendance, and organization context in one place.
              </p>
            </div>
          )}
        </div>

        {hasEmployee && !loadingEmployee && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Leave requests"
              value={employee ? 'See Leave tab' : '—'}
              description="Leave history is available below"
              icon={Calendar}
              tone="info"
            />
            <StatCard
              label="Attendance"
              value={employee ? '30 days' : '—'}
              description="Recent attendance records"
              icon={Clock}
              tone="good"
            />
            <StatCard
              label="Role"
              value={employee?.role ?? '—'}
              description="Current HRMS role context"
              icon={Users}
              tone="warning"
            />
            <StatCard
              label="Manager"
              value={employee?.managerName ?? '—'}
              description="Reporting line owner"
              icon={UserCheck}
              tone="info"
            />
          </div>
        )}
      </section>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start gap-1 overflow-x-auto border-b bg-transparent p-0 pb-0">
          {[
            { id: 'overview',    label: 'Overview',    icon: User,        always: true },
            { id: 'employment',  label: 'Employment',  icon: Briefcase,   always: canSeeTeamData },
            { id: 'leave',       label: 'Leave',       icon: Calendar,    always: canSeeTeamData },
            { id: 'attendance',  label: 'Attendance',  icon: Clock,       always: canSeeTeamData },
            { id: 'payroll',     label: 'Payroll',     icon: CreditCard,  always: canSeeFinancialTabs },
            { id: 'appraisals',  label: 'Appraisals',  icon: Star,        always: canSeeTeamData },
          ]
            .filter((t) => t.always)
            .map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
        </TabsList>

        <div className="mt-4">
          {loadingEmployee ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : employee ? (
            <>
              <TabsContent value="overview" className="mt-0">
                <OverviewTab employee={employee} />
              </TabsContent>
              <TabsContent value="employment" className="mt-0">
                <EmploymentTab employee={employee} />
              </TabsContent>
              <TabsContent value="leave" className="mt-0">
                <LeaveTab employeeId={employee.id} companyId={user!.companyId} />
              </TabsContent>
              <TabsContent value="attendance" className="mt-0">
                <AttendanceTab employeeId={employee.id} companyId={user!.companyId} />
              </TabsContent>
              <TabsContent value="payroll" className="mt-0">
                <HrmsEmptyState
                  icon={CreditCard}
                  title="Payroll details"
                  description="Individual payroll records will appear here once implemented."
                />
              </TabsContent>
              <TabsContent value="appraisals" className="mt-0">
                <HrmsEmptyState
                  icon={Star}
                  title="Appraisal history"
                  description="Performance review history for this employee will appear here."
                />
              </TabsContent>
            </>
          ) : null}
        </div>
      </Tabs>
    </div>
  );
}
