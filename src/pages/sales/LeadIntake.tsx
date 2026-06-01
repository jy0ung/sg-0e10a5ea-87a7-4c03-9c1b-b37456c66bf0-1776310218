import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getLeadsFeed } from '@/services/leadIntakeService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { ArrowRight, Calendar, MessageSquare, Target } from 'lucide-react';
import type { LeadFollowupOutcome, LeadSourceKind } from '@/types';

const OUTCOME_BADGE: Record<LeadFollowupOutcome, string> = {
  contacted:          'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  no_answer:          'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  callback_scheduled: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  not_interested:     'bg-muted text-muted-foreground',
  qualified:          'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  converted:          'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  lost:               'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-MY', { dateStyle: 'medium' });
}

function isPastDue(iso: string | null): boolean {
  if (!iso) return false;
  return iso < new Date().toISOString().slice(0, 10);
}

export default function LeadIntake() {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const canUseLeads = useFeatureFlag('phase3f.lead-intake-v2', false);

  const [kindFilter, setKindFilter] = useState<LeadSourceKind | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const feedQuery = useQuery({
    queryKey: ['leads_feed', companyId, kindFilter, statusFilter],
    queryFn: async () => {
      const r = await getLeadsFeed(companyId, {
        kind:   kindFilter === 'all' ? undefined : kindFilter,
        status: statusFilter || undefined,
      });
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUseLeads,
    staleTime: 30_000,
  });

  const rows = useMemo(() => feedQuery.data ?? [], [feedQuery.data]);

  const { pastDueCount, neverContactedCount, totalCount } = useMemo(() => ({
    pastDueCount:        rows.filter(r => isPastDue(r.nextActionDate)).length,
    neverContactedCount: rows.filter(r => r.followupCount === 0).length,
    totalCount:          rows.length,
  }), [rows]);

  if (!canUseLeads) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Lead Intake"
          description="DMS leads & prospects with local follow-up tracking"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Sales' }, { label: 'Lead Intake' }]}
        />
        <FeatureUnavailableState featureName="Lead Intake" flagName="phase3f.lead-intake-v2" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Lead Intake"
        description="DMS leads and prospects with local follow-up notes. Past-due next-actions surface first."
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Sales' },
          { label: 'Lead Intake' },
        ]}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total in feed</p>
          <p className="mt-1 text-xl font-semibold tabular-nums" data-testid="leads-total">{totalCount}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Calendar className="h-3 w-3" />Past-due actions
          </p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${pastDueCount > 0 ? 'text-red-600 dark:text-red-400' : ''}`} data-testid="leads-pastdue">{pastDueCount}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Target className="h-3 w-3" />Never contacted
          </p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${neverContactedCount > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`} data-testid="leads-never-contacted">{neverContactedCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={kindFilter} onValueChange={v => setKindFilter(v as LeadSourceKind | 'all')}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All kinds" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
          </SelectContent>
        </Select>
        <input
          type="text"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          placeholder="Filter by status…"
          className="h-9 px-3 text-sm rounded-md border border-input bg-background w-48"
          data-testid="leads-status-filter"
        />
      </div>

      {/* List */}
      <ScrollableRegion label="Leads feed">
        {feedQuery.isLoading ? <TableSkeleton />
          : feedQuery.isError ? <PageErrorState error={feedQuery.error} />
          : rows.length === 0 ? (
            <div className="glass-panel py-10 text-center text-sm text-muted-foreground">
              No leads or prospects match the current filters.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Kind</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">DMS ID</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Branch / Salesperson</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Last Follow-up</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Next Action</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const pastDue = isPastDue(row.nextActionDate);
                    return (
                      <tr key={`${row.sourceKind}-${row.sourceRawId}`}
                          className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${pastDue ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}
                          data-testid={`lead-row-${row.sourceRawId}`}>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${row.sourceKind === 'lead' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'}`}>
                            {row.sourceKind}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{row.dmsExternalId ?? '—'}</td>
                        <td className="px-4 py-2.5 text-xs">
                          <div className="font-medium">{row.branchCode ?? '—'}</div>
                          <div className="text-muted-foreground">{row.salespersonCode ?? '—'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs">{row.status ?? '—'}</td>
                        <td className="px-4 py-2.5 text-xs">
                          {row.lastFollowupAt ? (
                            <div>
                              <div>{fmtDate(row.lastFollowupAt)}</div>
                              {row.lastFollowupOutcome && (
                                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium mt-0.5 ${OUTCOME_BADGE[row.lastFollowupOutcome]}`}>
                                  {row.lastFollowupOutcome.replace(/_/g, ' ')}
                                </span>
                              )}
                              <div className="text-[10px] text-muted-foreground">{row.followupCount} total</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">Never contacted</span>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-xs ${pastDue ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                          {row.nextActionDate ? fmtDate(row.nextActionDate) + (pastDue ? ' (past due)' : '') : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => navigate(`/sales/lead-intake/${row.sourceKind}/${row.sourceRawId}`)}
                            data-testid={`lead-open-${row.sourceRawId}`}
                          >
                            <MessageSquare className="h-3 w-3 mr-1" />Open <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
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
  );
}
