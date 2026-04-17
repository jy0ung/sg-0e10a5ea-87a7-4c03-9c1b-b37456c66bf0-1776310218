import React, { useEffect, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useSales } from '@/contexts/SalesContext';
import { createCustomer, updateCustomer, deleteCustomer } from '@/services/customerService';
import { Customer } from '@/types';
import { Plus, Search, Pencil, Trash2, User } from 'lucide-react';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { customerSchema } from '@/lib/validations';

const EMPTY: Omit<Customer, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> = { name: '', email: '', phone: '', address: '', nric: '' };

export default function Customers() {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const { customers, reloadSales, loading } = useSales();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { reloadSales(); }, [reloadSales]);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search)
  );

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY }); setDialogOpen(true); };
  const openEdit = (c: Customer) => { setEditing(c); setForm({ name: c.name, email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', nric: c.nric ?? '' }); setDialogOpen(true); };

  const handleSave = async () => {
    const result = customerSchema.safeParse(form);
    if (!result.success) {
      const first = result.error.errors[0];
      return toast({ title: first.message, variant: 'destructive' });
    }
    setSaving(true);
    const { error } = editing
      ? await updateCustomer(editing.id, form)
      : await createCustomer(companyId, form);
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await reloadSales();
    setDialogOpen(false);
    toast({ title: editing ? 'Customer updated' : 'Customer created' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await deleteCustomer(deleteTarget.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await reloadSales();
    setDeleteTarget(null);
    toast({ title: 'Customer deleted' });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Customers"
        description="Manage customer records"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Sales' }, { label: 'Customers' }]}
        actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Customer</Button>}
      />

      {loading ? (
        <TableSkeleton rows={8} cols={5} colWidths={['w-32','w-28','w-24','w-36','w-16']} />
      ) : (
      <div className="glass-panel p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Search customers…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span className="text-xs text-muted-foreground">{filtered.length} records</span>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Phone</th>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">NRIC</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="py-2 pr-4 font-medium flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-muted-foreground" />{c.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{c.phone ?? '—'}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{c.email ?? '—'}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{c.nric ?? '—'}</td>
                  <td className="py-2 text-right space-x-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">No customers found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Customer' : 'Add Customer'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {(['name','phone','email','nric','address'] as const).map(field => (
              <div key={field} className="space-y-1">
                <label className="text-xs font-medium capitalize text-muted-foreground">{field}{field === 'name' && ' *'}</label>
                <Input className="h-8 text-sm" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
