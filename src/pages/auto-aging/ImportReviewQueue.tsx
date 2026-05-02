import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';
import { Clock, Eye } from 'lucide-react';

export default function ImportReviewQueue() {
  const navigate = useNavigate();
  const { importBatches } = useData();

  const queuedBatches = importBatches.filter(batch => (batch.reviewRows ?? 0) > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Review Queue"
        description="Review rows held back from Auto Aging imports before they are published into vehicles"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Review Queue' }]}
      />

      {queuedBatches.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No review work queued</h3>
          <p className="text-sm text-muted-foreground mb-6">Batches with held-back rows will appear here after import.</p>
          <Button variant="outline" onClick={() => navigate('/auto-aging/import')}>Go to Import Center</Button>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium">File</th>
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Status</th>
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Queued</th>
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Published</th>
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Uploaded</th>
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {queuedBatches.map((batch) => (
                <tr key={batch.id} className="data-table-row">
                  <td className="px-4 py-3 text-primary text-xs font-medium">{batch.fileName}</td>
                  <td className="px-4 py-3"><StatusBadge status={batch.status} /></td>
                  <td className="px-4 py-3 text-amber-500 tabular-nums">{batch.reviewRows ?? 0}</td>
                  <td className="px-4 py-3 text-success tabular-nums">{batch.publishedRows ?? 0}</td>
                  <td className="px-4 py-3 text-foreground text-xs">{new Date(batch.uploadedAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/auto-aging/review/${batch.id}`)}>
                      <Eye className="h-3.5 w-3.5 mr-1" />Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}