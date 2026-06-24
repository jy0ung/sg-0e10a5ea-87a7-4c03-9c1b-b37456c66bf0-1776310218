import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompanyId } from '@/hooks/useCompanyId';
import { Download, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, FileDown } from 'lucide-react';
import { exportReportPdf } from '@/lib/pdfExport';
import { REPORT_PAGE_SIZE, REPORT_EXPORT_CAP, type ReportConfig, type ReportRow, REPORTS } from '@flc/platform-services';

function ReportTab({ config, companyId }: { config: ReportConfig; companyId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generated, setGenerated] = useState(false);

  const totalPages = Math.ceil(totalCount / REPORT_PAGE_SIZE) || 1;

  const loadPage = async (p: number) => {
    setLoading(true);
    try {
      const { data, count } = await config.query(companyId, from, to, p);
      setRows(data);
      setTotalCount(count);
      setPage(p);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  };

  const generate = () => loadPage(0);

  const [exportCapped, setExportCapped] = useState(false);

  const exportCSV = async () => {
    setExporting(true);
    setExportCapped(false);
    try {
      const result = await config.fetchAll(companyId, from, to);
      const all = result.rows;
      if (result.totalCount > REPORT_EXPORT_CAP) setExportCapped(true);
      const header = config.columns.map(c => c.label).join(',');
      const body = all.map(r => config.columns.map(c => {
        const v = r[c.key];
        return v == null ? '' : String(v).includes(',') ? `"${v}"` : v;
      }).join(',')).join('\n');
      const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${config.id}-report.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const exportPDF = async () => {
    setExporting(true);
    try {
      const result = await config.fetchAll(companyId, from, to);
      exportReportPdf({
        title: config.label,
        subtitle: config.description + (from && to ? ` (${from} to ${to})` : ''),
        columns: config.columns,
        rows: result.rows,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Card className="shrink-0 shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold">{config.description}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date From</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-40" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date To</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-40" />
            </div>
            <Button size="sm" onClick={generate} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Generating…' : 'Generate'}
            </Button>
            {generated && totalCount > 0 && (
              <>
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={exporting}>
                <Download className="h-3.5 w-3.5 mr-1" />
                {exporting ? 'Exporting…' : `Export CSV (${totalCount.toLocaleString()})`}
              </Button>
              <Button variant="outline" size="sm" onClick={exportPDF} disabled={exporting}>
                <FileDown className="h-3.5 w-3.5 mr-1" />
                {exporting ? 'Exporting…' : 'Export PDF'}
              </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {generated && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/90 text-muted-foreground backdrop-blur">
                <tr>
                  {config.columns.map(c => (
                    <th key={c.key} className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap ${c.numeric ? 'text-right' : 'text-left'}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={config.columns.length} className="px-4 py-8 text-center text-muted-foreground">No records found for the selected period.</td></tr>
                ) : rows.map((row, i) => (
                  <tr key={i} className="border-t hover:bg-muted/30 transition-colors">
                    {config.columns.map(c => (
                      <td key={c.key} className={`whitespace-nowrap px-3 py-2.5 ${c.numeric ? 'text-right tabular-nums' : ''}`} title={row[c.key] == null ? '' : String(row[c.key])}>
                        {row[c.key] == null ? '—' : c.numeric ? Number(row[c.key]).toLocaleString('en-MY', { minimumFractionDigits: 2 }) : String(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-card px-3 py-2 text-xs text-muted-foreground">
            <span>
              {totalCount === 0
                ? 'No records'
                : `${page * REPORT_PAGE_SIZE + 1}–${Math.min((page + 1) * REPORT_PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()} records`}
            </span>
            <div className="flex items-center gap-1">
              <Button aria-label="Previous report page" variant="outline" size="icon" className="h-7 w-7" disabled={page === 0 || loading} onClick={() => loadPage(page - 1)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="px-2">Page {page + 1} of {totalPages}</span>
              <Button aria-label="Next report page" variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1 || loading} onClick={() => loadPage(page + 1)}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {exportCapped && (
          <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
            <p className="text-xs text-warning">Export was capped at {REPORT_EXPORT_CAP.toLocaleString()} rows. Total records: {totalCount.toLocaleString()}.</p>
          </div>
        )}
        </div>
      )}
    </div>
  );
}

export default function ReportsCenter() {
  const companyId = useCompanyId();

  return (
    <div className="flex h-full min-h-0 w-full flex-col animate-fade-in">
      <PageHeader
        title="Business Reports"
        description="Generate and export cross-module operational reports for inventory, sales, purchasing, and transfers."
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Business Reports' }]}
      />
      <Tabs defaultValue="stock" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-auto shrink-0 flex-wrap gap-1 rounded-lg border bg-card p-1 shadow-sm">
          {REPORTS.map(r => (
            <TabsTrigger key={r.id} value={r.id}>{r.label}</TabsTrigger>
          ))}
        </TabsList>
        {REPORTS.map(r => (
          <TabsContent key={r.id} value={r.id} className="mt-3 min-h-0 flex-1">
            <ReportTab config={r} companyId={companyId} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
