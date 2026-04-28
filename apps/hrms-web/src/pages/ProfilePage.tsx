import { LogOut, Mail, Shield, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';

export default function ProfilePage() {
  const { user, logout } = useAuth();

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Profile"
        description="Your HRMS account identity and access scope."
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Profile' }]}
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserRound className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>{user?.name ?? 'HRMS User'}</CardTitle>
              <CardDescription>{user?.employeeId ? `Employee ${user.employeeId}` : 'Employee profile pending link'}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Mail className="h-4 w-4" />
                Email
              </div>
              <p className="break-all text-sm text-foreground">{user?.email ?? '-'}</p>
            </div>
            <div className="rounded-md border border-border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Shield className="h-4 w-4" />
                Role
              </div>
              <p className="text-sm capitalize text-foreground">{user?.role?.replace(/_/g, ' ') ?? '-'}</p>
            </div>
          </div>

          <Button variant="outline" onClick={() => void logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}