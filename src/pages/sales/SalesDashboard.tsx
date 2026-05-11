import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { getSalesDashboardSummary } from '@/services/salesOrderService';
import { getVehicleKpiSummary } from '@/services/vehicleService';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, DollarSign, TrendingUp, Loader2 } from 'lucide-react';
import { resolveBranchCode } from '@/services/branchService';

export default function SalesDashboard() {
  const companyId = useCompanyId();
  const { user } = useAuth();
  const branchId = user?.access_scope === 'branch' ? (user.branch_id ?? null) : null;

  // Resolve branch code from branchId (null for all-branch users)
  const { data: branchCode } = useQuery({
    queryKey: ['branch-code', branchId],
    queryFn: () => (branchId ? resolveBranchCode(branchId) : Promise.resolve(null)),
    staleTime: 300_000,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['sales-dashboard-summary', companyId, branchCode ?? null],
    queryFn: async () => {
      const res = await getSalesDashboardSummary(companyId, branchCode ?? null);
      if (res.error) throw res.error;
      return res.data;
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const { data: kpiSummary, isLoading: kpiLoading } = useQuery({
    queryKey: ['sales-dashboard-vehicle-kpi'],
    queryFn: async () => {
      const res = await getVehicleKpiSummary();
      if (res.error) throw res.error;
      return res.data;
    },
    staleTime: 60_000,
  });

  if (summaryLoading || kpiLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  const mtdOrderCount    = summary?.mtd.orderCount     ?? 0;
  const mtdRevenue       = summary?.mtd.totalValue      ?? 0;
  const outstandingAr    = summary?.outstandingAr       ?? 0;
  const vehiclesLinked   = summary?.vehiclesLinked      ?? 0;
  const branchBreakdown  = summary?.branchBreakdown     ?? [];
  const monthlyTrend     = summary?.monthlyTrend        ?? [];
  const vehicleCount     = kpiSummary?.total            ?? 0;

  const totalOrders = branchBreakdown.reduce((s, b) => s + b.orderCount, 0);
  const maxTrend    = Math.max(...monthlyTrend.map(t => t.orderCount), 1);

  // Build display labels for monthly trend months (ensure 6-month window even if some months have no orders)
  const now = new Date();
  const months: { label: string; key: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      key: d.toISOString().split('T')[0].substring(0, 7),
    });
  }
  const trend = months.map(m => {
    const found = monthlyTrend.find(t => t.monthKey === m.key);
    return { label: m.label, count: found?.orderCount ?? 0 };
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Sales Overview"
        description="Month-to-date sales performance, branch activity, and sales-to-vehicle linkage at a glance."
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Sales', path: '/sales' }, { label: 'Overview' }]}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'MTD Orders',  value: mtdOrderCount,                             icon: ShoppingCart, color: 'text-blue-500' },
          { label: 'MTD Revenue', value: `RM ${(mtdRevenue / 1000).toFixed(0)}k`,   icon: DollarSign,   color: 'text-emerald-500' },
          { label: 'Outstanding', value: `RM ${(outstandingAr / 1000).toFixed(0)}k`, icon: TrendingUp,  color: 'text-orange-500' },
        ].map(k => (
          <div key={k.label} className="glass-panel p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-secondary ${k.color}`}><k.icon className="h-4 w-4" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Monthly Trend */}
        <div className="glass-panel p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3">Monthly Orders — Last 6 Months</p>
          <div className="flex items-end gap-2 h-28">
            {trend.map(t => (
              <div key={t.label} className="flex flex-col items-center flex-1 gap-1">
                <span className="text-[10px] text-muted-foreground">{t.count}</span>
                <div
                  className="w-full rounded-sm bg-primary/70 transition-all"
                  style={{ height: `${Math.max((t.count / maxTrend) * 80, t.count > 0 ? 6 : 0)}px` }}
                />
                <span className="text-[9px] text-muted-foreground">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Branch Leaderboard */}
        <div className="glass-panel p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3">Orders by Branch (All Time)</p>
          <div className="space-y-2">
            {branchBreakdown.slice(0, 8).map(b => {
              const pct = totalOrders > 0 ? ((b.orderCount / totalOrders) * 100).toFixed(0) : '0';
              return (
                <div key={b.branchCode} className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{b.branchCode}</span>
                    <span className="text-muted-foreground">{b.orderCount} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {branchBreakdown.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No data yet</p>}
          </div>
        </div>
      </div>

      {/* Cross-module stats */}
      <div className="glass-panel p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Auto Aging Integration</p>
        <p className="text-sm">Orders linked to BG entries: <span className="font-bold text-primary">{vehiclesLinked}</span> of <span className="font-bold">{totalOrders}</span> orders</p>
        <p className="text-xs text-muted-foreground mt-1">Total vehicles in Auto Aging: {vehicleCount.toLocaleString()}</p>
      </div>
    </div>
  );
}

