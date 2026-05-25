import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getReconciliationMatchDetail, decideReconciliationMatch } from '@/services/reconciliationService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, EyeOff, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { ReconciliationDecision } from '@/types';

function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface PayloadField { key: string; sourceValue: unknown; canonicalValue: unknown; matches: boolean; }

function diffPayloads(source: Record<string, unknown>, canonical: Record<string, unknown>): PayloadField[] {
  // Skip metadata fields that always differ between staging and canonical
  const SKIP = new Set(['id', 'company_id', 'created_at', 'updated_at', 'raw_payload', 'normalized_payload', 'payload_hash', 'fetched_at', 'sync_run_id']);
  const allKeys = new Set([...Object.keys(source), ...Object.keys(canonical)]);
  const fields: PayloadField[] = [];
  for (const key of Array.from(allKeys).sort()) {
    if (SKIP.has(key)) continue;
    const s = source[key];
    const c = canonical[key];
    // Treat undefined and null as equivalent for diff
    const sNorm = s == null ? null : s;
    const cNorm = c == null ? null : c;
    const matches = JSON.stringify(sNorm) === JSON.stringify(cNorm);
    fields.push({ key, sourceValue: s, canonicalValue: c, matches });
  }
  return fields;
}

export default function ReconciliationDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { matchId = '' } = useParams<{ matchId: string }>();
  const companyId = useCompanyId();
  const canUseReconciliation = useFeatureFlag('phase3d.reconciliation-review-v2', false);

  const [decidingAs, setDecidingAs] = useState<ReconciliationDecision | null>(null);
  const [notes, setNotes] = useState('');

  const detailQuery = useQuery({
    queryKey: ['reconciliation_match', companyId, matchId],
    queryFn: async () => {
      const r = await getReconciliationMatchDetail(companyId, matchId);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && !!matchId && canUseReconciliation,
    staleTime: 10_000,
  });

  const match = detailQuery.data;
  const diff = useMemo(() => match ? diffPayloads(match.sourcePayload, match.canonicalPayload) : [], [match]);
  const diffCount = diff.filter(f => !f.matches).length;

  async function handleDecide(decision: ReconciliationDecision) {
    setDecidingAs(decision);
    const result = await decideReconciliationMatch(companyId, matchId, decision, notes || undefined);
    setDecidingAs(null);
    if (result.error) {
      toast.error('Decision failed', { description: result.error.message });
      return;
    }
    toast.success(`Match ${decision}`, { description: `Recorded with audit trail.` });
    void queryClient.invalidateQueries({ queryKey: ['reconciliation_match', companyId, matchId] });
    void queryClient.invalidateQueries({ queryKey: ['reconciliation_queue', companyId] });
    void queryClient.invalidateQueries({ queryKey: ['reconciliation_counts', companyId] });
  }

  if (!canUseReconciliation) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Reconciliation Match"
          description="Side-by-side source vs canonical evidence"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin' }, { label: 'Reconciliation' }, { label: 'Match' }]}
        />
        <div className="glass-panel p-12 text-center max-w-md mx-auto">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Feature not available</h3>
          <p className="text-sm text-muted-foreground">Reconciliation Review is not enabled for your company.</p>
        </div>
      </div>
    );
  }

  if (detailQuery.isLoading) return <TableSkeleton />;
  if (detailQuery.isError)   return <PageErrorState error={detailQuery.error} />;
  if (!match) return (
    <div className="glass-panel py-16 text-center text-sm text-muted-foreground">
      Match not found.
    </div>
  );

  const isTerminal = !['candidate', 'auto_matched', 'conflict'].includes(match.matchStatus);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`Reconciliation: ${match.objectType.replace(/_/g, ' ')}`}
        description={`${match.sourceSystem.toUpperCase()} ${match.sourceTable} → ${match.canonicalTable ?? 'unlinked'} · ${match.matchRule ?? 'no rule'}`}
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Admin' },
          { label: 'Reconciliation Queue', path: '/admin/reconciliation' },
          { label: 'Match' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/reconciliation')}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to queue
          </Button>
        }
      />

      {/* Status + metadata */}
      <div className="glass-panel p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
          <p className="mt-1 text-sm font-semibold">{match.matchStatus}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Confidence</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {match.confidenceScore == null ? '—' : `${(match.confidenceScore * 100).toFixed(1)}%`}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Priority</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{match.sourcePriority}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Differing Fields</p>
          <p className={`mt-1 text-sm font-semibold tabular-nums ${diffCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`} data-testid="diff-count">
            {diffCount} / {diff.length}
          </p>
        </div>
      </div>

      {/* Side-by-side diff */}
      <ScrollableRegion label="Source vs canonical evidence">
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/4">Field</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Source ({match.sourceSystem})</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Canonical ({match.canonicalTable ?? 'unlinked'})</th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground w-16">Match</th>
              </tr>
            </thead>
            <tbody>
              {diff.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">No comparable fields between source and canonical.</td></tr>
              ) : diff.map(field => (
                <tr key={field.key} className={`border-b last:border-0 ${!field.matches ? 'bg-amber-50/30 dark:bg-amber-900/5' : ''}`} data-testid={`diff-field-${field.key}`}>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{field.key}</td>
                  <td className="px-4 py-2 text-xs font-mono break-all">{formatValue(field.sourceValue)}</td>
                  <td className="px-4 py-2 text-xs font-mono break-all">{formatValue(field.canonicalValue)}</td>
                  <td className="px-4 py-2 text-center">
                    {field.matches
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                      : <XCircle className="h-3.5 w-3.5 text-amber-500 inline" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollableRegion>

      {/* Decision form */}
      {!isTerminal ? (
        <div className="glass-panel p-4 space-y-3">
          <h3 className="text-sm font-semibold">Decision</h3>
          <Textarea
            placeholder="Optional reviewer notes (recorded in audit trail)…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="text-sm"
            rows={3}
            data-testid="decision-notes"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/10"
              disabled={decidingAs !== null}
              onClick={() => void handleDecide('accepted')}
              data-testid="decide-accept"
            >
              {decidingAs === 'accepted'
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              Accept match
            </Button>
            <Button
              variant="outline"
              className="text-amber-600 border-amber-500/40 hover:bg-amber-500/10"
              disabled={decidingAs !== null}
              onClick={() => void handleDecide('rejected')}
              data-testid="decide-reject"
            >
              {decidingAs === 'rejected'
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <XCircle className="h-3.5 w-3.5 mr-1" />}
              Reject
            </Button>
            <Button
              variant="outline"
              className="text-muted-foreground"
              disabled={decidingAs !== null}
              onClick={() => void handleDecide('ignored')}
              data-testid="decide-ignore"
            >
              {decidingAs === 'ignored'
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <EyeOff className="h-3.5 w-3.5 mr-1" />}
              Ignore
            </Button>
          </div>
        </div>
      ) : (
        <div className="glass-panel p-4 text-sm">
          <p className="text-muted-foreground">
            This match is in terminal state <span className="font-semibold text-foreground">{match.matchStatus}</span> and cannot be re-decided.
            {match.reviewNotes && (
              <span className="block mt-2 text-xs">
                <span className="text-muted-foreground">Notes: </span>
                <span className="text-foreground">{match.reviewNotes}</span>
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
