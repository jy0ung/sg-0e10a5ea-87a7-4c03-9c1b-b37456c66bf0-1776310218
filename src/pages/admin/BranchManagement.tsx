import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getBranches, upsertBranch, deleteBranch } from '@/services/masterDataService';
import { BranchRecord } from '@/types';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useCompanyId } from '@/hooks/useCompanyId';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';

type FormState = { code: string; name: string; orSeries: string; vdoSeries: string };
const empty: FormState = { code: '', name: '', orSeries: '', vdoSeries: '' };

export default function BranchManagement() {
  const { hasRole } = useAuth();
  const companyId = useCompanyId();
  if (!hasRole(['super_admin', 'company_admin'])) return <UnauthorizedAccess />;
  const { toast } = useToast();

  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BranchRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await getBranches(companyId);
    setBranches(data);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditId(null); setForm(empty); setDialogOpen(true); };
  const openEdit = (b: BranchRecord) => {
    setEditId(b.id);
    setForm({ code: b.code, name: b.name, orSeries: b.orSeries ?? '', vdoSeries: b.vdoSeries ?? '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) return toast({ title: 'Code and Name are required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertBranch(companyId, {
      id: editId ?? undefined,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      orSeries: form.orSeries.trim() || undefined,
      vdoSeries: form.vdoSeries.trim() || undefined,
    });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await load();
    setDialogOpen(false);
    toast({ title: editId ? 'Branch updated' : 'Branch created' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await deleteBranch(deleteTarget.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await load();
    setDeleteTarget(null);
    toast({ title: 'Branch deleted' });
  };

  const fields: { key: keyof FormState; label: string; hint?: string }[] = [
    { key: 'code', label: 'Branch Code *', hint: 'e.g. KK' },
    { key: 'name', label: 'Branch Name *', hint: 'e.g. Kota Kinabalu' },
    { key: 'orSeries', label: 'OR Series', hint: 'Invoice OR prefix' },
    { key: 'vdoSeries', label: 'VDO Series', hint: 'VDO number prefix' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Branch Management"
        description="Manage company branches and their document series"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Admin' }, { label: 'Branches' }]}
        actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Branch</Button>}
      />

      <div className="glass-panel overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {['Code','Name','OR Series','VDO Series','Actions'].map(h => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {branches.map(b => (
              <tr key={b.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                <td className="px-3 py-2 font-mono font-semibold">{b.code}</td>
                <td className="px-3 py-2">{b.name}</td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{b.orSeries ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{b.vdoSeries ?? '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(b)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(b)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && branches.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">No branches configured</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editId ? 'Edit Branch' : 'Add Branch'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {fields.map(({ key, label, hint }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs text-muted-foreground">{label}</label>
                <Input
                  className="h-8 text-sm"
                  placeholder={hint}
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Branch</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete branch <strong>{deleteTarget?.code} – {deleteTarget?.name}</strong>? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
