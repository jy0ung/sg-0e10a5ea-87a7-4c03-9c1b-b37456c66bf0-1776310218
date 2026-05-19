import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompanyId } from '@/hooks/useCompanyId';
import { listAccountingPeriods, getTrialBalance } from '@/services/glService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { GlAccountType, TrialBalanceRow } from '@/types';

const ACCOUNT_TYPES: GlAccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const TYPE_LABELS: Record<GlAccountType, string> = {
  asset:     'Assets',
  liability: 'Liabilities',
  equity:    'Equity',
  revenue:   'Revenue',
  expense:   'Expenses',
};

const TYPE_BADGE: Record<GlAccountType, string> = {
  asset:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  liability: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  equity:    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  revenue:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  expense:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

function fmt(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TrialBalance() {
  const companyId = useCompanyId();

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
    enabled: !!companyId,
    staleTime: 60_000,
  });

  // Auto-select first open period once periods load
  React.useEffect(() => {
    if (!periodId && periods.length > 0) {
      const firstOpen = periods.find(p => p.status === 'open');
      setPeriodId((firstOpen ?? periods[0]).id);
    }
  }, [periods, periodId]);

  const {
    data: rows = [],
    isLoading: tbLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['trial_balance', companyId, periodId],
    queryFn: async () => {
      const r = await getTrialBalance(companyId, periodId || undefined);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const grouped = useMemo(
    () =>
      ACCOUNT_TYPES.reduce<Record<GlAccountType, TrialBalanceRow[]>>(
        (acc, t) => { acc[t] = rows.filter(r => r.accountType === t); return acc; },
        { asset: [], liability: [], equity: [], revenue: [], expense: [] },
      ),
    [rows],
  );

  const grandTotalDebit  = rows.reduce((s, r) => s + r.totalDebit, 0);
  const grandTotalCredit = rows.reduce((s, r) => s + r.totalCredit, 0);
  const isBalanced = Math.abs(grandTotalDebit - grandTotalCredit) < 0.005;

  if (periodsLoading) return <TableSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Trial Balance"
        description="Debit and credit totals per account for the selected period"
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Accounts', path: '/accounts/trial-balance' },
          { label: 'Trial Balance' },
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

      {tbLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <PageErrorState error={error} />
      ) : (
        <ScrollableRegion label="Trial balance list">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No journal entries for this period.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Balance check banner */}
              <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                isBalanced
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/10 dark:text-emerald-300'
                  : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800/40 dark:bg-red-900/10 dark:text-red-300'
              }`}>
                {isBalanced
                  ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                  : <AlertTriangle className="h-4 w-4 shrink-0" />}
                {isBalanced
                  ? 'Balanced — total debits equal total credits.'
                  : `Out of balance — debits ${fmt(grandTotalDebit)} vs credits ${fmt(grandTotalCredit)} (diff ${fmt(Math.abs(grandTotalDebit - grandTotalCredit))}).`}
              </div>

              {/* Account groups */}
              {ACCOUNT_TYPES.map(type => {
                const typeRows = grouped[type];
                if (typeRows.length === 0) return null;

                const typeTotalDebit  = typeRows.reduce((s, r) => s + r.totalDebit, 0);
                const typeTotalCredit = typeRows.reduce((s, r) => s + r.totalCredit, 0);

                return (
                  <div key={type}>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[type]}`}>
                        {TYPE_LABELS[type]}
                      </span>
                    </h3>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground w-24">Code</th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Account</th>
                            <th className="px-4 py-2 text-right font-medium text-muted-foreground">Debit (RM)</th>
                            <th className="px-4 py-2 text-right font-medium text-muted-foreground">Credit (RM)</th>
                            <th className="px-4 py-2 text-right font-medium text-muted-foreground hidden sm:table-cell">Net (RM)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {typeRows.map(row => (
                            <tr key={row.accountId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-2.5 font-mono text-xs">{row.accountCode}</td>
                              <td className="px-4 py-2.5">{row.accountName}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.totalDebit)}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.totalCredit)}</td>
                              <td className={`px-4 py-2.5 text-right tabular-nums hidden sm:table-cell font-medium ${row.netBalance >= 0 ? '' : 'text-red-600 dark:text-red-400'}`}>
                                {row.netBalance < 0 ? `(${fmt(Math.abs(row.netBalance))})` : fmt(row.netBalance)}
                              </td>
                            </tr>
                          ))}
                          {/* Type subtotal */}
                          <tr className="bg-muted/30 font-semibold">
                            <td colSpan={2} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                              {TYPE_LABELS[type]} Total
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">{fmt(typeTotalDebit)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{fmt(typeTotalCredit)}</td>
                            <td className="px-4 py-2 hidden sm:table-cell" />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {/* Grand total */}
              <div className="rounded-lg border bg-muted/10 overflow-hidden">
                <table className="w-full text-sm font-semibold">
                  <tbody>
                    <tr>
                      <td className="px-4 py-3 w-24" />
                      <td className="px-4 py-3 uppercase tracking-wide text-muted-foreground">Grand Total</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(grandTotalDebit)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(grandTotalCredit)}</td>
                      <td className="px-4 py-3 hidden sm:table-cell" />
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
