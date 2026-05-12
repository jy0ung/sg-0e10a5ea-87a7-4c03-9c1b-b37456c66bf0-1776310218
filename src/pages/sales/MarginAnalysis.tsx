import React, { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { useSales } from '@/contexts/SalesContext';
import { fetchChassisCostMap } from '@/services/purchaseInvoiceService';
import { useQuery } from '@tanstack/react-query';
import { useCompanyId } from '@/hooks/useCompanyId';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

// Fallback estimated margin when no purchase invoice exists for a chassis.
const EST_MARGIN_PCT = 0.08;

interface ModelRow {
  model: string;
  units: number;
  realUnits: number;   // orders with actual cost data
  avgPrice: number;
  avgMargin: number;
  totalMargin: number;
}

const COLORS = ['#6366f1','#8b5cf6','#a78bfa','#c4b5fd','#e879f9','#f472b6','#fb7185','#fbbf24','#34d399','#22d3ee'];

function formatCurrency(value: number): string {
  return `RM ${value.toLocaleString()}`;
}

export default function MarginAnalysis() {
  const companyId = useCompanyId();
  const { salesOrders } = useSales();

  const [branchFilter, setBranchFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');

  // Fetch purchase invoice costs via React Query
  const { data: costMap = new Map<string, number>() } = useQuery({
    queryKey: ['margin-costs', companyId],
    queryFn: () => fetchChassisCostMap(companyId ?? ''),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  // Unique branches
  const branches = useMemo(() => {
    const set = new Set(salesOrders.map(o => o.branchCode).filter(Boolean));
    return Array.from(set).sort();
  }, [salesOrders]);

  // Unique months (YYYY-MM)
  const months = useMemo(() => {
    const set = new Set(salesOrders.map(o => o.bookingDate?.slice(0, 7)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [salesOrders]);

  // Filtered orders
  const filtered = useMemo(() => salesOrders.filter(o => {
    if (branchFilter !== 'all' && o.branchCode !== branchFilter) return false;
    if (periodFilter !== 'all' && o.bookingDate?.slice(0, 7) !== periodFilter) return false;
    return true;
  }), [salesOrders, branchFilter, periodFilter]);

  // Group by model — use actual cost when available, otherwise estimate
  const rows: ModelRow[] = useMemo(() => {
    const map = new Map<string, { units: number; realUnits: number; totalPrice: number; totalMargin: number }>();
    for (const o of filtered) {
      const price = o.totalPrice ?? o.bookingAmount ?? 0;
      const cost = o.chassisNo ? costMap.get(o.chassisNo) : undefined;
      const margin = cost !== undefined ? price - cost : price * EST_MARGIN_PCT;
      const isReal = cost !== undefined;
      const entry = map.get(o.model) ?? { units: 0, realUnits: 0, totalPrice: 0, totalMargin: 0 };
      entry.units += 1;
      if (isReal) entry.realUnits += 1;
      entry.totalPrice += price;
      entry.totalMargin += margin;
      map.set(o.model, entry);
    }
    return Array.from(map.entries())
      .map(([model, v]) => ({
        model,
        units: v.units,
        realUnits: v.realUnits,
        avgPrice: v.units > 0 ? Math.round(v.totalPrice / v.units) : 0,
        avgMargin: v.units > 0 ? Math.round(v.totalMargin / v.units) : 0,
        totalMargin: Math.round(v.totalMargin),
      }))
      .sort((a, b) => b.totalMargin - a.totalMargin);
  }, [filtered, costMap]);

  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const totalRealUnits = rows.reduce((s, r) => s + r.realUnits, 0);
  const totalMargin = rows.reduce((s, r) => s + r.totalMargin, 0);
  const allPriceSum = rows.reduce((s, r) => s + r.avgPrice * r.units, 0);
  const avgMarginPct = totalUnits > 0 && allPriceSum > 0 ? (totalMargin / allPriceSum) * 100 : 0;
  const hasRealData = totalRealUnits > 0;
  const actualCostCoverage = totalUnits > 0 ? Math.round((totalRealUnits / totalUnits) * 100) : 0;
  const topModel = rows[0];

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 animate-fade-in">
      <PageHeader
        title="Margin Analysis"
        description={hasRealData ? `Profit margin by vehicle model — ${totalRealUnits} of ${totalUnits} units with actual cost data` : 'Profit margin by vehicle model (estimated — link purchase invoices for actuals)'}
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Sales', path: '/sales' }, { label: 'Margin Analysis' }]}
      />

      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Total Units', value: totalUnits, helper: `${rows.length} models`, icon: DollarSign, color: 'text-primary' },
          { label: hasRealData ? 'Total Margin' : 'Total Est. Margin', value: formatCurrency(totalMargin), helper: topModel ? `Top model: ${topModel.model}` : 'No ranked model', icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Avg Margin %', value: `${avgMarginPct.toFixed(1)}%`, icon: avgMarginPct >= 8 ? TrendingUp : TrendingDown, color: avgMarginPct >= 8 ? 'text-emerald-500' : 'text-red-500' },
          { label: 'Actual Cost Coverage', value: `${actualCostCoverage}%`, helper: `${totalRealUnits}/${totalUnits} units`, icon: BarChart3, color: hasRealData ? 'text-blue-600' : 'text-amber-600' },
        ].map(k => (
          <div key={k.label} className="glass-panel flex min-w-0 items-start gap-3 p-4">
            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted ${k.color}`}>
              <k.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`mt-1 truncate text-xl font-semibold tabular-nums tracking-normal ${k.color}`} title={String(k.value)}>{k.value}</p>
              {'helper' in k && k.helper && <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={k.helper}>{k.helper}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 rounded-lg border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Margin Workbench</p>
            <p className="mt-0.5 text-sm text-foreground">Compare model profitability and invoice cost coverage in the selected branch and booking period.</p>
          </div>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 w-40 text-sm" aria-label="Margin branch filter"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="h-9 w-44 text-sm" aria-label="Margin period filter"><SelectValue placeholder="All Periods" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Periods</SelectItem>
              {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <div className="glass-panel flex min-h-[360px] flex-col p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {hasRealData ? 'Total Margin by Model' : 'Estimated Margin by Model'}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">Ranked by total model contribution in the current filter scope.</p>
            </div>
            <span className="rounded-md border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{rows.length} models</span>
          </div>
          {rows.length > 0 ? (
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%" minHeight={280}>
                <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 40, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="model" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `RM ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), hasRealData ? 'Margin' : 'Est. Margin']} />
                  <Bar dataKey="totalMargin" radius={[4, 4, 0, 0]}>
                    {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex min-h-[240px] flex-1 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              No margin data matches the selected filters.
            </div>
          )}
        </div>

        <div className="glass-panel flex min-h-[360px] min-w-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Model Margin Detail</h3>
              <p className="mt-1 text-xs text-muted-foreground">Actual cost units show which margins are invoice-backed.</p>
            </div>
            <span className="rounded-md border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{totalUnits} units</span>
          </div>
          <ScrollableRegion className="min-h-0 flex-1 overflow-auto" label="Model margin detail table">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/90 text-muted-foreground backdrop-blur">
                <tr className="border-b border-border text-left text-xs">
                  {['Model','Units','Actual Cost Units','Avg Selling Price','Avg Margin','Total Margin'].map(h => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.model} className="border-b border-border last:border-0 hover:bg-secondary/20">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{r.model}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.units}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {r.realUnits}/{r.units}
                      {r.realUnits < r.units && <span className="ml-1 text-amber-600 text-xs">({r.units - r.realUnits} est.)</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatCurrency(r.avgPrice)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-emerald-600 dark:text-emerald-400">{formatCurrency(r.avgMargin)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(r.totalMargin)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">No sales data</td></tr>}
              </tbody>
            </table>
          </ScrollableRegion>
        </div>
      </div>

      {!hasRealData && (
        <p className="shrink-0 text-xs text-muted-foreground">* Margins are estimated at {(EST_MARGIN_PCT * 100).toFixed(0)}% of selling price. Mark purchase invoices as received to use actual costs.</p>
      )}
    </div>
  );
}
