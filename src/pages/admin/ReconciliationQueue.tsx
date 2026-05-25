import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getReconciliationQueue, getReconciliationStatusCounts } from '@/services/reconciliationService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { AlertTriangle, ArrowRight, CheckCircle2, GitMerge, Link as LinkIcon, XCircle } from 'lucide-react';
import type { ReconciliationMatchStatus, ReconciliationObjectType } from '@/types';

const STATUS_LABELS: Record<ReconciliationMatchStatus, string> = {
  candidate:    'Candidate',
  auto_matched: 'Auto-matched',
  accepted:     'Accepted',
  conflict:     'Conflict',
  ignored:      'Ignored',
  rejected:     'Rejected',
};

const STATUS_BADGE: Record<ReconciliationMatchStatus, string> = {
  candidate:    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  auto_matched: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  accepted:     'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  conflict:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  ignored:      'bg-muted text-muted-foreground',
  rejected:     'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const OBJECT_LABELS: Record<ReconciliationObjectType, string> = {
  sales_order:               'Sales Order',
  vehicle:                   'Vehicle',
  customer:                  'Customer',
  invoice_payment_evidence:  'Invoice / Payment',
};

const STATUS_ORDER: ReconciliationMatchStatus[] = ['conflict', 'candidate', 'auto_matched', 'accepted', 'rejected', 'ignored'];

function fmtConfidence(score: number | null): string {
  if (score == null) return '—';
  return `${(score * 100).toFixed(1)}%`;
}

export default function ReconciliationQueue() {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const canUseReconciliation = useFeatureFlag('phase3d.reconciliation-review-v2', false);

  const [objectFilter, setObjectFilter] = useState<ReconciliationObjectType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ReconciliationMatchStatus | 'all'>('all');

  const countsQuery = useQuery({
    queryKey: ['reconciliation_counts', companyId],
    queryFn: async () => {
      const r = await getReconciliationStatusCounts(companyId);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUseReconciliation,
    staleTime: 30_000,
  });

  const queueQuery = useQuery({
    queryKey: ['reconciliation_queue', companyId, objectFilter, statusFilter],
    queryFn: async () => {
      const r = await getReconciliationQueue(companyId, {
        objectType:  objectFilter === 'all' ? undefined : objectFilter,
        matchStatus: statusFilter === 'all' ? undefined : statusFilter,
        limit:       200,
      });
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUseReconciliation,
    staleTime: 30_000,
  });

  const countsByStatus = useMemo(() => {
    const map = new Map<ReconciliationMatchStatus, number>();
    for (const row of countsQuery.data ?? []) map.set(row.matchStatus, row.total);
    return map;
  }, [countsQuery.data]);

  const totalActionNeeded = (countsByStatus.get('candidate') ?? 0) + (countsByStatus.get('conflict') ?? 0);

  if (!canUseReconciliation) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Reconciliation Queue"
          description="Review source-to-canonical match decisions"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin' }, { label: 'Reconciliation Queue' }]}
        />
        <div className="glass-panel p-12 text-center max-w-md mx-auto">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Feature not available</h3>
          <p className="text-sm text-muted-foreground">Reconciliation Review is not enabled for your company. Contact your administrator for access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Reconciliation Queue"
        description="Candidate and conflicting matches between source staging records and canonical UBS records"
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Admin' },
          { label: 'Reconciliation Queue' },
        ]}
      />

      {/* Status counts banner */}
      {totalActionNeeded > 0 && (
        <div className="glass-panel p-4 border-l-4 border-l-amber-500" data-testid="action-needed-banner">
          <div className="flex items-center gap-3">
            <GitMerge className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-foreground">
              <span className="font-semibold tabular-nums">{totalActionNeeded}</span> match{totalActionNeeded === 1 ? '' : 'es'} require review
              <span className="ml-2 text-xs text-muted-foreground">
                ({countsByStatus.get('conflict') ?? 0} conflict, {countsByStatus.get('candidate') ?? 0} candidate)
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Status counts cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {STATUS_ORDER.map(status => {
          const total = countsByStatus.get(status) ?? 0;
          return (
            <div key={status} className="glass-panel p-3" data-testid={`status-count-${status}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{STATUS_LABELS[status]}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{total.toLocaleString('en-MY')}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={objectFilter} onValueChange={v => setObjectFilter(v as ReconciliationObjectType | 'all')}>
          <SelectTrigger className="h-9 w-48"><SelectValue placeholder="All objects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All objects</SelectItem>
            <SelectItem value="sales_order">Sales Order</SelectItem>
            <SelectItem value="vehicle">Vehicle</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="invoice_payment_evidence">Invoice / Payment</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as ReconciliationMatchStatus | 'all')}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="conflict">Conflict</SelectItem>
            <SelectItem value="candidate">Candidate</SelectItem>
            <SelectItem value="auto_matched">Auto-matched</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Queue list */}
      <ScrollableRegion label="Reconciliation queue">
        {queueQuery.isLoading ? <TableSkeleton />
          : queueQuery.isError ? <PageErrorState error={queueQuery.error} />
          : (queueQuery.data ?? []).length === 0 ? (
            <div className="glass-panel py-10 text-center text-sm text-muted-foreground">
              No matches match the current filters.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Object</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Confidence</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Match Rule</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Priority</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(queueQuery.data ?? []).map(match => (
                    <tr key={match.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`recon-row-${match.id}`}>
                      <td className="px-4 py-2.5">
                        <div className="text-sm font-medium">{OBJECT_LABELS[match.objectType]}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{match.sourceRecordId.slice(0, 8)}…</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-xs font-medium uppercase">{match.sourceSystem}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{match.sourceTable}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[match.matchStatus]}`}>
                          {match.matchStatus === 'accepted'  && <CheckCircle2 className="h-3 w-3" />}
                          {match.matchStatus === 'rejected'  && <XCircle className="h-3 w-3" />}
                          {match.matchStatus === 'conflict'  && <AlertTriangle className="h-3 w-3" />}
                          {match.matchStatus === 'auto_matched' && <LinkIcon className="h-3 w-3" />}
                          {STATUS_LABELS[match.matchStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums">{fmtConfidence(match.confidenceScore)}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{match.matchRule ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums">{match.sourcePriority}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => navigate(`/admin/reconciliation/${match.id}`)}
                          data-testid={`recon-review-${match.id}`}
                        >
                          Review <ArrowRight className="h-3 w-3 ml-1" />
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
