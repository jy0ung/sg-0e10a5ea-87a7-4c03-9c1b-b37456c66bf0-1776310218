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
import { getUserGroups, upsertUserGroup, deleteUserGroup } from '@/services/masterDataService';
import { UserGroup } from '@/types';
import { Plus, Pencil, Trash2 } from 'lucide-react';

type FormState = { name: string; status: string };
const empty: FormState = { name: '', status: 'Active' };

export default function UserGroups() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? 'c1';
  const { toast } = useToast();

  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserGroup | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await getUserGroups(companyId);
    setGroups(data);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditId(null); setForm(empty); setDialogOpen(true); };
  const openEdit = (g: UserGroup) => {
    setEditId(g.id);
    setForm({ name: g.name, status: g.status });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast({ title: 'Name is required', variant: 'destructive' });
    setSaving(true);
    const { error } = await upsertUserGroup(companyId, { id: editId ?? undefined, name: form.name.trim(), status: form.status });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await load();
    setDialogOpen(false);
    toast({ title: editId ? 'Group updated' : 'Group created' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteUserGroup(deleteTarget.id);
    await load();
    setDeleteTarget(null);
    toast({ title: 'User group deleted' });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="User Groups" description="Define groups for user access and permissions" />
      <div className="flex justify-end">
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Group</Button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {['Group Name', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No user groups found.</td></tr>
              ) : groups.map(g => (
                <tr key={g.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{g.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={g.status === 'Active' ? 'default' : 'secondary'}>{g.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(g)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(g)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'Edit User Group' : 'Add User Group'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 items-center gap-4">
              <Label className="text-right">Name *</Label>
              <Input className="col-span-2" placeholder="e.g. Sales Manager" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label className="text-right">Status</Label>
              <Input className="col-span-2" placeholder="Active / Inactive" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} />
            </div>
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
            <AlertDialogTitle>Delete User Group</AlertDialogTitle>
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
