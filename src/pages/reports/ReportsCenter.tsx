import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyId } from '@/hooks/useCompanyId';
import { Download, FileText, RefreshCw } from 'lucide-react';

interface ReportRow {
  [key: string]: string | number | null | undefined;
}

interface ReportConfig {
  id: string;
  label: string;
  description: string;
  columns: { key: string; label: string; numeric?: boolean }[];
  query: (companyId: string, from: string, to: string) => Promise<ReportRow[]>;
}

async function queryTable(table: string, companyId: string, from: string, to: string, dateCol: string, select = '*'): Promise<ReportRow[]> {
  let q = supabase.from(table as 'vehicles').select(select).eq('company_id', companyId);
  if (from) q = q.gte(dateCol, from);
  if (to) q = q.lte(dateCol, to);
  const { data } = await q.order(dateCol, { ascending: false }).limit(500);
  return (data ?? []) as ReportRow[];
}

const REPORTS: ReportConfig[] = [
  {
    id: 'stock',
    label: 'Stock Balance',
    description: 'Current vehicle stock balance by model and branch',
    columns: [
      { key: 'chassis_no', label: 'Chassis No' },
      { key: 'model', label: 'Model' },
      { key: 'colour', label: 'Colour' },
      { key: 'branch_id', label: 'Branch' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Date In' },
    ],
    query: async (companyId) => {
      const { data } = await supabase.from('vehicles').select('chassis_no,model,colour,branch_id,status,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500);
      return (data ?? []) as ReportRow[];
    },
  },
  {
    id: 'register',
    label: 'Vehicle Register',
    description: 'Full vehicle registration log with plate numbers',
    columns: [
      { key: 'chassis_no', label: 'Chassis No' },
      { key: 'plate_no', label: 'Plate No' },
      { key: 'model', label: 'Model' },
      { key: 'engine_no', label: 'Engine No' },
      { key: 'colour', label: 'Colour' },
      { key: 'status', label: 'Status' },
    ],
    query: async (companyId) => {
      const { data } = await supabase.from('vehicles').select('chassis_no,plate_no,model,engine_no,colour,status').eq('company_id', companyId).order('chassis_no').limit(500);
      return (data ?? []) as ReportRow[];
    },
  },
  {
    id: 'booking',
    label: 'Collection Booking',
    description: 'Sales order booking report within date range',
    columns: [
      { key: 'order_no', label: 'Order No' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'model', label: 'Model' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Booking Date' },
      { key: 'total_price', label: 'Price (RM)', numeric: true },
    ],
    query: (companyId, from, to) => queryTable('sales_orders', companyId, from, to, 'created_at', 'order_no,customer_name,model,status,created_at,total_price'),
  },
  {
    id: 'disbursement',
    label: 'Loan Disbursement',
    description: 'Loan disbursement report from financed orders',
    columns: [
      { key: 'order_no', label: 'Order No' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'finance_company', label: 'Finance Co.' },
      { key: 'loan_amount', label: 'Loan Amount (RM)', numeric: true },
      { key: 'disbursement_date', label: 'Disbursement Date' },
      { key: 'status', label: 'Status' },
    ],
    query: (companyId, from, to) => queryTable('sales_orders', companyId, from, to, 'created_at', 'order_no,customer_name,finance_company,loan_amount,disbursement_date,status'),
  },
  {
    id: 'purchase',
    label: 'Purchase Report',
    description: 'Vehicle purchase invoices from suppliers',
    columns: [
      { key: 'invoice_no', label: 'Invoice No' },
      { key: 'supplier_name', label: 'Supplier' },
      { key: 'model', label: 'Model' },
      { key: 'chassis_no', label: 'Chassis No' },
      { key: 'purchase_price', label: 'Price (RM)', numeric: true },
      { key: 'invoice_date', label: 'Invoice Date' },
    ],
    query: (companyId, from, to) => queryTable('purchase_invoices', companyId, from, to, 'invoice_date', 'invoice_no,supplier_name,model,chassis_no,purchase_price,invoice_date'),
  },
  {
    id: 'transfer',
    label: 'Vehicle Transfer',
    description: 'Inter-branch vehicle transfer history',
    columns: [
      { key: 'chassis_no', label: 'Chassis No' },
      { key: 'from_branch', label: 'From Branch' },
      { key: 'to_branch', label: 'To Branch' },
      { key: 'transfer_date', label: 'Transfer Date' },
      { key: 'transferred_by', label: 'Transferred By' },
      { key: 'status', label: 'Status' },
    ],
    query: (companyId, from, to) => queryTable('vehicle_transfers', companyId, from, to, 'transfer_date', 'chassis_no,from_branch,to_branch,transfer_date,transferred_by,status'),
  },
  {
    id: 'invoice',
    label: 'Sales Invoice',
    description: 'Sales invoices issued within date range',
    columns: [
      { key: 'invoice_no', label: 'Invoice No' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'model', label: 'Model' },
      { key: 'chassis_no', label: 'Chassis No' },
      { key: 'invoice_amount', label: 'Amount (RM)', numeric: true },
      { key: 'invoice_date', label: 'Invoice Date' },
    ],
    query: (companyId, from, to) => queryTable('sales_invoices', companyId, from, to, 'invoice_date', 'invoice_no,customer_name,model,chassis_no,invoice_amount,invoice_date'),
  },
];

function ReportTab({ config, companyId }: { config: ReportConfig; companyId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const data = await config.query(companyId, from, to);
      setRows(data);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const header = config.columns.map(c => c.label).join(',');
    const body = rows.map(r => config.columns.map(c => {
      const v = r[c.key];
      return v == null ? '' : String(v).includes(',') ? `"${v}"` : v;
    }).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${config.id}-report.csv`; a.click();
    URL.revokeObjectURL(url);
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
            {generated && rows.length > 0 && (
              <Button variant="outline" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-2" />Export CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {generated && (
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
            {rows.length > 0 && (
              <tfoot className="bg-muted/50">
                <tr>
                  <td className="px-4 py-2 text-xs text-muted-foreground" colSpan={config.columns.length}>
                    {rows.length} record{rows.length !== 1 ? 's' : ''} found
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

export default function ReportsCenter() {
  const { user } = useAuth();
  const companyId = useCompanyId();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports Centre"
        description="Generate and export operational reports"
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
