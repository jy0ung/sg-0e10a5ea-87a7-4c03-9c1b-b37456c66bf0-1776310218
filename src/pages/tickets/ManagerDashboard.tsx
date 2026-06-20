import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Clock3,
  Inbox,
  RotateCcw,
  RefreshCcw,
  Star,
  UserCheck,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { STALE } from '@/lib/queryClient';
import { PageHeader } from '@/components/shared/PageHeader';
import { MetricCard } from '@/components/shared/MetricCard';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/tickets/RequestBadge';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { openTicketWorkspace } from '@/lib/ticketWorkspaceNavigation';
import type { DashboardPeriod } from '@/lib/dashboardFilters';
import { DASHBOARD_PERIOD_OPTIONS, getDashboardPeriodRange, loadDashboardFilterState, saveDashboardFilterState } from '@/lib/dashboardFilters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getRequestManagementDashboard } from '@/services/requestManagementService';

function formatDuration(ms: number | null) {
  if (ms === null) return 'No data';
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 24) return `${Math.max(1, hours)}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function BarRow({ label, value, max, tone = 'bg-primary' }: { label: string; value: number; max: number; tone?: string }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate text-foreground">{label}</span>
        <span className="font-medium tabular-nums text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function ManagerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { categories } = useRequestCategories(user?.company_id, true);

  const [period, setPeriod] = useState<DashboardPeriod>(() => loadDashboardFilterState('manager-dashboard').period);
  const dateRange = useMemo(() => getDashboardPeriodRange(period), [period]);

  const handlePeriodChange = (newPeriod: DashboardPeriod) => {
    setPeriod(newPeriod);
    const current = loadDashboardFilterState('manager-dashboard');
    saveDashboardFilterState('manager-dashboard', { ...current, period: newPeriod });
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['request-manager-dashboard', user?.company_id, user?.id, period, dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    queryFn: async () => {
      const result = await getRequestManagementDashboard(user!.company_id, user!.id, dateRange.from, dateRange.to);
      if (result.error) throw result.error;
      return result.data!;
    },
    enabled: !!user?.company_id && !!user?.id,
    staleTime: STALE.transactional,
    refetchInterval: 60_000,
  });

  const maxCategory = useMemo(
    () => Math.max(...(data?.request_volume_by_category.map((item) => item.count) ?? [0])),
    [data?.request_volume_by_category],
  );
  const maxOwnerLoad = useMemo(
    () => Math.max(...(data?.workload_by_owner.map((item) => item.pending) ?? [0])),
    [data?.workload_by_owner],
  );

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader
        title="Manager Dashboard"
        description="Live operating view for ownership, SLA exposure, workload, and closure quality."
        breadcrumbs={[{ label: 'Internal Requests', path: '/portal' }, { label: 'Manager Dashboard' }]}
      />

      <div className="flex items-center gap-3">
        <Select value={period} onValueChange={(value) => handlePeriodChange(value as DashboardPeriod)}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DASHBOARD_PERIOD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        {isFetching && (
          <span className="text-xs text-muted-foreground opacity-70">Updating…</span>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={4} />
      ) : error || !data ? (
        <HrmsEmptyState icon={AlertTriangle} title="Unable to load dashboard" description={(error as Error)?.message ?? 'Dashboard data is unavailable.'} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Pending" value={data.total_pending} icon={Inbox} tone="slate" onClick={() => navigate("/portal/queue?status=pending")} />
            <MetricCard label="Unassigned" value={data.unassigned} icon={Inbox} tone={data.unassigned > 0 ? 'amber' : 'slate'} onClick={() => navigate("/portal/queue?status=unassigned")} />
            <MetricCard label="In Progress" value={data.in_progress} icon={UserCheck} tone="blue" onClick={() => navigate("/portal/queue?status=in_progress")} />
            <MetricCard label="Pending Requester" value={data.pending_requester} icon={Clock3} tone={data.pending_requester > 0 ? 'amber' : 'slate'} />
            <MetricCard label="Pending Owner Review" value={data.pending_owner_review} icon={Clock3} tone="violet" />
            <MetricCard label="SLA breached" value={data.sla_breached} icon={AlertTriangle} tone={data.sla_breached > 0 ? 'red' : 'slate'} onClick={() => navigate("/portal/queue?status=sla_breached")} />
            <MetricCard label="At Risk" value={data.at_risk} icon={AlertTriangle} tone={data.at_risk > 0 ? 'amber' : 'slate'} />
            <MetricCard label="Completed" value={data.completed} icon={Archive} tone="emerald" />
            <MetricCard label="Reopened" value={data.reopened} icon={RotateCcw} tone={data.reopened > 0 ? 'amber' : 'slate'} />
            <MetricCard label="Satisfaction" value={data.requester_satisfaction_score ? data.requester_satisfaction_score.toFixed(1) : 'No data'} icon={Star} tone="emerald" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/30">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock3 className="h-4 w-4" />
                  Oldest pending requests
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.oldest_pending.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">No pending requests.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {data.oldest_pending.map((ticket) => (
                      <button
                        key={ticket.id}
                        type="button"
                        className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40 md:grid-cols-[minmax(0,1fr)_160px_140px] md:items-center"
                        onClick={() => openTicketWorkspace(navigate, ticket.id, {
                          source: 'dashboard',
                          path: '/portal/dashboard',
                          scrollTop: window.scrollY,
                        })}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{ticket.subject}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {getRequestCategoryLabel(ticket.category, categories)} · {ticket.assigned_to_name ?? ticket.responsible_queue}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <RequestStatusBadge status={ticket.status} />
                          <RequestPriorityBadge priority={ticket.priority} />
                        </div>
                        <div className="text-xs text-muted-foreground md:text-right">
                          {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4">
              <Card>
                <CardHeader className="border-b bg-muted/30">
                  <CardTitle className="text-base">Cycle time</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Average response</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">{formatDuration(data.average_response_ms)}</p>
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Average resolution</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">{formatDuration(data.average_resolution_ms)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b bg-muted/30">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-4 w-4" />
                    Request volume by category
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                  {data.request_volume_by_category.slice(0, 8).map((item) => (
                    <BarRow key={item.category} label={getRequestCategoryLabel(item.category, categories)} value={item.count} max={maxCategory} tone="bg-cyan-600" />
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="border-b bg-muted/30">
                <CardTitle className="text-base">Workload by owner</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {data.workload_by_owner.slice(0, 10).map((item) => (
                  <div key={item.owner_id ?? 'unassigned'} className="space-y-1.5">
                    <BarRow label={item.owner_name} value={item.pending} max={maxOwnerLoad} tone={item.breached > 0 ? 'bg-red-600' : item.at_risk > 0 ? 'bg-amber-500' : 'bg-blue-600'} />
                    <p className="text-xs text-muted-foreground">{item.breached} breached · {item.at_risk} at risk</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b bg-muted/30">
                <CardTitle className="text-base">SLA performance by owner</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {data.sla_performance_by_owner.slice(0, 10).map((item) => (
                  <div key={item.owner_id ?? 'unassigned'} className="rounded-md border px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-foreground">{item.owner_name}</p>
                      <p className="text-xs text-muted-foreground">{item.total} requests</p>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Met {item.met}</span>
                      <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">Risk {item.at_risk}</span>
                      <span className="rounded bg-red-50 px-2 py-1 text-red-700">Breached {item.breached}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
