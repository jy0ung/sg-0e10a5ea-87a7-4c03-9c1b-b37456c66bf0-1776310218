import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useSales } from '@/contexts/SalesContext';
import { Invoice } from '@/types';
import { AlertTriangle, Clock, DollarSign } from 'lucide-react';

type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

function agingBucket(dueDate: string | undefined): AgingBucket {
  if (!dueDate) return '90+';
  const days = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000);
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

const BUCKET_STYLE: Record<AgingBucket, string> = {
  '0-30': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  '31-60': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  '61-90': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  '90+': 'bg-red-200 text-red-900 dark:bg-red-800/50 dark:text-red-200',
};

export default function OutstandingCollection() {
  const { user } = useAuth();
  const { invoices, reloadSales } = useSales();

  const [bucketFilter, setBucketFilter] = useState<'all' | AgingBucket>('all');

  useEffect(() => { reloadSales(); }, [reloadSales]);

  // Only unpaid / partial
  const outstanding: (Invoice & { bucket: AgingBucket; owedAmount: number })[] = useMemo(() => {
    return invoices
      .filter(i => i.paymentStatus === 'unpaid' || i.paymentStatus === 'partial')
      .map(i => ({
        ...i,
        bucket: agingBucket(i.dueDate),
        owedAmount: i.totalAmount - (i.paidAmount ?? 0),
      }))
      .filter(i => bucketFilter === 'all' || i.bucket === bucketFilter)
      .sort((a, b) => b.owedAmount - a.owedAmount);
  }, [invoices, bucketFilter]);

  const bucketTotals = useMemo(() => {
    const all = invoices.filter(i => i.paymentStatus === 'unpaid' || i.paymentStatus === 'partial');
    const sum = (b: AgingBucket) => all.filter(i => agingBucket(i.dueDate) === b).reduce((s, i) => s + i.totalAmount - (i.paidAmount ?? 0), 0);
    return { '0-30': sum('0-30'), '31-60': sum('31-60'), '61-90': sum('61-90'), '90+': sum('90+') };
  }, [invoices]);

  const totalOutstanding = Object.values(bucketTotals).reduce((s, v) => s + v, 0);

  const kpis = [
    { label: 'Total Outstanding', value: `RM ${totalOutstanding.toLocaleString()}`, icon: DollarSign, color: 'text-red-500' },
    { label: '0–30 Days', value: `RM ${bucketTotals['0-30'].toLocaleString()}`, icon: Clock, color: 'text-yellow-500' },
    { label: '31–60 Days', value: `RM ${bucketTotals['31-60'].toLocaleString()}`, icon: Clock, color: 'text-orange-500' },
    { label: '90+ Days (Critical)', value: `RM ${bucketTotals['90+'].toLocaleString()}`, icon: AlertTriangle, color: 'text-red-600' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Outstanding Collection"
        description="Unpaid and partially paid invoices by aging bucket"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Sales' }, { label: 'Outstanding Collection' }]}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="glass-panel p-4 flex items-start gap-3">
            <k.icon className={`h-5 w-5 mt-0.5 ${k.color}`} />
            <div>
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Aging bucket visual bars */}
      <div className="glass-panel p-4 space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Aging Breakdown</h3>
        {(['0-30','31-60','61-90','90+'] as AgingBucket[]).map(b => {
          const pct = totalOutstanding > 0 ? (bucketTotals[b] / totalOutstanding) * 100 : 0;
          return (
            <div key={b} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-medium">{b} days</span>
                <span className="text-muted-foreground">RM {bucketTotals[b].toLocaleString()} ({pct.toFixed(1)}%)</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${b === '0-30' ? 'bg-yellow-400' : b === '31-60' ? 'bg-orange-400' : b === '61-90' ? 'bg-red-400' : 'bg-red-600'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <div>
        <Select value={bucketFilter} onValueChange={v => setBucketFilter(v as typeof bucketFilter)}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All Aging" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Aging</SelectItem>
            <SelectItem value="0-30">0–30 Days</SelectItem>
            <SelectItem value="31-60">31–60 Days</SelectItem>
            <SelectItem value="61-90">61–90 Days</SelectItem>
            <SelectItem value="90+">90+ Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="glass-panel overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {['Invoice No','Customer','Issue Date','Due Date','Total','Paid','Outstanding','Aging'].map(h => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outstanding.map(inv => (
              <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNo}</td>
                <td className="px-3 py-2">{inv.customerName ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{inv.issueDate}</td>
                <td className="px-3 py-2 text-muted-foreground">{inv.dueDate ?? '—'}</td>
                <td className="px-3 py-2 font-medium">RM {inv.totalAmount.toLocaleString()}</td>
                <td className="px-3 py-2 text-muted-foreground">RM {(inv.paidAmount ?? 0).toLocaleString()}</td>
                <td className="px-3 py-2 font-semibold text-red-600 dark:text-red-400">RM {inv.owedAmount.toLocaleString()}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${BUCKET_STYLE[inv.bucket]}`}>{inv.bucket} days</span>
                </td>
              </tr>
            ))}
            {outstanding.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">No outstanding invoices</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
