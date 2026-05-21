import { Briefcase, Building2, LogOut, Mail, Phone, Shield, User } from 'lucide-react';
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

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const leaveData = useLeaveData();

  const hrmsRoleLabels = hrmsAccess.roleNames;
  const initials = getInitials(user?.name);

  return (
    <div className="w-full space-y-6 animate-fade-in">

      {/* Hero card */}
      <Card className="overflow-hidden shadow-sm">
        <div className="h-16 bg-gradient-to-r from-primary/20 via-primary/10 to-background" />
        <CardContent className="relative px-6 pb-6">
          <div className="-mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-background bg-primary text-xl font-bold text-primary-foreground shadow-md">
                {initials}
              </div>
              <div className="pb-1">
                <h1 className="text-xl font-bold leading-tight text-foreground">{user?.name ?? 'HRMS User'}</h1>
                <p className="text-sm text-muted-foreground">
                  {hrmsAccess.primaryRoleLabel ?? user?.role?.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => void logout()}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>

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