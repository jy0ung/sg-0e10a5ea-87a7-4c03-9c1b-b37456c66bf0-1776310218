import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useSales } from '@/contexts/SalesContext';
import { useData } from '@/contexts/DataContext';
import { ShoppingCart, DollarSign, TrendingUp, CheckCircle, Loader2 } from 'lucide-react';

export default function SalesDashboard() {
  const { salesOrders, invoices, loading: salesLoading } = useSales();
  const { vehicles, loading: dataLoading } = useData();

  if (salesLoading || dataLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const mtdOrders = salesOrders.filter(o => o.bookingDate >= startOfMonth);
  const mtdRevenue = mtdOrders.reduce((s, o) => s + (o.totalPrice ?? 0), 0);
  const mtdDelivered = mtdOrders.filter(o => o.status === 'delivered').length;
  const totalOutstanding = invoices.filter(i => i.paymentStatus !== 'paid' && i.paymentStatus !== 'cancelled').reduce((s, i) => s + (i.totalAmount - (i.paidAmount ?? 0)), 0);

  const vehiclesLinked = salesOrders.filter(o => o.vehicleId).length;

  // Branch breakdown
  const branchMap = new Map<string, number>();
  for (const o of salesOrders) {
    branchMap.set(o.branchCode, (branchMap.get(o.branchCode) ?? 0) + 1);
  }
  const branchRows = [...branchMap.entries()].sort((a, b) => b[1] - a[1]);

  // Monthly trend (last 6 months)
  const months: { label: string; key: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleString('default', { month: 'short', year: '2-digit' }), key: d.toISOString().split('T')[0].substring(0, 7) });
  }
  const trend = months.map(m => ({
    label: m.label,
    count: salesOrders.filter(o => o.bookingDate.startsWith(m.key)).length,
  }));
  const maxTrend = Math.max(...trend.map(t => t.count), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Sales Overview"
        description="Month-to-date sales performance, branch activity, and sales-to-vehicle linkage at a glance."
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Sales' }, { label: 'Overview' }]}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'MTD Orders', value: mtdOrders.length, icon: ShoppingCart, color: 'text-blue-500' },
          { label: 'MTD Revenue', value: `RM ${(mtdRevenue / 1000).toFixed(0)}k`, icon: DollarSign, color: 'text-emerald-500' },
          { label: 'Delivered MTD', value: mtdDelivered, icon: CheckCircle, color: 'text-purple-500' },
          { label: 'Outstanding', value: `RM ${(totalOutstanding / 1000).toFixed(0)}k`, icon: TrendingUp, color: 'text-orange-500' },
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
            {branchRows.slice(0, 8).map(([branch, count]) => {
              const pct = ((count / salesOrders.length) * 100).toFixed(0);
              return (
                <div key={branch} className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{branch}</span>
                    <span className="text-muted-foreground">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {branchRows.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No data yet</p>}
          </div>
        </div>
      </div>

      {/* Cross-module stats */}
      <div className="glass-panel p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Auto Aging Integration</p>
        <p className="text-sm">Orders linked to BG entries: <span className="font-bold text-primary">{vehiclesLinked}</span> of <span className="font-bold">{salesOrders.length}</span> orders</p>
        <p className="text-xs text-muted-foreground mt-1">Total vehicles in Auto Aging: {vehicles.length}</p>
      </div>
    </div>
  );
}
