import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { listAccountingPeriods, getPeriodCloseSummary, getPeriodCloseUnposted } from '@/services/glService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';

function fmt(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PeriodCloseDrilldown() {
  const companyId = useCompanyId();
  const canUseReports = useFeatureFlag('phase3b.financial-reports-v2', false);

  const [periodId, setPeriodId] = useState<string>('');

  const { data: periods = [], isLoading: periodsLoading } = useQuery({
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

  const summaryQuery = useQuery({
    queryKey: ['period_close_summary', companyId, periodId],
    queryFn: async () => {
      const r = await getPeriodCloseSummary(companyId, periodId);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && !!periodId && canUseReports,
    staleTime: 30_000,
  });

  const unpostedQuery = useQuery({
    queryKey: ['period_close_unposted', companyId, periodId],
    queryFn: async () => {
      const r = await getPeriodCloseUnposted(companyId, periodId);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId && !!periodId && canUseReports,
    staleTime: 30_000,
  });

  const summary = summaryQuery.data ?? null;

  const isReady = useMemo(() => {
    if (!summary) return false;
    return summary.unpostedArPaymentCount === 0
        && summary.unpostedApPaymentCount === 0
        && Math.abs(summary.totalDebit - summary.totalCredit) < 0.005;
  }, [summary]);

  if (!canUseReports) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Period Close"
          description="Drill into journal totals, unposted payments, and open invoices before closing a period"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Accounts' }, { label: 'Period Close' }]}
        />
        <FeatureUnavailableState routeId="accounts-period-close" />
      </div>
    );
  }

  if (periodsLoading) return <TableSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Period Close"
        description={summary
          ? `${summary.periodStartDate} to ${summary.periodEndDate} — status: ${summary.periodStatus}`
          : 'Drill into journal totals, unposted payments, and open invoices before closing a period'}
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Accounts' },
          { label: 'Period Close' },
        ]}
        actions={
          <Select value={periodId} onValueChange={setPeriodId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periods.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {summaryQuery.isLoading ? (
        <TableSkeleton />
      ) : summaryQuery.isError ? (
        <PageErrorState error={summaryQuery.error} />
      ) : !summary ? (
        <div className="glass-panel py-16 text-center text-sm text-muted-foreground">
          Select a period to inspect.
        </div>
      ) : (
        <>
          {/* Readiness banner */}
          <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            summary.periodStatus !== 'open'
              ? 'border-muted bg-muted/30 text-muted-foreground'
              : isReady
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/10 dark:text-emerald-300'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/10 dark:text-amber-300'
          }`}>
            {summary.periodStatus !== 'open'
              ? <Lock className="h-4 w-4 shrink-0" />
              : isReady
                ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span data-testid="pc-readiness">
              {summary.periodStatus !== 'open'
                ? `Period is ${summary.periodStatus} — read-only.`
                : isReady
                  ? 'Ready to close — all source payments posted and journal entries balanced.'
                  : `Not ready to close — ${summary.unpostedArPaymentCount + summary.unpostedApPaymentCount} unposted payment${summary.unpostedArPaymentCount + summary.unpostedApPaymentCount === 1 ? '' : 's'}.`}
            </span>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="glass-panel p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Journal Entries</p>
              <p className="mt-1 text-xl font-semibold tabular-nums" data-testid="pc-je-count">{summary.journalEntryCount}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">DR {fmt(summary.totalDebit)} / CR {fmt(summary.totalCredit)}</p>
            </div>
            <div className="glass-panel p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Unposted AR Payments</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${summary.unpostedArPaymentCount > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`} data-testid="pc-unposted-ar">
                {summary.unpostedArPaymentCount}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">RM {fmt(summary.unpostedArPaymentAmount)}</p>
            </div>
            <div className="glass-panel p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Unposted AP Payments</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${summary.unpostedApPaymentCount > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`} data-testid="pc-unposted-ap">
                {summary.unpostedApPaymentCount}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">RM {fmt(summary.unpostedApPaymentAmount)}</p>
            </div>
            <div className="glass-panel p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Open Invoices (AR + AP)</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{summary.openArInvoiceCount + summary.openApInvoiceCount}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                AR RM {fmt(summary.openArInvoiceOutstanding)} / AP RM {fmt(summary.openApInvoiceOutstanding)}
              </p>
            </div>
          </div>

          {/* Unposted detail table */}
          <ScrollableRegion label="Unposted payment events">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Unposted payment events ({unpostedQuery.data?.length ?? 0})</h3>
              {unpostedQuery.isLoading ? <TableSkeleton />
                : unpostedQuery.isError ? <PageErrorState error={unpostedQuery.error} />
                : (unpostedQuery.data?.length ?? 0) === 0 ? (
                  <div className="glass-panel py-10 text-center text-sm text-muted-foreground">
                    No unposted payment events in this period.
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Kind</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Payment Date</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Reference</th>
                          <th className="px-4 py-2 text-right font-medium text-muted-foreground">Amount (RM)</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Event ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(unpostedQuery.data ?? []).map(row => (
                          <tr key={row.eventId} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`pc-unposted-row-${row.eventId}`}>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${row.kind === 'ar_payment' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                                {row.kind === 'ar_payment' ? 'AR' : 'AP'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs">{row.paymentDate}</td>
                            <td className="px-4 py-2.5">{row.reference ?? <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmt(row.amount)}</td>
                            <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{row.eventId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </ScrollableRegion>
        </>
      )}
    </div>
  );
}
