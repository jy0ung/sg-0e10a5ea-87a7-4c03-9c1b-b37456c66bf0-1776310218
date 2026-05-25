import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getCashPosition } from '@/services/glService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { CashPositionRow } from '@/types';

function fmt(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function CashPosition() {
  const companyId = useCompanyId();
  const canUseReports = useFeatureFlag('phase3b.financial-reports-v2', false);

  const [fromDate, setFromDate] = useState(isoDaysAgo(30));
  const [toDate, setToDate] = useState(isoToday());

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ['cash_position', companyId, fromDate, toDate],
    queryFn: async () => {
      const r = await getCashPosition(companyId, fromDate, toDate);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId && !!fromDate && !!toDate && canUseReports,
    staleTime: 60_000,
  });

  const { openingBalance, closingBalance, totalInflow, totalOutflow, netChange } = useMemo(() => {
    if (rows.length === 0) {
      return { openingBalance: 0, closingBalance: 0, totalInflow: 0, totalOutflow: 0, netChange: 0 };
    }
    const opening = rows[0].runningBalance - rows[0].dailyNet;
    const closing = rows[rows.length - 1].runningBalance;
    const inflow  = rows.reduce((s, r) => s + r.dailyDebit, 0);
    const outflow = rows.reduce((s, r) => s + r.dailyCredit, 0);
    return {
      openingBalance: opening,
      closingBalance: closing,
      totalInflow:  inflow,
      totalOutflow: outflow,
      netChange:    inflow - outflow,
    };
  }, [rows]);

  if (!canUseReports) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Cash Position"
          description="Daily Cash and Bank balance trajectory"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Accounts' }, { label: 'Cash Position' }]}
        />
        <div className="glass-panel p-12 text-center max-w-md mx-auto">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Feature not available</h3>
          <p className="text-sm text-muted-foreground">Financial reporting is not enabled for your company. Contact your administrator for access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Cash Position"
        description={`Daily Cash and Bank balance from ${fromDate} to ${toDate}`}
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Accounts' },
          { label: 'Cash Position' },
        ]}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 w-40" max={toDate} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 w-40" min={fromDate} max={isoToday()} />
            </div>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Opening Balance</p>
          <p className="mt-1 text-xl font-semibold tabular-nums" data-testid="cash-opening">{fmt(openingBalance)}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Inflow (Debits)</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="cash-inflow">{fmt(totalInflow)}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Outflow (Credits)</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-red-600 dark:text-red-400" data-testid="cash-outflow">{fmt(totalOutflow)}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Closing Balance</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${closingBalance < 0 ? 'text-red-600 dark:text-red-400' : ''}`} data-testid="cash-closing">
            {fmt(closingBalance)}
          </p>
          <p className={`mt-0.5 text-xs ${netChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {netChange >= 0 ? '+' : ''}{fmt(netChange)} vs opening
          </p>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <PageErrorState error={error} />
      ) : rows.length === 0 ? (
        <div className="glass-panel py-16 text-center text-sm text-muted-foreground">
          No cash account activity in this range. The Cash and Bank (1000) system account may not be seeded yet.
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="glass-panel p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Running balance</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="positionDate" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => fmt(value)}
                  labelFormatter={(label: string) => `Date: ${label}`}
                />
                <Area type="monotone" dataKey="runningBalance" stroke="hsl(var(--primary))" fill="url(#cashGradient)" name="Running Balance" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Daily table */}
          <ScrollableRegion label="Daily cash activity">
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Inflow (RM)</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Outflow (RM)</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Net</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: CashPositionRow) => (
                    <tr key={row.positionDate} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs">{row.positionDate}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {row.dailyDebit === 0 ? <span className="text-muted-foreground">—</span> : <span className="text-emerald-600 dark:text-emerald-400">{fmt(row.dailyDebit)}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {row.dailyCredit === 0 ? <span className="text-muted-foreground">—</span> : <span className="text-red-600 dark:text-red-400">{fmt(row.dailyCredit)}</span>}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${row.dailyNet === 0 ? 'text-muted-foreground' : row.dailyNet < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {row.dailyNet === 0 ? '—' : (row.dailyNet < 0 ? `(${fmt(Math.abs(row.dailyNet))})` : fmt(row.dailyNet))}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${row.runningBalance < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                        {row.runningBalance < 0 ? `(${fmt(Math.abs(row.runningBalance))})` : fmt(row.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollableRegion>
        </>
      )}
    </div>
  );
}
