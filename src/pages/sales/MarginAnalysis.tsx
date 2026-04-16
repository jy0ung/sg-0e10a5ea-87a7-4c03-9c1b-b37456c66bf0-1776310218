import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useSales } from '@/contexts/SalesContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

// Estimated cost is approximated as 90% of booking amount when totalPrice is unknown,
// or (totalPrice - margin) when a dealer cost field exists. Until cost data is available
// from AP integration, we use a configurable estimated margin % (default 8%).
const EST_MARGIN_PCT = 0.08;

interface ModelRow {
  model: string;
  units: number;
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

  useEffect(() => { reloadSales(); }, []);

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

  // Group by model
  const rows: ModelRow[] = useMemo(() => {
    const map = new Map<string, { units: number; totalPrice: number; totalMargin: number }>();
    for (const o of filtered) {
      const price = o.totalPrice ?? 0;
      const margin = price * EST_MARGIN_PCT;
      const entry = map.get(o.model) ?? { units: 0, totalPrice: 0, totalMargin: 0 };
      entry.units += 1;
      entry.totalPrice += price;
      entry.totalMargin += margin;
      map.set(o.model, entry);
    }
    return Array.from(map.entries())
      .map(([model, v]) => ({
        model,
        units: v.units,
        avgPrice: v.units > 0 ? Math.round(v.totalPrice / v.units) : 0,
        avgMargin: v.units > 0 ? Math.round(v.totalMargin / v.units) : 0,
        totalMargin: Math.round(v.totalMargin),
      }))
      .sort((a, b) => b.totalMargin - a.totalMargin);
  }, [filtered]);

  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const totalMargin = rows.reduce((s, r) => s + r.totalMargin, 0);
  const avgMarginPct = totalUnits > 0 ? (totalMargin / rows.reduce((s, r) => s + r.avgPrice * r.units, 0)) * 100 : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Margin Analysis"
        description="Estimated profit margin by vehicle model"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Sales' }, { label: 'Margin Analysis' }]}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Units', value: totalUnits, icon: DollarSign, color: 'text-primary' },
          { label: 'Total Est. Margin', value: `RM ${totalMargin.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-500' },
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
          <h3 className="text-sm font-medium mb-3 text-muted-foreground">Total Estimated Margin by Model (RM)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 24, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="model" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `RM ${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [`RM ${v.toLocaleString()}`, 'Est. Margin']} />
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
              {['Model','Units','Avg Selling Price','Avg Est. Margin','Total Est. Margin'].map(h => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.model} className="border-b border-border last:border-0 hover:bg-secondary/20">
                <td className="px-3 py-2 font-medium">{r.model}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.units}</td>
                <td className="px-3 py-2">RM {r.avgPrice.toLocaleString()}</td>
                <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">RM {r.avgMargin.toLocaleString()}</td>
                <td className="px-3 py-2 font-semibold text-emerald-600 dark:text-emerald-400">RM {r.totalMargin.toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">No sales data</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">* All margins are estimated at {(EST_MARGIN_PCT * 100).toFixed(0)}% of selling price pending AP cost integration.</p>
    </div>
  );
}
