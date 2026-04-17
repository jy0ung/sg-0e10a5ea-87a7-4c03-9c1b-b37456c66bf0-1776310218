import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useSales } from '@/contexts/SalesContext';
import { computeSalesmanActuals, upsertSalesmanTarget, deleteSalesmanTarget } from '@/services/salesTargetService';
import { SalesmanPerformance, SalesmanTarget } from '@/types';
import { Target, Plus, Pencil, Trash2 } from 'lucide-react';
import { TableSkeleton } from '@/components/shared/TableSkeleton';

export default function SalesmanPerformancePage() {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const { salesmanTargets, reloadSales } = useSales();
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [performance, setPerformance] = useState<SalesmanPerformance[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SalesmanTarget | null>(null);
  const [form, setForm] = useState({ salesmanId: '', salesmanName: '', branchCode: '', targetUnits: '', targetRevenue: '' });

  const loadPerformance = useCallback(async () => {
    setLoading(true);
    const { data } = await computeSalesmanActuals(companyId, year, month);
    setPerformance(data);
    setLoading(false);
  }, [companyId, year, month]);

  useEffect(() => { reloadSales(); loadPerformance(); }, [year, month, reloadSales, loadPerformance]);

  const handleSaveTarget = async () => {
    if (!form.salesmanId || !form.targetUnits) return toast({ title: 'Salesman ID and Target Units required', variant: 'destructive' });
    const { error } = await upsertSalesmanTarget(companyId, {
      salesmanId: form.salesmanId,
      salesmanName: form.salesmanName,
      branchCode: form.branchCode,
      year,
      month,
      targetUnits: parseInt(form.targetUnits),
      targetRevenue: form.targetRevenue ? parseFloat(form.targetRevenue) : undefined,
    });
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await reloadSales();
    setTargetOpen(false);
    toast({ title: 'Target saved' });
  };

  const handleDeleteTarget = async (id: string) => {
    await deleteSalesmanTarget(id);
    await reloadSales();
    toast({ title: 'Target removed' });
  };

  const monthTargets = salesmanTargets.filter(t => t.year === year && t.month === month);
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const months = Array.from({ length: 12 }, (_, i) => ({ val: i + 1, label: new Date(2000, i).toLocaleString('default', { month: 'long' }) }));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Salesman Performance"
        description="Actual orders vs targets by salesman"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Sales' }, { label: 'Performance' }]}
        actions={<Button size="sm" onClick={() => { setEditTarget(null); setForm({ salesmanId:'',salesmanName:'',branchCode:'',targetUnits:'',targetRevenue:'' }); setTargetOpen(true); }}><Plus className="h-4 w-4 mr-1" />Set Target</Button>}
      />

      {/* Period selector */}
      <div className="flex items-center gap-2">
        <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map(m => <SelectItem key={m.val} value={String(m.val)}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8" onClick={loadPerformance}>Refresh</Button>
      </div>

      {/* Performance Table */}
      <div className="glass-panel overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {['Salesman','Branch','Total Orders','Delivered','Revenue','Avg Deal','Target Units','Achievement'].map(h => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {performance.map(p => {
              const pct = p.achievementPct ?? (p.targetUnits > 0 ? (p.confirmedOrders / p.targetUnits) * 100 : undefined);
              const color = pct === undefined ? '' : pct >= 100 ? 'text-emerald-600' : pct >= 70 ? 'text-yellow-600' : 'text-red-500';
              return (
                <tr key={p.salesmanId} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="px-3 py-2 font-medium">{p.salesmanName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.branchCode}</td>
                  <td className="px-3 py-2">{p.totalOrders}</td>
                  <td className="px-3 py-2">{p.deliveredOrders}</td>
                  <td className="px-3 py-2">RM {p.totalRevenue.toLocaleString()}</td>
                  <td className="px-3 py-2">RM {p.avgDealSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2">{p.targetUnits > 0 ? p.targetUnits : <span className="text-muted-foreground">—</span>}</td>
                  <td className={`px-3 py-2 font-semibold ${color}`}>{pct !== undefined ? `${pct.toFixed(0)}%` : '—'}</td>
                </tr>
              );
            })}
            {performance.length === 0 && !loading && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">No data for this period</td></tr>}
            {loading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {Array.from({ length: 8 }).map((_, c) => <td key={c} className="px-3 py-2.5"><div className="h-3 w-full animate-pulse rounded bg-muted" /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Targets management for period */}
      {monthTargets.length > 0 && (
        <div className="glass-panel p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Targets This Period</p>
          <div className="flex flex-wrap gap-2">
            {monthTargets.map(t => (
              <div key={t.id} className="flex items-center gap-1.5 text-xs bg-secondary rounded-lg px-2.5 py-1.5">
                <Target className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{t.salesmanName}</span>
                <span className="text-muted-foreground">— {t.targetUnits} units</span>
                <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => handleDeleteTarget(t.id)}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Set Target Dialog */}
      <Dialog open={targetOpen} onOpenChange={setTargetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Set Target — {months[month-1].label} {year}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { field: 'salesmanId', label: 'Salesman ID *' },
              { field: 'salesmanName', label: 'Salesman Name' },
              { field: 'branchCode', label: 'Branch Code' },
              { field: 'targetUnits', label: 'Target Units *', type: 'number' },
              { field: 'targetRevenue', label: 'Target Revenue', type: 'number' },
            ].map(({ field, label, type }) => (
              <div key={field} className="space-y-1">
                <label className="text-xs text-muted-foreground">{label}</label>
                <Input type={type ?? 'text'} className="h-8 text-sm" value={form[field as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTargetOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTarget}>Save Target</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
