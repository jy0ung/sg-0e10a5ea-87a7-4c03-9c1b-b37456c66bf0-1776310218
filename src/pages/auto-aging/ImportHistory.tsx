import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useData } from '@/contexts/DataContext';

export default function ImportHistory() {
  const navigate = useNavigate();
  const { importBatches } = useData();

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Import History"
        description="Track all data import operations"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Import History' }]}
      />

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">File</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Uploaded By</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Date</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Status</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Rows</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Valid</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Errors</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Published</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Queued</th>
            </tr>
          </thead>
          <tbody>
            {importBatches.map(b => {
              const hasQueuedRows = (b.reviewRows ?? 0) > 0;

              return (
              <tr
                key={b.id}
                className={`data-table-row ${hasQueuedRows ? 'cursor-pointer' : ''}`}
                onClick={hasQueuedRows ? () => navigate(`/auto-aging/review/${b.id}`) : undefined}
              >
                <td className="px-4 py-3 text-primary text-xs font-medium">{b.fileName}</td>
                <td className="px-4 py-3 text-foreground">{b.uploadedBy}</td>
                <td className="px-4 py-3 text-foreground text-xs">{new Date(b.uploadedAt).toLocaleString()}</td>
                <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                <td className="px-4 py-3 text-foreground tabular-nums">{b.totalRows}</td>
                <td className="px-4 py-3 text-success tabular-nums">{b.validRows}</td>
                <td className="px-4 py-3 text-destructive tabular-nums">{b.errorRows}</td>
                <td className="px-4 py-3 text-success tabular-nums">{b.publishedRows ?? 0}</td>
                <td className="px-4 py-3 text-amber-500 tabular-nums">{b.reviewRows ?? 0}</td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  );
}
