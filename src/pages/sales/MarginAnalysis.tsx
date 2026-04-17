import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useSales } from '@/contexts/SalesContext';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

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

export default function MarginAnalysis() {
  const { user } = useAuth();
  const { salesOrders, reloadSales } = useSales();

  const [branchFilter, setBranchFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  // Map<chassisNo, invoiceCost>
  const [costMap, setCostMap] = useState<Map<string, number>>(new Map());

  useEffect(() => { reloadSales(); }, [reloadSales]);

  // Fetch purchase invoice costs once per company
  const loadCosts = useCallback(async () => {
    if (!user?.company_id) return;
    const { data } = await supabase
      .from('purchase_invoices')
      .select('chassis_no, amount')
      .eq('company_id', user.company_id)
      .eq('status', 'received');
    if (data) {
      const map = new Map<string, number>();
      for (const row of data) {
        if (row.chassis_no) map.set(row.chassis_no as string, Number(row.amount ?? 0));
      }
      setCostMap(map);
    }
  }, [user?.company_id]);

  useEffect(() => { loadCosts(); }, [loadCosts]);

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

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Margin Analysis"
        description={hasRealData ? `Profit margin by vehicle model — ${totalRealUnits} of ${totalUnits} units with actual cost data` : 'Profit margin by vehicle model (estimated — link purchase invoices for actuals)'}
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Sales' }, { label: 'Margin Analysis' }]}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Units', value: totalUnits, icon: DollarSign, color: 'text-primary' },
          { label: hasRealData ? 'Total Margin' : 'Total Est. Margin', value: `RM ${totalMargin.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-500' },
          { label: 'Avg Margin %', value: `${avgMarginPct.toFixed(1)}%`, icon: avgMarginPct >= 8 ? TrendingUp : TrendingDown, color: avgMarginPct >= 8 ? 'text-emerald-500' : 'text-red-500' },
        ].map(k => (
          <div key={k.label} className="glass-panel p-4 flex items-start gap-3">
            <k.icon className={`h-5 w-5 mt-0.5 ${k.color}`} />
            <div>
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Branches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All Periods" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Periods</SelectItem>
            {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Bar chart */}
      {rows.length > 0 && (
        <div className="glass-panel p-4">
          <h3 className="text-sm font-medium mb-3 text-muted-foreground">
            {hasRealData ? 'Total Margin by Model (RM)' : 'Total Est. Margin by Model (RM)'}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 24, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="model" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `RM ${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [`RM ${v.toLocaleString()}`, hasRealData ? 'Margin' : 'Est. Margin']} />
              <Bar dataKey="totalMargin" radius={[4, 4, 0, 0]}>
                {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detail table */}
      <div className="glass-panel overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {['Model','Units','Actual Cost Units','Avg Selling Price','Avg Margin','Total Margin'].map(h => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.model} className="border-b border-border last:border-0 hover:bg-secondary/20">
                <td className="px-3 py-2 font-medium">{r.model}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.units}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.realUnits}/{r.units}
                  {r.realUnits < r.units && <span className="ml-1 text-amber-500 text-xs">({r.units - r.realUnits} est.)</span>}
                </td>
                <td className="px-3 py-2">RM {r.avgPrice.toLocaleString()}</td>
                <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">RM {r.avgMargin.toLocaleString()}</td>
                <td className="px-3 py-2 font-semibold text-emerald-600 dark:text-emerald-400">RM {r.totalMargin.toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">No sales data</td></tr>}
          </tbody>
        </table>
      </div>

      {!hasRealData && (
        <p className="text-xs text-muted-foreground">* Margins are estimated at {(EST_MARGIN_PCT * 100).toFixed(0)}% of selling price. Mark purchase invoices as received to use actual costs.</p>
      )}
    </div>
  );
}
