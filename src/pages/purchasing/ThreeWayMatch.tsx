import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getThreeWayMatchQueue, getThreeWayMatchStatusCounts } from '@/services/threeWayMatchService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, GitCompare, Unplug } from 'lucide-react';
import type { ThreeWayMatchStatus } from '@/types';

const STATUS_LABELS: Record<ThreeWayMatchStatus, string> = {
  unmatched:       'Unmatched',
  pending_receipt: 'Pending Receipt',
  amount_variance: 'Amount Variance',
  matched:         'Matched',
};

const STATUS_BADGE: Record<ThreeWayMatchStatus, string> = {
  unmatched:       'bg-muted text-muted-foreground',
  pending_receipt: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  amount_variance: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  matched:         'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const STATUS_ORDER: ThreeWayMatchStatus[] = ['amount_variance', 'pending_receipt', 'unmatched', 'matched'];

function fmtMoney(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVariance(n: number | null): string {
  if (n == null) return '—';
  if (Math.abs(n) < 0.005) return '0.00';
  return (n < 0 ? `(${fmtMoney(Math.abs(n))})` : fmtMoney(n));
}

export default function ThreeWayMatch() {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const canUsePo = useFeatureFlag('phase3e.po-grn-v2', false);

  const [statusFilter, setStatusFilter] = useState<ThreeWayMatchStatus | 'all'>('all');

  const countsQuery = useQuery({
    queryKey: ['three_way_match_counts', companyId],
    queryFn: async () => {
      const r = await getThreeWayMatchStatusCounts(companyId);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUsePo,
    staleTime: 30_000,
  });

  const queueQuery = useQuery({
    queryKey: ['three_way_match_queue', companyId, statusFilter],
    queryFn: async () => {
      const r = await getThreeWayMatchQueue(companyId, {
        matchStatus: statusFilter === 'all' ? undefined : statusFilter,
      });
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUsePo,
    staleTime: 30_000,
  });

  const countsByStatus = useMemo(() => {
    const map = new Map<ThreeWayMatchStatus, number>();
    for (const row of countsQuery.data ?? []) map.set(row.matchStatus, row.total);
    return map;
  }, [countsQuery.data]);

  const actionNeeded =
    (countsByStatus.get('amount_variance') ?? 0) +
    (countsByStatus.get('pending_receipt') ?? 0) +
    (countsByStatus.get('unmatched') ?? 0);

  if (!canUsePo) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="3-way Match"
          description="PO ↔ GRN ↔ PI reconciliation"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Purchasing' }, { label: '3-way Match' }]}
        />
        <FeatureUnavailableState featureName="3-way Match" flagName="phase3e.po-grn-v2" />
      </div>
    );
  }

  const rows = queueQuery.data ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="3-way Match"
        description="Compares purchase invoices against the linked PO line and GRN receipts. Tolerance: RM 1.00 on amount."
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Purchasing' },
          { label: '3-way Match' },
        ]}
      />

      {/* Action-needed banner */}
      {actionNeeded > 0 && (
        <div className="glass-panel p-4 border-l-4 border-l-amber-500" data-testid="action-needed-banner">
          <div className="flex items-center gap-3">
            <GitCompare className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-foreground">
              <span className="font-semibold tabular-nums">{actionNeeded}</span> invoice{actionNeeded === 1 ? '' : 's'} need attention
              <span className="ml-2 text-xs text-muted-foreground">
                ({countsByStatus.get('amount_variance') ?? 0} variance,
                {' '}{countsByStatus.get('pending_receipt') ?? 0} pending receipt,
                {' '}{countsByStatus.get('unmatched') ?? 0} unmatched)
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Status count cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATUS_ORDER.map(status => {
          const total = countsByStatus.get(status) ?? 0;
          return (
            <div key={status} className="glass-panel p-3" data-testid={`tw-count-${status}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                {status === 'matched' && <CheckCircle2 className="h-3 w-3" />}
                {status === 'amount_variance' && <AlertTriangle className="h-3 w-3" />}
                {status === 'pending_receipt' && <Clock className="h-3 w-3" />}
                {status === 'unmatched' && <Unplug className="h-3 w-3" />}
                {STATUS_LABELS[status]}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{total.toLocaleString('en-MY')}</p>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as ThreeWayMatchStatus | 'all')}>
          <SelectTrigger className="h-9 w-48"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="amount_variance">Amount Variance</SelectItem>
            <SelectItem value="pending_receipt">Pending Receipt</SelectItem>
            <SelectItem value="unmatched">Unmatched</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Queue table */}
      <ScrollableRegion label="3-way match queue">
        {queueQuery.isLoading ? <TableSkeleton />
          : queueQuery.isError ? <PageErrorState error={queueQuery.error} />
          : rows.length === 0 ? (
            <div className="glass-panel py-10 text-center text-sm text-muted-foreground">
              No purchase invoices match the current filter.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">PI No.</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Supplier</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Chassis</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">PO</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ordered Qty</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Received</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Expected</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">PI Amount</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Variance</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.purchaseInvoiceId} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`tw-row-${row.purchaseInvoiceId}`}>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[row.matchStatus]}`}>
                          {STATUS_LABELS[row.matchStatus]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{row.invoiceNo}</td>
                      <td className="px-3 py-2.5 text-xs">{row.supplier}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{row.chassisNo ?? '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{row.poNo ?? '—'}{row.poLineNo != null ? ` · L${row.poLineNo}` : ''}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">{row.orderedQuantity ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">{row.receivedQuantity}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">{fmtMoney(row.expectedAmount)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">{fmtMoney(row.piAmount)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums text-xs ${(row.amountVariance ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : (row.amountVariance ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                        {fmtVariance(row.amountVariance)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => navigate(`/purchasing/invoices/${row.purchaseInvoiceId}`)}
                          data-testid={`tw-open-${row.purchaseInvoiceId}`}
                        >
                          View PI <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </ScrollableRegion>
    </div>
  );
}
