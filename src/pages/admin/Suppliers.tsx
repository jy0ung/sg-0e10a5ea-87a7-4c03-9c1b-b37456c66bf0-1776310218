import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getSuppliers, upsertSupplier, deleteSupplier } from '@/services/masterDataService';
import { Supplier } from '@/types';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useCompanyId } from '@/hooks/useCompanyId';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';

type FormState = {
  name: string; code: string; companyRegNo: string;
  companyAddress: string; contactNo: string; email: string; status: string;
};
const empty: FormState = { name: '', code: '', companyRegNo: '', companyAddress: '', contactNo: '', email: '', status: 'Active' };

export default function Suppliers() {
  const { hasRole } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();

  const queryClient = useQueryClient();
  const { data: suppliers = [], isPending: loading } = useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: async () => { const { data } = await getSuppliers(companyId); return data; },
    enabled: !!companyId,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  if (!hasRole(['super_admin', 'company_admin'])) return <UnauthorizedAccess />;

  const openAdd = () => { setEditId(null); setForm(empty); setDialogOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditId(s.id);
    setForm({ name: s.name, code: s.code ?? '', companyRegNo: s.companyRegNo ?? '', companyAddress: s.companyAddress ?? '', contactNo: s.contactNo ?? '', email: s.email ?? '', status: s.status });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast({ title: 'Name is required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertSupplier(companyId, {
      id: editId ?? undefined,
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      companyRegNo: form.companyRegNo.trim() || undefined,
      companyAddress: form.companyAddress.trim() || undefined,
      contactNo: form.contactNo.trim() || undefined,
      email: form.email.trim() || undefined,
      status: form.status,
    });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await queryClient.invalidateQueries({ queryKey: ['suppliers', companyId] });
    setDialogOpen(false);
    toast({ title: editId ? 'Supplier updated' : 'Supplier created' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await deleteSupplier(companyId, deleteTarget.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await queryClient.invalidateQueries({ queryKey: ['suppliers', companyId] });
    setDeleteTarget(null);
    toast({ title: 'Supplier deleted' });
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <PageHeader title="Suppliers" description="Manage vehicle and parts suppliers" />
      <div className="flex justify-end">
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Supplier</Button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {['Name', 'Code', 'Company Reg No', 'Contact No', 'Email', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No suppliers found.</td></tr>
              ) : suppliers.map(s => (
                <tr key={s.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.code ?? '—'}</td>
                  <td className="px-4 py-3">{s.companyRegNo ?? '—'}</td>
                  <td className="px-4 py-3">{s.contactNo ?? '—'}</td>
                  <td className="px-4 py-3">{s.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={s.status === 'Active' ? 'default' : 'secondary'}>{s.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)}><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{editId ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            {([
              ['name', 'Name *', 'e.g. Proton Edar Sdn Bhd'],
              ['code', 'Code', 'e.g. PE'],
              ['companyRegNo', 'Company Reg No', 'e.g. 123456-A'],
              ['companyAddress', 'Address', ''],
              ['contactNo', 'Contact No', 'e.g. 03-12345678'],
              ['email', 'Email', 'e.g. supplier@example.com'],
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
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
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
