import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/DataContext';
import { Download, Loader2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { getAutoAgingFieldLabel } from '@/config/autoAgingFieldLabels';
import { getAutoAgingReport, type AutoAgingReportType } from '@/services/vehicleService';

const REPORT_PAGE_SIZE = 500;
const EXPORT_CAP = 10_000;

const REPORT_TYPES: { value: AutoAgingReportType; label: string; description: string }[] = [
  { value: 'aging_summary', label: 'Aging KPI Summary', description: 'Median, average, P90 and overdue counts per KPI' },
  { value: 'sla_compliance', label: 'SLA Compliance by Branch', description: 'Per-branch breakdown of median days and SLA overdue count for each KPI' },
  { value: 'salesman_performance', label: 'Salesman Performance', description: 'Vehicle counts, delivery count, and average BG→Delivery per salesman' },
  { value: 'vehicle_export', label: 'Full Vehicle Export', description: 'All vehicle fields including computed KPI days — filterable by branch, model, date range' },
];

function downloadAsCsv(rows: Record<string, unknown>[], fileName: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ReportCenter() {
  const { loading, availableBranches, availableModels } = useData();
  const [reportType, setReportType] = useState<AutoAgingReportType>('aging_summary');
  const [branchFilter, setBranchFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const branches = availableBranches;
  const models = availableModels;

  const noData = loading || (branches.length === 0 && models.length === 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / REPORT_PAGE_SIZE));
  const isPaginated = reportType === 'vehicle_export' || reportType === 'salesman_performance';

  const getFilters = () => ({
    branch: branchFilter !== 'all' ? branchFilter : undefined,
    model: modelFilter !== 'all' ? modelFilter : undefined,
    bgDateFrom: dateFrom || undefined,
    bgDateTo: dateTo || undefined,
  });

  const loadPage = async (p: number) => {
    setGenerating(true);
    try {
      const filters = getFilters();
      const res = await getAutoAgingReport({
        reportType,
        ...filters,
        limit: REPORT_PAGE_SIZE,
        offset: p * REPORT_PAGE_SIZE,
      });
      if (res.error) throw res.error;
      setRows(res.data.rows);
      setTotalCount(res.data.totalCount);
      setPage(p);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = () => void loadPage(0);

  const handleDownloadCsv = async () => {
    setExporting(true);
    try {
      const filters = getFilters();
      // For summary/compliance reports, a single request is fine (small result sets).
      // For vehicle export / salesman, page through up to EXPORT_CAP rows.
      const allRows: Record<string, unknown>[] = [];
      let offset = 0;
      while (offset < EXPORT_CAP) {
        const res = await getAutoAgingReport({
          reportType,
          ...filters,
          limit: Math.min(REPORT_PAGE_SIZE, EXPORT_CAP - offset),
          offset,
        });
        if (res.error) throw res.error;
        allRows.push(...res.data.rows);
        if (res.data.rows.length < REPORT_PAGE_SIZE || allRows.length >= res.data.totalCount) break;
        offset += REPORT_PAGE_SIZE;
      }
      const report = REPORT_TYPES.find(r => r.value === reportType)!;
      downloadAsCsv(allRows, report.label.replace(/\s+/g, '_'));
    } finally {
      setExporting(false);
    }
  };

  const selectedReport = REPORT_TYPES.find(r => r.value === reportType)!;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Auto Aging Reports"
        description="Generate and export vehicle-aging analytics, SLA compliance, and filtered KPI report sets."
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Auto Aging', path: '/auto-aging' }, { label: 'Aging Reports' }]}
      />

      <div className="glass-panel p-5 space-y-5">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Report Type */}
          <div className="lg:col-span-1 space-y-2">
            <label htmlFor="auto-aging-report-type" className="text-xs font-medium text-muted-foreground">Report Type</label>
            <Select value={reportType} onValueChange={v => { setReportType(v as AutoAgingReportType); setRows(null); setTotalCount(0); }}>
              <SelectTrigger id="auto-aging-report-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{selectedReport.description}</p>
          </div>

          {/* Branch Filter */}
          <div className="space-y-2">
            <label htmlFor="auto-aging-report-branch" className="text-xs font-medium text-muted-foreground">Branch</label>
            <Select value={branchFilter} onValueChange={v => { setBranchFilter(v); setRows(null); }}>
              <SelectTrigger id="auto-aging-report-branch"><SelectValue placeholder="All Branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Model Filter */}
          <div className="space-y-2">
            <label htmlFor="auto-aging-report-model" className="text-xs font-medium text-muted-foreground">Model</label>
            <Select value={modelFilter} onValueChange={v => { setModelFilter(v); setRows(null); }}>
              <SelectTrigger id="auto-aging-report-model"><SelectValue placeholder="All Models" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <label htmlFor="auto-aging-report-date-from" className="text-xs font-medium text-muted-foreground">{getAutoAgingFieldLabel('bg_date', 'BG DATE')} From</label>
            <Input id="auto-aging-report-date-from" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setRows(null); }} className="h-9 text-sm" />
          </div>
          <div className="space-y-2">
            <label htmlFor="auto-aging-report-date-to" className="text-xs font-medium text-muted-foreground">{getAutoAgingFieldLabel('bg_date', 'BG DATE')} To</label>
            <Input id="auto-aging-report-date-to" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setRows(null); }} className="h-9 text-sm" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating || noData}>
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Generate Report
          </Button>
          {rows && rows.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void handleDownloadCsv()} disabled={exporting || noData}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
              Export CSV{totalCount > 0 ? ` (${totalCount > EXPORT_CAP ? `first ${EXPORT_CAP.toLocaleString()}` : totalCount.toLocaleString()})` : ''}
            </Button>
          )}
          {noData && loading && <p className="text-xs text-muted-foreground">Loading summary data…</p>}
        </div>
      </div>

      {/* Export cap warning */}
      {rows && totalCount > EXPORT_CAP && (
        <div className="flex items-center gap-2 glass-panel p-3 border-warning/30 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
          <p className="text-xs text-warning">
            This report has {totalCount.toLocaleString()} rows. Browser CSV export is capped at {EXPORT_CAP.toLocaleString()} rows.
            Contact your admin for a full server-side export if needed.
          </p>
        </div>
      )}

      {/* Results Table */}
      {rows && rows.length > 0 && (
        <div className="glass-panel overflow-auto">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {isPaginated
                ? `${page * REPORT_PAGE_SIZE + 1}–${Math.min((page + 1) * REPORT_PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()} rows`
                : `${rows.length} row(s)`}
            </p>
            {isPaginated && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0 || generating} onClick={() => void loadPage(page - 1)}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="px-2 text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1 || generating} onClick={() => void loadPage(page + 1)}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                {Object.keys(rows[0]).map(col => (
                  <th key={col} className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="px-3 py-2 text-foreground whitespace-nowrap">{String(val)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="glass-panel p-8 text-center text-sm text-muted-foreground">
          No records found for the selected filters.
        </div>
      )}
    </div>
  );
}
