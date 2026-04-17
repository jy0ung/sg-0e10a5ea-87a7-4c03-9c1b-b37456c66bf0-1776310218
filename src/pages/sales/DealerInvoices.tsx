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
import { useCompanyId } from '@/hooks/useCompanyId';
import { getDealerInvoices, upsertDealerInvoice, deleteDealerInvoice } from '@/services/masterDataService';
import { DealerInvoice } from '@/types';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { dealerInvoiceSchema } from '@/lib/validations';

type FormState = {
  invoiceNo: string; branchId: string; dealerName: string; carModel: string;
  colour: string; chassisNo: string; salesPrice: string; invoiceDate: string; status: string;
};
const empty: FormState = { invoiceNo: '', branchId: '', dealerName: '', carModel: '', colour: '', chassisNo: '', salesPrice: '', invoiceDate: '', status: 'Pending' };

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  Pending: 'outline', Issued: 'default', Cancelled: 'destructive',
};

export default function DealerInvoices() {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DealerInvoice | null>(null);
  const [search, setSearch] = useState('');

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['dealer-invoices', companyId],
    queryFn: () => getDealerInvoices(companyId).then(r => r.data),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['dealer-invoices', companyId] });

  const openAdd = () => { setEditId(null); setForm(empty); setDialogOpen(true); };
  const openEdit = (inv: DealerInvoice) => {
    setEditId(inv.id);
    setForm({
      invoiceNo: inv.invoiceNo, branchId: inv.branchId ?? '',
      dealerName: inv.dealerName, carModel: inv.carModel,
      colour: inv.colour ?? '', chassisNo: inv.chassisNo ?? '',
      salesPrice: String(inv.salesPrice ?? ''), invoiceDate: inv.invoiceDate ?? '', status: inv.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const parsed = dealerInvoiceSchema.safeParse({
      invoiceNo:   form.invoiceNo,
      dealerName:  form.dealerName,
      carModel:    form.carModel || undefined,
      colour:      form.colour || undefined,
      chassisNo:   form.chassisNo || undefined,
      salesPrice:  form.salesPrice ? parseFloat(form.salesPrice) : undefined,
      invoiceDate: form.invoiceDate || undefined,
      branchId:    form.branchId || undefined,
      status:      form.status,
    });
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      return toast({ title: first.message, variant: 'destructive' });
    }
    setSaving(true);
    const { error } = await upsertDealerInvoice(companyId, {
      id: editId ?? undefined,
      invoiceNo: form.invoiceNo.trim(),
      branchId: form.branchId.trim() || undefined,
      dealerName: form.dealerName.trim(),
      carModel: form.carModel.trim(),
      colour: form.colour.trim() || undefined,
      chassisNo: form.chassisNo.trim() || undefined,
      salesPrice: parseFloat(form.salesPrice) || undefined,
      invoiceDate: form.invoiceDate || undefined,
      status: form.status,
    });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidate();
    setDialogOpen(false);
    toast({ title: editId ? 'Invoice updated' : 'Invoice created' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteDealerInvoice(deleteTarget.id);
    await invalidate();
    setDeleteTarget(null);
    toast({ title: 'Invoice deleted' });
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const filtered = invoices.filter(inv =>
    !search || [inv.invoiceNo, inv.dealerName, inv.carModel, inv.chassisNo ?? ''].some(v => v.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Dealer Invoices" description="Manage vehicle dealer invoices" />
      <div className="flex items-center justify-between gap-4">
        <Input placeholder="Search by invoice no, dealer, model, chassis…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />New Invoice</Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={6} colWidths={['w-24','w-32','w-28','w-20','w-24','w-16']} />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {['Invoice No', 'Dealer Name', 'Car Model', 'Colour', 'Chassis No', 'Sales Price (RM)', 'Date', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No invoices found.</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-xs">{inv.invoiceNo}</td>
                  <td className="px-4 py-3">{inv.dealerName}</td>
                  <td className="px-4 py-3">{inv.carModel}</td>
                  <td className="px-4 py-3">{inv.colour ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{inv.chassisNo ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{inv.salesPrice != null ? Number(inv.salesPrice).toLocaleString('en-MY', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{inv.invoiceDate ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_COLORS[inv.status] ?? 'secondary'}>{inv.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(inv)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(inv)}><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{editId ? 'Edit Dealer Invoice' : 'New Dealer Invoice'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            {([
              ['invoiceNo', 'Invoice No *', 'e.g. DI-2024-001'],
              ['dealerName', 'Dealer Name *', 'e.g. Best Motors Sdn Bhd'],
              ['carModel', 'Car Model', 'e.g. Proton X70'],
              ['colour', 'Colour', 'e.g. White'],
              ['chassisNo', 'Chassis No', 'e.g. PM00012345'],
              ['salesPrice', 'Sales Price (RM)', 'e.g. 98000'],
              ['invoiceDate', 'Invoice Date', 'YYYY-MM-DD'],
              ['status', 'Status', 'Pending / Issued / Cancelled'],
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
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete invoice <strong>{deleteTarget?.invoiceNo}</strong>?</AlertDialogDescription>
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
