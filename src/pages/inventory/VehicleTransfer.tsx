import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useData } from '@/contexts/DataContext';
import {
  listVehicleTransfers,
  createVehicleTransfer,
  updateVehicleTransferStatus,
  type TransferStatus,
  type VehicleTransferRecord,
} from '@/services/inventoryService';
import { vehicleTransferSchema } from '@/lib/validations';
import { Search, Plus, ArrowRight } from 'lucide-react';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';

type Transfer = VehicleTransferRecord;

const STATUS_BADGE: Record<TransferStatus, string> = {
  pending:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  in_transit: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  arrived:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled:  'bg-secondary text-secondary-foreground',
};

const EMPTY_FORM = { fromBranch: '', toBranch: '', chassisNo: '', model: '', colour: '', remark: '' };

export default function VehicleTransfer() {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const { vehicles } = useData();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState<string>('all');
  const [addOpen, setAddOpen]     = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  const branches = [...new Set(vehicles.map(v => v.branch_code).filter(Boolean))].sort() as string[];

  const { data: transfers = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['vehicle-transfers', companyId],
    queryFn: () => listVehicleTransfers(companyId ?? ''),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['vehicle-transfers', companyId] });

  const filtered = transfers.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return !q || [t.chassisNo, t.model, t.fromBranch, t.toBranch, t.runningNo].join(' ').toLowerCase().includes(q);
  });

  const handleCreate = async () => {
    const parsed = vehicleTransferSchema.safeParse(form);
    if (!parsed.success) {
      return toast({
        title: parsed.error.issues[0]?.message ?? 'Invalid input',
        variant: 'destructive',
      });
    }
    if (!user) return;
    setSaving(true);
    const runningNo = `TRF-${String(transfers.length + 1).padStart(4, '0')}`;
    const { error } = await createVehicleTransfer({
      companyId: user.company_id,
      actorId: user.id,
      runningNo,
      fromBranch: parsed.data.fromBranch,
      toBranch: parsed.data.toBranch,
      chassisNo: parsed.data.chassisNo,
      model: parsed.data.model,
      colour: parsed.data.colour ?? null,
      remark: parsed.data.remark ?? null,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to create transfer', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Transfer record created', description: runningNo });
    setForm(EMPTY_FORM);
    setAddOpen(false);
    invalidate();
  };

  const updateStatus = async (id: string, status: TransferStatus) => {
    const prev = transfers.find(t => t.id === id);
    if (!prev) return;
    const { error } = await updateVehicleTransferStatus(id, status, {
      companyId: user?.company_id,
      actorId: user?.id,
      chassisNo: prev.chassisNo,
      toBranch: prev.toBranch,
      previousArrivedAt: prev.arrivedAt ?? null,
    });
    if (error) {
      toast({ title: 'Failed to update status', description: error.message, variant: 'destructive' });
      return;
    }
    invalidate();
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Vehicle Transfer" description="Inter-branch chassis movement tracking"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Inventory' }, { label: 'Vehicle Transfer' }]} />
        <TableSkeleton rows={8} cols={7} colWidths={['w-20','w-20','w-20','w-28','w-20','w-24','w-16']} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Vehicle Transfer" description="Inter-branch chassis movement tracking"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Inventory' }, { label: 'Vehicle Transfer' }]} />
        <PageErrorState title="Unable to load vehicle transfers" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Vehicle Transfer"
        description="Inter-branch chassis movement tracking"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Inventory' }, { label: 'Vehicle Transfer' }]}
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />New Transfer
          </Button>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['pending','in_transit','arrived','cancelled'] as TransferStatus[]).map(s => (
          <div key={s} className="glass-panel p-4">
            <p className="text-xs text-muted-foreground capitalize mb-1">{s.replace('_', ' ')}</p>
            <p className="text-2xl font-bold text-foreground">{transfers.filter(t => t.status === s).length}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-40 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Chassis, model, branch…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="arrived">Arrived</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} records</span>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Running No</th>
                <th className="pb-2 pr-4 font-medium">Route</th>
                <th className="pb-2 pr-4 font-medium">Chassis No</th>
                <th className="pb-2 pr-4 font-medium">Model</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">No transfer records found</td></tr>
              ) : (
                filtered.map(t => (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 font-mono text-xs font-medium">{t.runningNo}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-medium">{t.fromBranch}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{t.toBranch}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{t.chassisNo}</td>
                    <td className="py-2 pr-4 text-xs">{t.model}{t.colour ? ` / ${t.colour}` : ''}</td>
                    <td className="py-2 pr-4">
                      <Badge className={`text-[10px] capitalize ${STATUS_BADGE[t.status]}`}>{t.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{t.arrivedAt ?? t.createdAt}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {t.status === 'pending' && (
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => updateStatus(t.id, 'in_transit')}>
                            Dispatch
                          </Button>
                        )}
                        {t.status === 'in_transit' && (
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-emerald-600" onClick={() => updateStatus(t.id, 'arrived')}>
                            Mark Arrived
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Transfer Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Vehicle Transfer</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">From Branch *</label>
                <Select value={form.fromBranch} onValueChange={v => setForm(f => ({ ...f, fromBranch: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">To Branch *</label>
                <Select value={form.toBranch} onValueChange={v => setForm(f => ({ ...f, toBranch: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Chassis No *</label>
              <Input className="h-8 text-sm uppercase" placeholder="e.g. PM00012345" value={form.chassisNo} onChange={e => setForm(f => ({ ...f, chassisNo: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Model *</label>
                <Input className="h-8 text-sm" placeholder="e.g. X50 1.5T" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Colour</label>
                <Input className="h-8 text-sm" placeholder="e.g. Jet White" value={form.colour} onChange={e => setForm(f => ({ ...f, colour: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Remark</label>
              <Input className="h-8 text-sm" placeholder="Optional note" value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>Create Transfer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
