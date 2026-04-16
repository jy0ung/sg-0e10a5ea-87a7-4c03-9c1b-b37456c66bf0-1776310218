import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getDealers, upsertDealer, deleteDealer } from '@/services/masterDataService';
import { Dealer } from '@/types';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useCompanyId } from '@/hooks/useCompanyId';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';

type FormState = {
  name: string; accCode: string; companyRegNo: string;
  address: string; contactNo: string; email: string; status: string;
};
const empty: FormState = { name: '', accCode: '', companyRegNo: '', address: '', contactNo: '', email: '', status: 'Active' };

export default function Dealers() {
  const { hasRole } = useAuth();
  const companyId = useCompanyId();
  if (!hasRole(['super_admin', 'company_admin'])) return <UnauthorizedAccess />;
  const { toast } = useToast();

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Dealer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await getDealers(companyId);
    setDealers(data);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditId(null); setForm(empty); setDialogOpen(true); };
  const openEdit = (d: Dealer) => {
    setEditId(d.id);
    setForm({ name: d.name, accCode: d.accCode ?? '', companyRegNo: d.companyRegNo ?? '', address: d.address ?? '', contactNo: d.contactNo ?? '', email: d.email ?? '', status: d.status });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast({ title: 'Name is required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertDealer(companyId, {
      id: editId ?? undefined,
      name: form.name.trim(),
      accCode: form.accCode.trim() || undefined,
      companyRegNo: form.companyRegNo.trim() || undefined,
      address: form.address.trim() || undefined,
      contactNo: form.contactNo.trim() || undefined,
      email: form.email.trim() || undefined,
      status: form.status,
    });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await load();
    setDialogOpen(false);
    toast({ title: editId ? 'Dealer updated' : 'Dealer created' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteDealer(deleteTarget.id);
    await load();
    setDeleteTarget(null);
    toast({ title: 'Dealer deleted' });
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <PageHeader title="Dealers" description="Manage authorised dealers and their accounts" />
      <div className="flex justify-end">
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Dealer</Button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {['Name', 'Acc. Code', 'Company Reg No', 'Contact No', 'Email', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dealers.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No dealers found.</td></tr>
              ) : dealers.map(d => (
                <tr key={d.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{d.accCode ?? '—'}</td>
                  <td className="px-4 py-3">{d.companyRegNo ?? '—'}</td>
                  <td className="px-4 py-3">{d.contactNo ?? '—'}</td>
                  <td className="px-4 py-3">{d.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={d.status === 'Active' ? 'default' : 'secondary'}>{d.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(d)}><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{editId ? 'Edit Dealer' : 'Add Dealer'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            {([
              ['name', 'Name *', 'e.g. Best Motors Sdn Bhd'],
              ['accCode', 'Acc. Code', 'e.g. BM001'],
              ['companyRegNo', 'Company Reg No', 'e.g. 123456-A'],
              ['address', 'Address', ''],
              ['contactNo', 'Contact No', 'e.g. 03-12345678'],
              ['email', 'Email', 'e.g. dealer@example.com'],
              ['status', 'Status', 'Active / Inactive'],
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
            <AlertDialogTitle>Delete Dealer</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.</AlertDialogDescription>
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
