import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getArAgingByBranch } from '@/services/invoiceService';
import { getApAgingByBranch } from '@/services/apService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { AlertTriangle } from 'lucide-react';
import type { AgingBucket, AgingByBranchRow } from '@/types';

const BUCKETS: AgingBucket[] = ['no_due_date', 'current', '1_30_days', '31_60_days', '61_90_days', 'over_90_days'];

const BUCKET_LABELS: Record<AgingBucket, string> = {
  no_due_date:  'No Due Date',
  current:      'Current',
  '1_30_days':  '1–30 days',
  '31_60_days': '31–60 days',
  '61_90_days': '61–90 days',
  over_90_days: 'Over 90 days',
};

function fmt(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type BranchSummary = {
  branchCode: string;
  buckets: Record<AgingBucket, number>;     // outstanding per bucket
  totalOutstanding: number;
  totalOverdue: number;
  invoiceCount: number;
};

function summarize(rows: AgingByBranchRow[]): BranchSummary[] {
  const byBranch = new Map<string, BranchSummary>();
  for (const row of rows) {
    let entry = byBranch.get(row.branchCode);
    if (!entry) {
      entry = {
        branchCode: row.branchCode,
        buckets: { no_due_date: 0, current: 0, '1_30_days': 0, '31_60_days': 0, '61_90_days': 0, over_90_days: 0 },
        totalOutstanding: 0,
        totalOverdue: 0,
        invoiceCount: 0,
      };
      byBranch.set(row.branchCode, entry);
    }
    entry.buckets[row.bucket] += row.totalOutstanding;
    entry.totalOutstanding   += row.totalOutstanding;
    entry.totalOverdue       += row.overdueAmount;
    entry.invoiceCount       += row.invoiceCount;
  }
  return Array.from(byBranch.values()).sort((a, b) => a.branchCode.localeCompare(b.branchCode));
}

function AgingTable({ rows, kind }: { rows: AgingByBranchRow[]; kind: 'ar' | 'ap' }) {
  const summaries = useMemo(() => summarize(rows), [rows]);

  const grandTotals = useMemo(() => {
    const buckets: Record<AgingBucket, number> = { no_due_date: 0, current: 0, '1_30_days': 0, '31_60_days': 0, '61_90_days': 0, over_90_days: 0 };
    let total = 0;
    let overdue = 0;
    let count = 0;
    for (const s of summaries) {
      for (const bucket of BUCKETS) buckets[bucket] += s.buckets[bucket];
      total   += s.totalOutstanding;
      overdue += s.totalOverdue;
      count   += s.invoiceCount;
    }
    return { buckets, total, overdue, count };
  }, [summaries]);

  if (summaries.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No outstanding {kind === 'ar' ? 'receivables' : 'payables'}.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Branch</th>
            {BUCKETS.map(bucket => (
              <th key={bucket} className="px-3 py-2 text-right font-medium text-muted-foreground">{BUCKET_LABELS[bucket]}</th>
            ))}
            <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total (RM)</th>
            <th className="px-4 py-2 text-right font-medium text-muted-foreground">Overdue</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map(branch => (
            <tr key={branch.branchCode} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`aging-row-${kind}-${branch.branchCode}`}>
              <td className="px-4 py-2.5 font-medium">
                {branch.branchCode}
                <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">({branch.invoiceCount} invoices)</span>
              </td>
              {BUCKETS.map(bucket => (
                <td key={bucket} className="px-3 py-2.5 text-right tabular-nums">
                  {branch.buckets[bucket] === 0 ? <span className="text-muted-foreground">—</span> : fmt(branch.buckets[bucket])}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmt(branch.totalOutstanding)}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums ${branch.totalOverdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                {branch.totalOverdue === 0 ? '—' : fmt(branch.totalOverdue)}
              </td>
            </tr>
          ))}
          <tr className="bg-muted/30 font-semibold">
            <td className="px-4 py-2">
              All branches
              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">({grandTotals.count} invoices)</span>
            </td>
            {BUCKETS.map(bucket => (
              <td key={bucket} className="px-3 py-2 text-right tabular-nums">
                {grandTotals.buckets[bucket] === 0 ? '—' : fmt(grandTotals.buckets[bucket])}
              </td>
            ))}
            <td className="px-4 py-2 text-right tabular-nums" data-testid={`aging-total-${kind}`}>{fmt(grandTotals.total)}</td>
            <td className={`px-4 py-2 text-right tabular-nums ${grandTotals.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
              {grandTotals.overdue === 0 ? '—' : fmt(grandTotals.overdue)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function AgingByBranch() {
  const companyId = useCompanyId();
  const canUseReports = useFeatureFlag('phase3b.financial-reports-v2', false);

  const arQuery = useQuery({
    queryKey: ['ar_aging_by_branch', companyId],
    queryFn: async () => {
      const r = await getArAgingByBranch(companyId);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUseReports,
    staleTime: 60_000,
  });

  const apQuery = useQuery({
    queryKey: ['ap_aging_by_branch', companyId],
    queryFn: async () => {
      const r = await getApAgingByBranch(companyId);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUseReports,
    staleTime: 60_000,
  });

  if (!canUseReports) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Aging by Branch"
          description="AR and AP outstanding balances grouped by branch"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Accounts' }, { label: 'Aging by Branch' }]}
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
        title="Aging by Branch"
        description="Receivables and payables outstanding balances grouped by branch and aging bucket"
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Accounts' },
          { label: 'Aging by Branch' },
        ]}
      />

      <Tabs defaultValue="ar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ar">Accounts Receivable</TabsTrigger>
          <TabsTrigger value="ap">Accounts Payable</TabsTrigger>
        </TabsList>

        <TabsContent value="ar">
          <ScrollableRegion label="AR aging by branch">
            {arQuery.isLoading ? <TableSkeleton />
              : arQuery.isError ? <PageErrorState error={arQuery.error} />
              : <AgingTable rows={arQuery.data ?? []} kind="ar" />}
          </ScrollableRegion>
        </TabsContent>

        <TabsContent value="ap">
          <ScrollableRegion label="AP aging by branch">
            {apQuery.isLoading ? <TableSkeleton />
              : apQuery.isError ? <PageErrorState error={apQuery.error} />
              : <AgingTable rows={apQuery.data ?? []} kind="ap" />}
          </ScrollableRegion>
        </TabsContent>
      </Tabs>
    </div>
  );
}
