import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useData } from '@/contexts/DataContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';

const PAGE_SIZE = 25;

export default function DataQuality() {
  const { qualityIssues, loading } = useData();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const needle = search.toLowerCase();
  const filtered = needle
    ? qualityIssues.filter(
        i =>
          i.chassisNo.toLowerCase().includes(needle) ||
          i.field.toLowerCase().includes(needle) ||
          i.message.toLowerCase().includes(needle),
      )
    : qualityIssues;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const byType = qualityIssues.reduce((acc, i) => {
    acc[i.issueType] = (acc[i.issueType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading && qualityIssues.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Data Quality"
        description={`${qualityIssues.length} issues detected across all imports`}
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Data Quality' }]}
      />

      {/* Summary tiles — auto-fit so they never leave blank columns */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {Object.entries(byType).map(([type, count]) => (
          <div key={type} className="kpi-card text-center">
            <StatusBadge status={type} />
            <p className="text-2xl font-bold text-foreground mt-2">{count}</p>
          </div>
        ))}
      </div>

      {qualityIssues.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center gap-3 py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <p className="text-sm font-medium text-foreground">All Clear</p>
          <p className="text-xs text-muted-foreground">No data quality issues found in the latest import.</p>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          {/* Search + pager header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <Input
              placeholder="Search chassis, field or message…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="h-8 w-64 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {filtered.length} issue{filtered.length !== 1 ? 's' : ''}
              {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ''}
            </p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Chassis No.</th>
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Field</th>
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Issue</th>
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Type</th>
                <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Severity</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(issue => (
                <tr key={issue.id} className="data-table-row">
                  <td className="px-4 py-3 font-mono text-xs text-primary">{issue.chassisNo}</td>
                  <td className="px-4 py-3 text-foreground">{issue.field}</td>
                  <td className="px-4 py-3 text-foreground">{issue.message}</td>
                  <td className="px-4 py-3"><StatusBadge status={issue.issueType} /></td>
                  <td className="px-4 py-3"><StatusBadge status={issue.severity} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-border">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
              <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
