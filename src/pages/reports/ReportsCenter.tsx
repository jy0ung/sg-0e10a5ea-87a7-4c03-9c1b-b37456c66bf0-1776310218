import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompanyId } from '@/hooks/useCompanyId';
import { Download, FileText, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { REPORT_PAGE_SIZE, type ReportConfig, type ReportRow, REPORTS } from '@/services/reportService';

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

  const exportCSV = async () => {
    setExporting(true);
    try {
      const all = await config.fetchAll(companyId, from, to);
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{config.description}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Date From</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date To</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
            </div>
            <Button onClick={generate} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Generating…' : 'Generate'}
            </Button>
            {generated && totalCount > 0 && (
              <Button variant="outline" onClick={exportCSV} disabled={exporting}>
                <Download className="h-4 w-4 mr-2" />
                {exporting ? 'Exporting…' : `Export CSV (${totalCount.toLocaleString()})`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {generated && (
        <>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {config.columns.map(c => (
                    <th key={c.key} className={`px-4 py-3 font-medium whitespace-nowrap ${c.numeric ? 'text-right' : 'text-left'}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={config.columns.length} className="px-4 py-8 text-center text-muted-foreground">No records found for the selected period.</td></tr>
                ) : rows.map((row, i) => (
                  <tr key={i} className="border-t hover:bg-muted/30 transition-colors">
                    {config.columns.map(c => (
                      <td key={c.key} className={`px-4 py-3 ${c.numeric ? 'text-right tabular-nums' : ''}`}>
                        {row[c.key] == null ? '—' : c.numeric ? Number(row[c.key]).toLocaleString('en-MY', { minimumFractionDigits: 2 }) : String(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination bar */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {totalCount === 0
                ? 'No records'
                : `${page * REPORT_PAGE_SIZE + 1}–${Math.min((page + 1) * REPORT_PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()} records`}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0 || loading} onClick={() => loadPage(page - 1)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="px-2">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1 || loading} onClick={() => loadPage(page + 1)}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReportsCenter() {
  const companyId = useCompanyId();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Reports"
        description="Generate and export cross-module operational reports for inventory, sales, purchasing, and transfers."
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Business Reports' }]}
        icon={<FileText className="h-6 w-6" />}
      />
      <Tabs defaultValue="stock">
        <TabsList className="flex-wrap h-auto gap-1">
          {REPORTS.map(r => (
            <TabsTrigger key={r.id} value={r.id}>{r.label}</TabsTrigger>
          ))}
        </TabsList>
        {REPORTS.map(r => (
          <TabsContent key={r.id} value={r.id} className="mt-4">
            <ReportTab config={r} companyId={companyId} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
