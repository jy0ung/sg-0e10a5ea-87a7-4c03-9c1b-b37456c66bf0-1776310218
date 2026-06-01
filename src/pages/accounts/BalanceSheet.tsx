import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { listAccountingPeriods, getBalanceSheet } from '@/services/glService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { BalanceSheetRow } from '@/types';

const SECTION_LABELS = {
  asset:     'Assets',
  liability: 'Liabilities',
  equity:    'Equity',
} as const;

const SECTION_BADGE: Record<'asset' | 'liability' | 'equity', string> = {
  asset:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  liability: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  equity:    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

function fmt(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BalanceSheet() {
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
    queryKey: ['balance_sheet', companyId, periodId],
    queryFn: async () => {
      const r = await getBalanceSheet(companyId, periodId);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId && !!periodId && canUseReports,
    staleTime: 60_000,
  });

  const { assetRows, liabilityRows, equityRows, totalAssets, totalLiabilities, totalEquity, liabilitiesPlusEquity, isBalanced } = useMemo(() => {
    const asset     = rows.filter((row): row is BalanceSheetRow & { accountType: 'asset' } => row.accountType === 'asset');
    const liability = rows.filter((row): row is BalanceSheetRow & { accountType: 'liability' } => row.accountType === 'liability');
    const equity    = rows.filter((row): row is BalanceSheetRow & { accountType: 'equity' } => row.accountType === 'equity');
    const tA = asset.reduce((s, r) => s + r.balance, 0);
    const tL = liability.reduce((s, r) => s + r.balance, 0);
    const tE = equity.reduce((s, r) => s + r.balance, 0);
    const lhs = tL + tE;
    return {
      assetRows: asset,
      liabilityRows: liability,
      equityRows: equity,
      totalAssets: tA,
      totalLiabilities: tL,
      totalEquity: tE,
      liabilitiesPlusEquity: lhs,
      isBalanced: Math.abs(tA - lhs) < 0.005,
    };
  }, [rows]);

  if (!canUseReports) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Balance Sheet"
          description="Statement of financial position as of period end"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Accounts' }, { label: 'Balance Sheet' }]}
        />
        <FeatureUnavailableState featureName="Balance Sheet" flagName="phase3b.financial-reports-v2" />
      </div>
    );
  }

  if (periodsLoading) return <TableSkeleton />;

  const selectedPeriod = periods.find(p => p.id === periodId);

  const renderSection = (type: 'asset' | 'liability' | 'equity', sectionRows: BalanceSheetRow[], sectionTotal: number) => (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SECTION_BADGE[type]}`}>
          {SECTION_LABELS[type]}
        </span>
      </h3>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground w-24">Code</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Account</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Balance (RM)</th>
            </tr>
          </thead>
          <tbody>
            {sectionRows.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground">No {SECTION_LABELS[type].toLowerCase()} balances</td></tr>
            ) : sectionRows.map(row => (
              <tr key={row.accountId ?? `${type}-${row.accountCode}`} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs">{row.accountCode}</td>
                <td className="px-4 py-2.5">
                  {row.accountName}
                  {row.accountId === null && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">synthetic</span>}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${row.balance < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {row.balance < 0 ? `(${fmt(Math.abs(row.balance))})` : fmt(row.balance)}
                </td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td colSpan={2} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                Total {SECTION_LABELS[type]}
              </td>
              <td className="px-4 py-2 text-right tabular-nums" data-testid={`bs-total-${type}`}>
                {sectionTotal < 0 ? `(${fmt(Math.abs(sectionTotal))})` : fmt(sectionTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Balance Sheet"
        description={selectedPeriod ? `As of ${selectedPeriod.endDate}` : 'Statement of financial position as of period end'}
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Accounts' },
          { label: 'Balance Sheet' },
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
        <ScrollableRegion label="Balance sheet">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No balance sheet activity through this period.
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
                <span data-testid="bs-balance-check">
                  {isBalanced
                    ? `Balanced — Assets RM ${fmt(totalAssets)} = Liabilities + Equity RM ${fmt(liabilitiesPlusEquity)}.`
                    : `Out of balance — Assets RM ${fmt(totalAssets)} vs Liab+Equity RM ${fmt(liabilitiesPlusEquity)} (diff RM ${fmt(Math.abs(totalAssets - liabilitiesPlusEquity))}).`}
                </span>
              </div>

              {renderSection('asset',     assetRows,     totalAssets)}
              {renderSection('liability', liabilityRows, totalLiabilities)}
              {renderSection('equity',    equityRows,    totalEquity)}

              {/* Grand total */}
              <div className="rounded-lg border bg-muted/10 overflow-hidden">
                <table className="w-full text-sm font-semibold">
                  <tbody>
                    <tr className="border-b last:border-0">
                      <td className="px-4 py-3 w-24" />
                      <td className="px-4 py-3 uppercase tracking-wide text-muted-foreground">Total Assets</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(totalAssets)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 w-24" />
                      <td className="px-4 py-3 uppercase tracking-wide text-muted-foreground">Total Liabilities + Equity</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(liabilitiesPlusEquity)}</td>
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
