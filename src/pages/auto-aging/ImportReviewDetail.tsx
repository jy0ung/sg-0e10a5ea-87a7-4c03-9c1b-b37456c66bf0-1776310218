import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useData } from '@/contexts/DataContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useAuth } from '@/contexts/AuthContext';
import { getImportReviewRows, reviewRow } from '@/services/importReviewService';
import type { ImportReviewRow } from '@/types';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ImportReviewDetail() {
  const navigate = useNavigate();
  const { batchId = '' } = useParams<{ batchId: string }>();
  const companyId = useCompanyId();
  const { importBatches } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<ImportReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const batch = useMemo(() => importBatches.find((candidate) => candidate.id === batchId) ?? null, [batchId, importBatches]);

  async function loadRows() {
    if (!batchId || !companyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await getImportReviewRows(batchId, companyId);
    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!batchId || !companyId) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const data = await getImportReviewRows(batchId, companyId);
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [batchId, companyId]);

  async function handleReview(row: ImportReviewRow, status: 'resolved' | 'discarded') {
    setReviewingId(row.id);
    const result = await reviewRow(row.id, status, { reviewedBy: user?.id });
    setReviewingId(null);

    if (result.error) {
      toast({ title: 'Action failed', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: status === 'resolved' ? 'Row accepted' : 'Row discarded' });
      void loadRows();
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={batch ? `Review ${batch.fileName}` : 'Review Batch'}
        description={batch
          ? `${batch.reviewRows ?? rows.length} queued row${(batch.reviewRows ?? rows.length) !== 1 ? 's' : ''} waiting for review`
          : 'Inspect queued import rows and their validation issues'}
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Review Queue' }, { label: batch?.fileName ?? 'Batch' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/auto-aging/review')}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to Queue
          </Button>
        }
      />

      {loading ? (
        <div className="glass-panel p-12 text-center">
          <Loader2 className="h-10 w-10 text-primary mx-auto mb-4 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading queued rows…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No queued rows found</h3>
          <p className="text-sm text-muted-foreground mb-6">This batch has no review rows available in the current environment.</p>
          <Button variant="outline" onClick={() => navigate('/auto-aging/history')}>Go to Import History</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="glass-panel p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{rows.length}</p>
              <p className="text-xs text-muted-foreground">Queued Rows</p>
            </div>
            <div className="glass-panel p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{rows.filter((row) => row.reviewReason === 'incomplete').length}</p>
              <p className="text-xs text-muted-foreground">Incomplete</p>
            </div>
            <div className="glass-panel p-4 text-center">
              <p className="text-2xl font-bold text-destructive">{rows.filter((row) => row.reviewReason !== 'incomplete').length}</p>
              <p className="text-xs text-muted-foreground">Blocking or Mixed</p>
            </div>
          </div>

          <div className="glass-panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-left">
                  <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Row</th>
                  <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Chassis</th>
                  <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Reason</th>
                  <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Status</th>
                  <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Issues</th>
                  <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="align-top data-table-row">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.rowNumber}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{row.chassisNo || 'Missing chassis number'}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.reviewReason} /></td>
                    <td className="px-4 py-3"><StatusBadge status={row.reviewStatus} /></td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {row.validationErrors.length > 0 ? row.validationErrors.map((issue, index) => (
                          <div key={`${row.id}-${index}`} className="rounded bg-secondary/40 px-2 py-1 text-xs text-foreground">
                            {issue.message}
                          </div>
                        )) : (
                          <span className="text-xs text-muted-foreground">No validation issues stored</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(row.reviewStatus === 'pending' || row.reviewStatus === 'in_review') ? (
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-success border-success/40 hover:bg-success/10"
                            disabled={reviewingId === row.id}
                            onClick={() => void handleReview(row, 'resolved')}
                          >
                            {reviewingId === row.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            }
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/40 hover:bg-destructive/10"
                            disabled={reviewingId === row.id}
                            onClick={() => void handleReview(row, 'discarded')}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />Discard
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground capitalize">{row.reviewStatus}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}