import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Activity, Database, Users, Car, FileText, RefreshCw,
  CheckCircle, XCircle, Clock, Ticket,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { fetchHealthMetrics } from '@/services/systemHealthService';

function MetricCard({
  icon, title, value, status, subtitle,
}: {
  icon: React.ReactNode; title: string; value: string | number; status?: 'ok' | 'warn' | 'error'; subtitle?: string;
}) {
  const borderClass = status === 'error' ? 'border-destructive' : status === 'warn' ? 'border-warning' : '';
  return (
    <Card className={borderClass}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-3">
          <div className="text-muted-foreground">{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-lg font-semibold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SystemHealth() {
  const { hasRole, user } = useAuth();
  const { data: metrics, isLoading, refetch } = useQuery({
    queryKey: ['system-health', user?.company_id],
    queryFn: () => fetchHealthMetrics(user!.company_id!),
    enabled: !!user?.company_id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!hasRole(['super_admin', 'company_admin', 'director'])) return <UnauthorizedAccess />;

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="System Health"
        description="Monitor system status, data metrics, and sync health"
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin', path: '/admin/settings' }, { label: 'System Health' }]}
      />

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              icon={<Database className="h-5 w-5" />}
              title="Database"
              value={metrics.dbConnected ? 'Connected' : 'Disconnected'}
              status={metrics.dbConnected ? 'ok' : 'error'}
            />
            <MetricCard
              icon={<Users className="h-5 w-5" />}
              title="Users"
              value={metrics.userCount.toLocaleString()}
            />
            <MetricCard
              icon={<FileText className="h-5 w-5" />}
              title="Active Deals"
              value={metrics.dealCount.toLocaleString()}
            />
            <MetricCard
              icon={<Car className="h-5 w-5" />}
              title="Vehicles"
              value={metrics.vehicleCount.toLocaleString()}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              icon={<Ticket className="h-5 w-5" />}
              title="IR Tickets"
              value={metrics.ticketCount.toLocaleString()}
            />
            <MetricCard
              icon={<Activity className="h-5 w-5" />}
              title="Audit Events (24h)"
              value={metrics.recentAuditEvents.toLocaleString()}
              status={metrics.recentAuditEvents > 500 ? 'warn' : 'ok'}
              subtitle={metrics.recentAuditEvents > 500 ? 'High activity' : undefined}
            />
            <MetricCard
              icon={<Clock className="h-5 w-5" />}
              title="Last DMS Sync"
              value={metrics.lastDmsSync ? new Date(metrics.lastDmsSync).toLocaleDateString() : 'Never'}
              status={!metrics.lastDmsSync ? 'warn' : metrics.lastDmsStatus === 'success' ? 'ok' : 'warn'}
              subtitle={metrics.lastDmsSync ? new Date(metrics.lastDmsSync).toLocaleTimeString() : undefined}
            />
            <MetricCard
              icon={metrics.dbConnected ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              title="Overall Status"
              value={metrics.dbConnected ? 'Healthy' : 'Degraded'}
              status={metrics.dbConnected ? 'ok' : 'error'}
            />
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
