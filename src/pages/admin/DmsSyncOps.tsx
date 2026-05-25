import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getDmsSyncRunsSummary, getDmsRawStagingCounts, listSyncRuns, markSyncRunForRetry } from '@/services/dmsService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle, Database, KeyRound, RotateCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { SyncRunStatus, SyncSourceSystem } from '@/types';

const SOURCE_LABELS: Record<SyncSourceSystem, string> = {
  dms:            'Proton DMS',
  legacy_fookloi: 'Legacy fookloi.net',
  google_sheets:  'Google Sheets',
  manual:         'Manual',
};

const STATUS_BADGE: Record<SyncRunStatus, string> = {
  pending:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  running:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  succeeded: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  failed:    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-muted text-muted-foreground',
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-MY', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDuration(start: string, end: string | null): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export default function DmsSyncOps() {
  const companyId = useCompanyId();
  const canUseSyncOps = useFeatureFlag('phase3c.dms-sync-ops-v2', false);

  const queryClient = useQueryClient();
  const [sourceFilter, setSourceFilter] = useState<SyncSourceSystem | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<SyncRunStatus | 'all'>('all');
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);

  async function handleRetry(runId: string) {
    setRetryingRunId(runId);
    const result = await markSyncRunForRetry(companyId, runId);
    setRetryingRunId(null);
    if (result.error) {
      toast.error('Retry failed', { description: result.error.message });
      return;
    }
    toast.success('Sync run reset to pending', { description: 'The next worker pass will pick it up.' });
    void queryClient.invalidateQueries({ queryKey: ['sync_runs', companyId] });
    void queryClient.invalidateQueries({ queryKey: ['dms_sync_summary', companyId] });
  }

  const summaryQuery = useQuery({
    queryKey: ['dms_sync_summary', companyId],
    queryFn: async () => {
      const r = await getDmsSyncRunsSummary(companyId);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId && canUseSyncOps,
    staleTime: 30_000,
  });

  const stagingQuery = useQuery({
    queryKey: ['dms_staging_counts', companyId],
    queryFn: async () => {
      const r = await getDmsRawStagingCounts(companyId);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId && canUseSyncOps,
    staleTime: 30_000,
  });

  const runsQuery = useQuery({
    queryKey: ['sync_runs', companyId, sourceFilter, statusFilter],
    queryFn: async () => {
      const r = await listSyncRuns(companyId, {
        sourceSystem: sourceFilter === 'all' ? undefined : sourceFilter,
        status:       statusFilter === 'all' ? undefined : statusFilter,
        limit:        100,
      });
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUseSyncOps,
    staleTime: 30_000,
  });

  if (!canUseSyncOps) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="DMS Sync Operations"
          description="Inspect sync runs and DMS staging counts"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin' }, { label: 'DMS Sync Ops' }]}
        />
        <div className="glass-panel p-12 text-center max-w-md mx-auto">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Feature not available</h3>
          <p className="text-sm text-muted-foreground">DMS Sync Operations is not enabled for your company. Contact your administrator for access.</p>
        </div>
      </div>
    );
  }

  const summary = summaryQuery.data ?? [];
  const staging = stagingQuery.data ?? [];
  const runs    = runsQuery.data ?? [];

  const totalPending = staging.reduce((s, r) => s + r.pendingRows, 0);
  const totalStaged  = staging.reduce((s, r) => s + r.totalRows, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="DMS Sync Operations"
        description="Sync runs across Proton DMS, legacy fookloi.net, Google Sheets exceptions, and manual imports."
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Admin' },
          { label: 'DMS Sync Ops' },
        ]}
      />

      {/* Credential rotation guidance */}
      <div className="glass-panel p-4 border-l-4 border-l-amber-500" data-testid="credential-rotation-card">
        <div className="flex items-start gap-3">
          <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Credential rotation & sync architecture</h3>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                <ShieldAlert className="h-3 w-3 mr-1" />Operator runbook
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Proton DMS uses per-branch admin user accounts with captcha-gated login (see Decision #7).
              Headless cron is parked until Proton issues a service / OAuth client account; until then
              data flows through manual export uploads.
            </p>
            <ul className="text-xs space-y-1 text-muted-foreground list-disc ml-4">
              <li>Branch credentials live at <code className="font-mono text-foreground bg-muted/50 px-1 rounded">/etc/flc-bi/dms.env</code> on the worker host (root-readable only, never in browser env).</li>
              <li>Rotate per-branch passwords every 90 days; reseed the env file then run <code className="font-mono text-foreground bg-muted/50 px-1 rounded">systemctl reload flc-bi-worker</code>.</li>
              <li>For a failed sync run, click <span className="font-medium text-foreground">Retry</span> in the table below to reset state to <code className="font-mono text-foreground bg-muted/50 px-1 rounded">pending</code>. The action is audit-logged.</li>
              <li>For schema or endpoint changes, file a ticket in <code className="font-mono text-foreground bg-muted/50 px-1 rounded">INGEST</code> (Linear) and link the affected sync_run id.</li>
              <li>Proton service-account request status: <span className="font-medium text-amber-600 dark:text-amber-400">pending operator follow-up</span>.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Per-source summary cards */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">By source system</h3>
        {summaryQuery.isLoading ? <TableSkeleton />
          : summaryQuery.isError ? <PageErrorState error={summaryQuery.error} />
          : summary.length === 0 ? (
            <div className="glass-panel py-10 text-center text-sm text-muted-foreground">
              No sync runs recorded yet for this company.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {summary.map(row => (
                <div key={row.sourceSystem} className="glass-panel p-4" data-testid={`sync-summary-${row.sourceSystem}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{SOURCE_LABELS[row.sourceSystem]}</p>
                    {row.lastRunStatus && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[row.lastRunStatus]}`}>
                        {row.lastRunStatus}
                      </span>
                    )}
                  </div>
                  <p className="text-xl font-semibold tabular-nums">{row.totalRuns} <span className="text-xs text-muted-foreground">runs</span></p>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400">✓ {row.succeededRuns}</span>
                    <span className="text-red-600 dark:text-red-400">✗ {row.failedRuns}</span>
                    {row.runningRuns > 0 && <span className="text-amber-600 dark:text-amber-400">↻ {row.runningRuns} running</span>}
                    {row.pendingRuns > 0 && <span className="text-blue-600 dark:text-blue-400">⏳ {row.pendingRuns} pending</span>}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Last run: {fmtDateTime(row.lastRunAt)}</p>
                  <p className="text-xs text-muted-foreground">{row.totalRecordCount.toLocaleString('en-MY')} records ingested</p>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Raw staging counts */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Staging tables</h3>
          <p className="text-xs text-muted-foreground" data-testid="staging-overview">
            {totalStaged.toLocaleString('en-MY')} total rows
            {totalPending > 0 && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                · {totalPending.toLocaleString('en-MY')} pending normalization
              </span>
            )}
          </p>
        </div>
        {stagingQuery.isLoading ? <TableSkeleton />
          : stagingQuery.isError ? <PageErrorState error={stagingQuery.error} />
          : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Staging Table</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Normalized</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Pending</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Latest Fetch</th>
                  </tr>
                </thead>
                <tbody>
                  {staging.map(row => (
                    <tr key={row.tableName} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`staging-row-${row.tableName}`}>
                      <td className="px-4 py-2.5 font-mono text-xs flex items-center gap-2">
                        <Database className="h-3.5 w-3.5 text-muted-foreground" />
                        {row.tableName}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.totalRows.toLocaleString('en-MY')}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{row.normalizedRows.toLocaleString('en-MY')}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${row.pendingRows > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                        {row.pendingRows.toLocaleString('en-MY')}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateTime(row.latestFetchedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Sync runs list */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Recent sync runs</h3>
          <div className="flex items-center gap-2 ml-auto">
            <Select value={sourceFilter} onValueChange={v => setSourceFilter(v as SyncSourceSystem | 'all')}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="dms">Proton DMS</SelectItem>
                <SelectItem value="legacy_fookloi">Legacy fookloi.net</SelectItem>
                <SelectItem value="google_sheets">Google Sheets</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as SyncRunStatus | 'all')}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScrollableRegion label="Sync runs list">
          {runsQuery.isLoading ? <TableSkeleton />
            : runsQuery.isError ? <PageErrorState error={runsQuery.error} />
            : runs.length === 0 ? (
              <div className="glass-panel py-10 text-center text-sm text-muted-foreground">
                No sync runs match the selected filters.
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Source</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Endpoint</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Records</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Started</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Duration</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map(run => {
                      const isRetryable = run.status === 'failed' || run.status === 'cancelled';
                      const isRetrying = retryingRunId === run.id;
                      return (
                      <tr key={run.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`sync-run-${run.id}`}>
                        <td className="px-4 py-2.5 text-xs">{SOURCE_LABELS[run.sourceSystem]}</td>
                        <td className="px-4 py-2.5 text-xs font-mono">{run.syncType}</td>
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground truncate max-w-xs">{run.sourceEndpoint ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[run.status]}`}>
                            {run.status === 'succeeded' && <CheckCircle2 className="h-3 w-3" />}
                            {run.status === 'failed' && <XCircle className="h-3 w-3" />}
                            {run.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                            {run.status === 'pending' && <Clock className="h-3 w-3" />}
                            {run.status}
                          </span>
                          {run.errorMessage && (
                            <p className="mt-1 text-[10px] text-red-600 dark:text-red-400 truncate max-w-xs" title={run.errorMessage}>
                              {run.errorMessage}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{run.recordCount.toLocaleString('en-MY')}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateTime(run.startedAt)}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-muted-foreground tabular-nums">{fmtDuration(run.startedAt, run.finishedAt)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {isRetryable ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={isRetrying}
                              onClick={() => void handleRetry(run.id)}
                              data-testid={`retry-${run.id}`}
                            >
                              {isRetrying
                                ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                : <RotateCw className="h-3 w-3 mr-1" />}
                              Retry
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </ScrollableRegion>
      </div>
    </div>
  );
}
