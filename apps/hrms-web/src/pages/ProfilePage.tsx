import { Briefcase, Building2, Calendar, Clock, LogOut, Mail, Phone, Shield, Sparkles, User, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { useLeaveData } from '@/hooks/useLeaveData';

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

interface InfoRowProps {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}

function InfoRow({ icon: Icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value ?? '—'}</p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  description?: string;
  icon: React.ElementType;
  tone?: 'default' | 'good' | 'warning';
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

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const leaveData = useLeaveData();

  const hrmsRoleLabels = hrmsAccess.roleNames;
  const initials = getInitials(user?.name);
  const pendingLeaveCount = leaveData.myActivePending?.length ?? 0;
  const upcomingLeaveCount = leaveData.myUpcoming?.length ?? 0;
  const leaveBalanceCount = leaveData.leaveBalances.length;

  return (
    <div className="w-full space-y-6 animate-fade-in">

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-background bg-primary text-xl font-bold text-primary-foreground shadow-md">
              {initials}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{user?.name ?? 'HRMS User'}</h1>
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Personal workspace
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {hrmsAccess.primaryRoleLabel ?? user?.role?.replace(/_/g, ' ')}
              </p>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Review your identity, leave status, and HRMS access from a single profile center without leaving the workspace.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => void logout()}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Access level"
            value={hrmsAccess.roleNames.length}
            description="Assigned HRMS roles"
            icon={Shield}
            tone="default"
          />
          <StatCard
            label="Leave status"
            value={pendingLeaveCount + upcomingLeaveCount}
            description="Pending + upcoming requests"
            icon={Calendar}
            tone={pendingLeaveCount > 0 ? 'warning' : 'good'}
          />
          <StatCard
            label="Leave balances"
            value={leaveBalanceCount}
            description="Tracked leave types"
            icon={Users}
            tone="default"
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">

        {/* Contact & Identity */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="shadow-sm">
            <CardHeader className="px-5 pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5">
              <InfoRow icon={Mail} label="Email" value={user?.email} />
              <InfoRow icon={Phone} label="Contact" value={(user as { contactNo?: string }).contactNo} />
              <InfoRow icon={User} label="IC Number" value={(user as { icNo?: string }).icNo} />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="px-5 pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Employment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5">
              <InfoRow icon={Briefcase} label="Job Title" value={(user as { jobTitleName?: string }).jobTitleName} />
              <InfoRow icon={Building2} label="Department" value={(user as { departmentName?: string }).departmentName} />
            </CardContent>
          </Card>
        </div>

        {/* Access & Leave summary */}
        <div className="space-y-5">
          <Card className="shadow-sm">
            <CardHeader className="px-5 pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Access & Roles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <Section title="Application Role">
                <Badge variant="outline" className="capitalize">
                  {user?.role?.replace(/_/g, ' ') ?? '—'}
                </Badge>
              </Section>
              <Separator />
              <Section title="HRMS Roles">
                {hrmsRoleLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {hrmsRoleLabels.map((label) => (
                      <Badge key={label} className="bg-primary/10 text-primary border-primary/20 text-xs">
                        <Shield className="mr-1 h-2.5 w-2.5" />
                        {label}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No HRMS roles assigned</p>
                )}
              </Section>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="px-5 pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">HRMS Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5">
              <InfoRow icon={Calendar} label="Pending leave" value={`${pendingLeaveCount} request${pendingLeaveCount === 1 ? '' : 's'}`} />
              <InfoRow icon={Clock} label="Upcoming leave" value={`${upcomingLeaveCount} request${upcomingLeaveCount === 1 ? '' : 's'}`} />
              <InfoRow icon={Briefcase} label="Leave balances" value={`${leaveBalanceCount} balance${leaveBalanceCount === 1 ? '' : 's'}`} />
            </CardContent>
          </Card>

          {/* Leave balances summary */}
          {leaveData.leaveBalances.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="px-5 pb-2 pt-4">
                <CardTitle className="text-sm font-semibold">Leave Balances</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 px-5 pb-5">
                {leaveData.leaveBalances.slice(0, 4).map((balance) => {
                  const typeName = leaveData.leaveTypes.find((t) => t.id === balance.leaveTypeId)?.name ?? 'Leave';
                  const pct = balance.entitledDays > 0
                    ? Math.round((balance.remainingDays / balance.entitledDays) * 100)
                    : 0;
                  return (
                    <div key={balance.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">{typeName}</span>
                        <span className="tabular-nums text-muted-foreground">{balance.remainingDays}/{balance.entitledDays}d</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${balance.remainingDays <= 0 ? 'bg-red-500' : balance.remainingDays <= 3 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}