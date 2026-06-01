import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { listAccountingPeriods, getProfitLoss } from '@/services/glService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { ProfitLossRow } from '@/types';

function fmt(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ProfitLoss() {
  const companyId = useCompanyId();
  const canUseReports = useFeatureFlag('phase3b.financial-reports-v2', false);

  const [periodId, setPeriodId] = useState<string>('');

  const {
    data: periods = [],
    isLoading: periodsLoading,
  } = useQuery({
    queryKey: ['accounting_periods', companyId],
    queryFn: async () => {
      const r = await listAccountingPeriods(companyId);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId && canUseReports,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (!periodId && periods.length > 0) {
      const firstOpen = periods.find(p => p.status === 'open');
      setPeriodId((firstOpen ?? periods[0]).id);
    }
  }, [periods, periodId]);

  const {
    data: rows = [],
    isLoading: rowsLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['profit_loss', companyId, periodId],
    queryFn: async () => {
      const r = await getProfitLoss(companyId, periodId);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId && !!periodId && canUseReports,
    staleTime: 60_000,
  });

  const { revenueRows, expenseRows, totalRevenue, totalExpense, netIncome } = useMemo(() => {
    const revenue = rows.filter((row): row is ProfitLossRow & { accountType: 'revenue' } => row.accountType === 'revenue');
    const expense = rows.filter((row): row is ProfitLossRow & { accountType: 'expense' } => row.accountType === 'expense');
    const totalRev = revenue.reduce((s, r) => s + r.amount, 0);
    const totalExp = expense.reduce((s, r) => s + r.amount, 0);
    return {
      revenueRows: revenue,
      expenseRows: expense,
      totalRevenue: totalRev,
      totalExpense: totalExp,
      netIncome: totalRev - totalExp,
    };
  }, [rows]);

  if (!canUseReports) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Profit & Loss"
          description="Revenue and expense activity by period"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Accounts' }, { label: 'Profit & Loss' }]}
        />
        <FeatureUnavailableState featureName="Profit & Loss" flagName="phase3b.financial-reports-v2" />
      </div>
    );
  }

  if (periodsLoading) return <TableSkeleton />;

  const selectedPeriod = periods.find(p => p.id === periodId);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Profit & Loss"
        description={selectedPeriod ? `Statement for ${selectedPeriod.name}` : 'Revenue and expense activity by period'}
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Accounts' },
          { label: 'Profit & Loss' },
        ]}
        actions={
          <Select value={periodId} onValueChange={setPeriodId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periods.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {rowsLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <PageErrorState error={error} />
      ) : (
        <ScrollableRegion label="Profit and loss statement">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No revenue or expense activity for this period.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Net income banner */}
              <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                netIncome >= 0
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/10 dark:text-emerald-300'
                  : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800/40 dark:bg-red-900/10 dark:text-red-300'
              }`}>
                {netIncome >= 0
                  ? <TrendingUp className="h-4 w-4 shrink-0" />
                  : <TrendingDown className="h-4 w-4 shrink-0" />}
                <span data-testid="pl-net-income">
                  Net {netIncome >= 0 ? 'Income' : 'Loss'}: RM {fmt(Math.abs(netIncome))}
                </span>
              </div>

              {/* Revenue section */}
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                    Revenue
                  </span>
                </h3>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground w-24">Code</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Account</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">Amount (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueRows.length === 0 ? (
                        <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground">No revenue activity</td></tr>
                      ) : revenueRows.map(row => (
                        <tr key={row.accountId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs">{row.accountCode}</td>
                          <td className="px-4 py-2.5">{row.accountName}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/30 font-semibold">
                        <td colSpan={2} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                          Total Revenue
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums" data-testid="pl-total-revenue">{fmt(totalRevenue)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Expense section */}
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    Expenses
                  </span>
                </h3>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground w-24">Code</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Account</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">Amount (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseRows.length === 0 ? (
                        <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground">No expense activity</td></tr>
                      ) : expenseRows.map(row => (
                        <tr key={row.accountId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs">{row.accountCode}</td>
                          <td className="px-4 py-2.5">{row.accountName}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/30 font-semibold">
                        <td colSpan={2} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                          Total Expenses
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums" data-testid="pl-total-expense">{fmt(totalExpense)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Net income grand total */}
              <div className="rounded-lg border bg-muted/10 overflow-hidden">
                <table className="w-full text-sm font-semibold">
                  <tbody>
                    <tr>
                      <td className="px-4 py-3 w-24" />
                      <td className="px-4 py-3 uppercase tracking-wide text-muted-foreground">
                        Net {netIncome >= 0 ? 'Income' : 'Loss'}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${netIncome < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                        {netIncome < 0 ? `(${fmt(Math.abs(netIncome))})` : fmt(netIncome)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ScrollableRegion>
      )}
    </div>
  );
}
