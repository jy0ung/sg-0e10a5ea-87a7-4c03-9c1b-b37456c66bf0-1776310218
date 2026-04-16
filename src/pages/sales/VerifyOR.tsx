import React, { useEffect, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getOfficialReceipts, upsertOfficialReceipt, deleteOfficialReceipt } from '@/services/masterDataService';
import { OfficialReceipt } from '@/types';
import { Plus, Pencil, Trash2, CheckCircle, Clock } from 'lucide-react';

type FormState = {
  orNo: string; branchId: string; receiptDate: string;
  amount: string; attachment: string; verifiedBy: string; status: string;
};
const empty: FormState = { orNo: '', branchId: '', receiptDate: '', amount: '', attachment: '', verifiedBy: '', status: 'Pending' };

const STATUS_ICON: Record<string, React.ReactElement> = {
  Verified: <CheckCircle className="h-3 w-3 mr-1 inline" />,
  Pending: <Clock className="h-3 w-3 mr-1 inline" />,
};

export default function VerifyOR() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? 'c1';
  const { toast } = useToast();

  const [receipts, setReceipts] = useState<OfficialReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OfficialReceipt | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const load = async () => {
    setLoading(true);
    const { data } = await getOfficialReceipts(companyId);
    setReceipts(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditId(null); setForm(empty); setDialogOpen(true); };
  const openEdit = (r: OfficialReceipt) => {
    setEditId(r.id);
    setForm({
      orNo: r.orNo, branchId: r.branchId ?? '', receiptDate: r.receiptDate ?? '',
      amount: String(r.amount ?? ''), attachment: r.attachment ?? '',
      verifiedBy: r.verifiedBy ?? '', status: r.status,
    });
    setDialogOpen(true);
  };

  const quickVerify = async (r: OfficialReceipt) => {
    await upsertOfficialReceipt(companyId, { ...r, status: 'Verified', verifiedBy: user?.email ?? 'admin' });
    await load();
    toast({ title: `OR ${r.orNo} marked as Verified` });
  };

  const handleSave = async () => {
    if (!form.orNo.trim()) return toast({ title: 'OR No is required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertOfficialReceipt(companyId, {
      id: editId ?? undefined,
      orNo: form.orNo.trim(),
      branchId: form.branchId.trim() || undefined,
      receiptDate: form.receiptDate || undefined,
      amount: parseFloat(form.amount) || undefined,
      attachment: form.attachment.trim() || undefined,
      verifiedBy: form.verifiedBy.trim() || undefined,
      status: form.status,
    });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await load();
    setDialogOpen(false);
    toast({ title: editId ? 'Receipt updated' : 'Receipt created' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteOfficialReceipt(deleteTarget.id);
    await load();
    setDeleteTarget(null);
    toast({ title: 'Official receipt deleted' });
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const summary = { total: receipts.length, pending: receipts.filter(r => r.status === 'Pending').length, verified: receipts.filter(r => r.status === 'Verified').length };

  const filtered = receipts.filter(r => {
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (!search) return true;
    return [r.orNo, r.verifiedBy ?? '', r.branchId ?? ''].some(v => v.toLowerCase().includes(search.toLowerCase()));
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Verify Official Receipts" description="Review and verify customer payment receipts" />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Receipts', value: summary.total, variant: 'default' },
          { label: 'Pending', value: summary.pending, variant: 'secondary' },
          { label: 'Verified', value: summary.verified, variant: 'default' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-card p-4 text-center">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-sm text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Input placeholder="Search OR No, branch…" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
          <div className="flex gap-1">
            {['All', 'Pending', 'Verified'].map(s => (
              <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)}>{s}</Button>
            ))}
          </div>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Receipt</Button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {['OR No', 'Date', 'Amount (RM)', 'Verified By', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No receipts found.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-xs">{r.orNo}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.receiptDate ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.amount != null ? Number(r.amount).toLocaleString('en-MY', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td className="px-4 py-3">{r.verifiedBy ?? '—'}</td>
                  <td className="px-4 py-3">
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
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'Edit Official Receipt' : 'Add Official Receipt'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            {([
              ['orNo', 'OR No *', 'e.g. OR-2024-001'],
              ['receiptDate', 'Date', 'YYYY-MM-DD'],
              ['amount', 'Amount (RM)', 'e.g. 5000'],
              ['attachment', 'Attachment', 'filename or URL'],
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
            <AlertDialogDescription>Are you sure you want to delete OR <strong>{deleteTarget?.orNo}</strong>?</AlertDialogDescription>
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
