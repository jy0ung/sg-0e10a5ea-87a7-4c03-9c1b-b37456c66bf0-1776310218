import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/DataContext';
import {
  generateAgingSummaryData,
  generateSlaComplianceData,
  generateSalesmanPerformanceData,
  generateVehicleExportData,
  downloadAsXlsx,
  downloadAsCsv,
} from '@/services/reportService';
import { preloadExcelJS } from '@/lib/exceljs-loader';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { getAutoAgingFieldLabel } from '@/config/autoAgingFieldLabels';

type ReportType = 'aging_summary' | 'sla_compliance' | 'salesman_performance' | 'vehicle_full';

const REPORT_TYPES: { value: ReportType; label: string; description: string }[] = [
  { value: 'aging_summary', label: 'Aging KPI Summary', description: 'Median, average, P90 and overdue counts per KPI' },
  { value: 'sla_compliance', label: 'SLA Compliance by Branch', description: 'Per-branch breakdown of median days and SLA overdue count for each KPI' },
  { value: 'salesman_performance', label: 'Salesman Performance', description: 'Vehicle counts, delivery count, and average BG→Delivery per salesman' },
  { value: 'vehicle_full', label: 'Full Vehicle Export', description: 'All vehicle fields including computed KPI days — filterable by branch, model, date range' },
];

export default function ReportCenter() {
  const { vehicles, kpiSummaries, slas, loading } = useData();
  const [reportType, setReportType] = useState<ReportType>('aging_summary');
  const [branchFilter, setBranchFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [exporting, setExporting] = useState(false);

  const branches = [...new Set(vehicles.map(v => v.branch_code).filter((b): b is string => !!b))].sort();
  const models = [...new Set(vehicles.map(v => v.model).filter((m): m is string => !!m))].sort();

  const clearPreview = () => setPreview(null);

  const noData = loading || vehicles.length === 0;

  const getOptions = () => ({
    branchFilter: branchFilter !== 'all' ? branchFilter : undefined,
    modelFilter: modelFilter !== 'all' ? modelFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const generateData = (): Record<string, unknown>[] => {
    const opts = getOptions();
    switch (reportType) {
      case 'aging_summary': return generateAgingSummaryData(vehicles, kpiSummaries, opts);
      case 'sla_compliance': return generateSlaComplianceData(vehicles, slas, opts);
      case 'salesman_performance': return generateSalesmanPerformanceData(vehicles, opts);
      case 'vehicle_full': return generateVehicleExportData(vehicles, opts);
    }
  };

  const handlePreview = () => setPreview(generateData().slice(0, 10));

  const handleDownloadXlsx = async () => {
    setExporting(true);
    try {
      const data = generateData();
      const report = REPORT_TYPES.find(r => r.value === reportType)!;
      await downloadAsXlsx(data, report.label.replace(/\s+/g, '_'), report.label);
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadCsv = async () => {
    setExporting(true);
    try {
      const data = generateData();
      const report = REPORT_TYPES.find(r => r.value === reportType)!;
      downloadAsCsv(data, report.label.replace(/\s+/g, '_'));
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
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Aging Reports' }]}
      />

      <div className="glass-panel p-5 space-y-5">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Report Type */}
          <div className="lg:col-span-1 space-y-2">
            <label htmlFor="auto-aging-report-type" className="text-xs font-medium text-muted-foreground">Report Type</label>
            <Select value={reportType} onValueChange={v => { setReportType(v as ReportType); setPreview(null); }}>
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
            <Select value={branchFilter} onValueChange={v => { setBranchFilter(v); clearPreview(); }}>
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
            <Select value={modelFilter} onValueChange={v => { setModelFilter(v); clearPreview(); }}>
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
            <Input id="auto-aging-report-date-from" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); clearPreview(); }} className="h-9 text-sm" />
          </div>
          <div className="space-y-2">
            <label htmlFor="auto-aging-report-date-to" className="text-xs font-medium text-muted-foreground">{getAutoAgingFieldLabel('bg_date', 'BG DATE')} To</label>
            <Input id="auto-aging-report-date-to" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); clearPreview(); }} className="h-9 text-sm" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={handlePreview} disabled={noData}>
            Preview (first 10 rows)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadXlsx}
            onPointerEnter={preloadExcelJS}
            onFocus={preloadExcelJS}
            disabled={exporting || noData}
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />}
            Export XLSX
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadCsv} disabled={exporting || noData}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
            Export CSV
          </Button>
          {noData && loading && <p className="text-xs text-muted-foreground">Loading vehicle data…</p>}
        </div>
      </div>

      {/* Preview Table */}
      {preview && preview.length > 0 && (
        <div className="glass-panel overflow-auto">
          <div className="p-3 border-b border-border">
            <p className="text-xs text-muted-foreground">Preview — first {preview.length} rows</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left">
                {Object.keys(preview[0]).map(col => (
                  <th key={col} className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
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
    </div>
  );
}
