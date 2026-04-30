import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useData } from '@/contexts/DataContext';
import { Search, Package, Loader2 } from 'lucide-react';
import { getAutoAgingFieldLabel } from '@/config/autoAgingFieldLabels';

const STATUS_BADGE: Record<string, string> = {
  in_stock:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  reserved:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  in_transit:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  delivered:   'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  registered:  'bg-secondary text-secondary-foreground',
};

function deriveStatus(v: { delivery_date?: string; reg_date?: string; date_received_by_outlet?: string }): string {
  if (v.delivery_date) return 'delivered';
  if (v.reg_date)      return 'registered';
  if (v.date_received_by_outlet) return 'in_stock';
  return 'in_transit';
}

export default function StockBalance() {
  const { vehicles, loading } = useData();
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('all');
  const [branchFilter, setBranch]   = useState('all');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  const branches = [...new Set(vehicles.map(v => v.branch_code).filter(Boolean))].sort();

  const filtered = vehicles.filter(v => {
    const status = deriveStatus(v);
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    if (branchFilter !== 'all' && v.branch_code !== branchFilter) return false;
    const q = search.toLowerCase();
    return !q || [v.chassis_no, v.model, v.reg_no, v.branch_code, v.salesman_name].join(' ').toLowerCase().includes(q);
  });

  // Status summary counts
  const statusCounts = { in_stock: 0, reserved: 0, in_transit: 0, delivered: 0, registered: 0 };
  vehicles.forEach(v => {
    const s = deriveStatus(v) as keyof typeof statusCounts;
    if (s in statusCounts) statusCounts[s]++;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Stock Balance"
        description="Live vehicle inventory by chassis number and location"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Inventory' }, { label: 'Stock Balance' }]}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {(Object.entries(statusCounts) as [string, number][]).map(([s, n]) => (
          <div key={s} className="glass-panel p-4">
            <p className="text-xs text-muted-foreground capitalize mb-1">{s.replace('_', ' ')}</p>
            <p className="text-2xl font-bold text-foreground">{n}</p>
          </div>
        ))}
      </div>

      {/* Filters + table */}
      <div className="glass-panel p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-40 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Chassis, model, plate…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="in_stock">In Stock</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="registered">Registered</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
          <Select value={branchFilter} onValueChange={setBranch}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b} value={b!}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
            <Package className="h-3.5 w-3.5" />{filtered.length} vehicles
          </span>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">{getAutoAgingFieldLabel('chassis_no', 'CHASSIS NO.')}</th>
                <th className="pb-2 pr-4 font-medium">{getAutoAgingFieldLabel('model', 'MODEL')}</th>
                <th className="pb-2 pr-4 font-medium">Colour/Variant</th>
                <th className="pb-2 pr-4 font-medium">Plate No</th>
                <th className="pb-2 pr-4 font-medium">{getAutoAgingFieldLabel('branch_code', 'BRCH K1')}</th>
                <th className="pb-2 pr-4 font-medium">{getAutoAgingFieldLabel('bg_date', 'BG DATE')}</th>
                <th className="pb-2 font-medium">{getAutoAgingFieldLabel('salesman_name', 'SA NAME')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">No vehicles match your filters</td></tr>
              ) : (
                filtered.map(v => {
                  const status = deriveStatus(v);
                  return (
                    <tr key={v.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4">
                        <Badge className={`text-[10px] capitalize ${STATUS_BADGE[status] ?? 'bg-secondary text-secondary-foreground'}`}>
                          {status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{v.chassis_no}</td>
                      <td className="py-2 pr-4">{v.model}</td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">{v.variant ?? '—'}</td>
                      <td className="py-2 pr-4 text-xs">{v.reg_no ?? '—'}</td>
                      <td className="py-2 pr-4 text-xs">{v.branch_code}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{v.bg_date ?? '—'}</td>
                      <td className="py-2 text-xs text-muted-foreground">{v.salesman_name ?? '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
