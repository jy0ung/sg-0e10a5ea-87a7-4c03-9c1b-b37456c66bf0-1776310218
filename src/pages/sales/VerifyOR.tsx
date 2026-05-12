import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { getOfficialReceipts, upsertOfficialReceipt, deleteOfficialReceipt } from '@/services/masterDataService';
import { OfficialReceipt } from '@/types';
import { Plus, Pencil, Search, Trash2, CheckCircle, Clock } from 'lucide-react';

type FormState = {
  receiptNo: string; branch: string; receiptDate: string;
  amount: string; attachmentUrl: string; verifiedBy: string; status: string;
};
const empty: FormState = { receiptNo: '', branch: '', receiptDate: '', amount: '', attachmentUrl: '', verifiedBy: '', status: 'Pending' };

const STATUS_ICON: Record<string, React.ReactElement> = {
  Verified: <CheckCircle className="h-3 w-3 mr-1 inline" />,
  Pending: <Clock className="h-3 w-3 mr-1 inline" />,
};

export default function VerifyOR() {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();

  const queryClient = useQueryClient();
  const { data: receipts = [], isPending: loading } = useQuery({
    queryKey: ['official-receipts', companyId],
    queryFn: async () => { const { data } = await getOfficialReceipts(companyId); return data; },
    enabled: !!companyId,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OfficialReceipt | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const openAdd = () => { setEditId(null); setForm(empty); setDialogOpen(true); };
  const openEdit = (r: OfficialReceipt) => {
    setEditId(r.id);
    setForm({
      receiptNo: r.receiptNo, branch: r.branch ?? '', receiptDate: r.receiptDate ?? '',
      amount: String(r.amount ?? ''), attachmentUrl: r.attachmentUrl ?? '',
      verifiedBy: r.verifiedBy ?? '', status: r.status,
    });
    setDialogOpen(true);
  };

  const quickVerify = async (r: OfficialReceipt) => {
    await upsertOfficialReceipt(companyId, { ...r, status: 'Verified', verifiedBy: user?.email ?? 'admin' });
    await queryClient.invalidateQueries({ queryKey: ['official-receipts', companyId] });
    toast({ title: `OR ${r.receiptNo} marked as Verified` });
  };

  const handleSave = async () => {
    if (!form.receiptNo.trim()) return toast({ title: 'OR No is required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertOfficialReceipt(companyId, {
      id: editId ?? undefined,
      receiptNo: form.receiptNo.trim(),
      branch: form.branch.trim() || undefined,
      receiptDate: form.receiptDate || undefined,
      amount: parseFloat(form.amount) || undefined,
      attachmentUrl: form.attachmentUrl.trim() || undefined,
      verifiedBy: form.verifiedBy.trim() || undefined,
      status: form.status,
    });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await queryClient.invalidateQueries({ queryKey: ['official-receipts', companyId] });
    setDialogOpen(false);
    toast({ title: editId ? 'Receipt updated' : 'Receipt created' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteOfficialReceipt(companyId, deleteTarget.id);
    await queryClient.invalidateQueries({ queryKey: ['official-receipts', companyId] });
    setDeleteTarget(null);
    toast({ title: 'Official receipt deleted' });
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const summary = { total: receipts.length, pending: receipts.filter(r => r.status === 'Pending').length, verified: receipts.filter(r => r.status === 'Verified').length };

  const filtered = receipts.filter(r => {
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (!search) return true;
    return [r.receiptNo, r.verifiedBy ?? '', r.branch ?? ''].some(v => v.toLowerCase().includes(search.toLowerCase()));
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 animate-fade-in">
      <PageHeader
        title="Verify Official Receipts"
        description="Review and verify customer payment receipts"
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Sales', path: '/sales' }, { label: 'Verify OR' }]}
        actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Receipt</Button>}
      />

      <div className="grid shrink-0 grid-cols-3 gap-3">
        {[
          { label: 'Total Receipts', value: summary.total, variant: 'default' },
          { label: 'Pending', value: summary.pending, variant: 'secondary' },
          { label: 'Verified', value: summary.verified, variant: 'default' },
        ].map(({ label, value }) => (
          <div key={label} className="glass-panel p-4 text-center">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-sm text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Receipt Verification Queue</p>
            <p className="mt-0.5 text-sm text-foreground">Review pending receipts, confirm payment evidence, and track verifier ownership.</p>
          </div>
          <div className="relative min-w-[220px] flex-1 lg:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 pl-9 text-sm" placeholder="Search OR no, branch…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {['All', 'Pending', 'Verified'].map(s => (
              <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)}>{s}</Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[220px] flex-1 items-center justify-center text-muted-foreground">Loading…</div>
        ) : (
          <ScrollableRegion className="min-h-0 flex-1 overflow-auto" label="Official receipts table">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/90 text-muted-foreground backdrop-blur">
                <tr className="border-b border-border text-left text-xs">
                  {['OR No', 'Date', 'Amount (RM)', 'Verified By', 'Status', 'Actions'].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No receipts found.</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-xs">{r.receiptNo}</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.receiptDate ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{r.amount != null ? Number(r.amount).toLocaleString('en-MY', { minimumFractionDigits: 2 }) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.verifiedBy ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge variant={r.status === 'Verified' ? 'default' : 'secondary'}>
                        {STATUS_ICON[r.status]}{r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        {r.status === 'Pending' && (
                          <Button size="sm" variant="outline" onClick={() => quickVerify(r)}>
                            <CheckCircle className="h-3 w-3 mr-1" />Verify
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" aria-label={`Edit receipt ${r.receiptNo}`} onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" aria-label={`Delete receipt ${r.receiptNo}`} className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableRegion>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'Edit Official Receipt' : 'Add Official Receipt'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            {([
              ['receiptNo', 'OR No *', 'e.g. OR-2024-001'],
              ['receiptDate', 'Date', 'YYYY-MM-DD'],
              ['amount', 'Amount (RM)', 'e.g. 5000'],
              ['attachmentUrl', 'Attachment', 'filename or URL'],
              ['verifiedBy', 'Verified By', 'name or email'],
              ['status', 'Status', 'Pending / Verified'],
            ] as [keyof FormState, string, string][]).map(([k, label, hint]) => (
              <div key={k} className="grid grid-cols-3 items-center gap-4">
                <Label className="text-right">{label}</Label>
                <Input className="col-span-2" placeholder={hint} value={form[k]} onChange={set(k)} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Official Receipt</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete OR <strong>{deleteTarget?.receiptNo}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
