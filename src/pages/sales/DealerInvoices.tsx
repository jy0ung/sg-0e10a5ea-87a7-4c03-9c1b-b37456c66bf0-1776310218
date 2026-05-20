import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { getDealerInvoices, upsertDealerInvoice, deleteDealerInvoice } from '@/services/masterDataService';
import { DealerInvoice } from '@/types';
import { Plus, Pencil, Search, Trash2 } from 'lucide-react';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { dealerInvoiceSchema, type DealerInvoiceFormData } from '@/lib/validations';
import { PageErrorState } from '@/components/shared/PageState';

const defaultValues: DealerInvoiceFormData = {
  invoiceNo: '', dealerName: '', carModel: '', carColour: '', chassisNo: '',
  salesPrice: undefined, invoiceDate: '', branch: '', status: 'Pending',
};

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  Pending: 'outline', Issued: 'default', Cancelled: 'destructive',
};

export default function DealerInvoices() {
  const { user: _user } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DealerInvoice | null>(null);
  const [search, setSearch] = useState('');

  const form = useForm<DealerInvoiceFormData>({
    resolver: zodResolver(dealerInvoiceSchema),
    defaultValues,
  });

  const { data: invoices = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dealer-invoices', companyId],
    queryFn: () => getDealerInvoices(companyId).then(r => r.data),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['dealer-invoices', companyId] });

  const openAdd = () => { setEditId(null); form.reset(defaultValues); setDialogOpen(true); };
  const openEdit = (inv: DealerInvoice) => {
    setEditId(inv.id);
    form.reset({
      invoiceNo: inv.invoiceNo ?? '', branch: inv.branch ?? '',
      dealerName: inv.dealerName ?? '', carModel: inv.carModel ?? '',
      carColour: inv.carColour ?? '', chassisNo: inv.chassisNo ?? '',
      salesPrice: inv.salesPrice ? Number(inv.salesPrice) : undefined,
      invoiceDate: inv.invoiceDate ?? '', status: inv.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async (data: DealerInvoiceFormData) => {
    const { error } = await upsertDealerInvoice(companyId, {
      id: editId ?? undefined,
      invoiceNo: data.invoiceNo.trim(),
      branch: data.branch?.trim() || undefined,
      dealerName: data.dealerName.trim(),
      carModel: data.carModel?.trim(),
      carColour: data.carColour?.trim() || undefined,
      chassisNo: data.chassisNo?.trim() || undefined,
      salesPrice: data.salesPrice,
      invoiceDate: data.invoiceDate || undefined,
      status: data.status,
    });
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await invalidate();
    setDialogOpen(false);
    toast({ title: editId ? 'Invoice updated' : 'Invoice created' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteDealerInvoice(companyId, deleteTarget.id);
    await invalidate();
    setDeleteTarget(null);
    toast({ title: 'Invoice deleted' });
  };

  const fieldErrors = form.formState.errors;

  const filtered = invoices.filter(inv =>
    !search || [inv.invoiceNo, inv.dealerName, inv.carModel, inv.chassisNo ?? ''].some(v => (v ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  if (isError) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-4 animate-fade-in">
        <PageHeader title="Dealer Invoices" description="Manage dealer invoice records" breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Sales', path: '/sales' }, { label: 'Dealer Invoices' }]} />
        <PageErrorState title="Unable to load dealer invoices" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 animate-fade-in">
      <PageHeader
        title="Dealer Invoices"
        description="Manage vehicle dealer invoices"
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Sales', path: '/sales' }, { label: 'Dealer Invoices' }]}
        actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />New Invoice</Button>}
      />

      {isLoading ? (
        <TableSkeleton rows={8} cols={6} colWidths={['w-24','w-32','w-28','w-20','w-24','w-16']} />
      ) : (
        <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Dealer Invoice Queue</p>
              <p className="mt-0.5 text-sm text-foreground">Review dealer billing records, status, and chassis references.</p>
            </div>
            <div className="relative min-w-[240px] flex-1 lg:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="h-9 pl-9 text-sm" placeholder="Invoice no, dealer, model, chassis…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <span className="rounded-md border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">{filtered.length} invoices</span>
          </div>

          <ScrollableRegion className="min-h-0 flex-1 overflow-auto" label="Dealer invoices table">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/90 text-muted-foreground backdrop-blur">
                <tr className="border-b border-border text-left text-xs">
                {['Invoice No', 'Dealer Name', 'Car Model', 'Colour', 'Chassis No', 'Sales Price (RM)', 'Date', 'Status', ''].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No invoices found.</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-xs">{inv.invoiceNo}</td>
                  <td className="whitespace-nowrap px-4 py-3">{inv.dealerName}</td>
                  <td className="whitespace-nowrap px-4 py-3">{inv.carModel}</td>
                  <td className="whitespace-nowrap px-4 py-3">{inv.carColour ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{inv.chassisNo ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{inv.salesPrice != null ? Number(inv.salesPrice).toLocaleString('en-MY', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{inv.invoiceDate ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_COLORS[inv.status] ?? 'secondary'}>{inv.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" aria-label={`Edit invoice ${inv.invoiceNo}`} onClick={() => openEdit(inv)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Delete invoice ${inv.invoiceNo}`} className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(inv)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </ScrollableRegion>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'Edit Dealer Invoice' : 'New Dealer Invoice'}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(handleSave)}>
            <div className="grid gap-4 py-2">
              {([
                ['invoiceNo', 'Invoice No *', 'e.g. DI-2024-001'],
                ['dealerName', 'Dealer Name *', 'e.g. Best Motors Sdn Bhd'],
                ['carModel', 'Car Model', 'e.g. Proton X70'],
                ['carColour', 'Colour', 'e.g. White'],
                ['chassisNo', 'Chassis No', 'e.g. PM00012345'],
                ['salesPrice', 'Sales Price (RM)', 'e.g. 98000'],
                ['invoiceDate', 'Invoice Date', 'YYYY-MM-DD'],
                ['status', 'Status', 'Pending / Issued / Cancelled'],
              ] as [keyof DealerInvoiceFormData, string, string][]).map(([k, label, hint]) => {
                const err = fieldErrors[k];
                return (
                  <div key={k} className="grid grid-cols-3 items-center gap-4">
                    <Label className="text-right">{label}</Label>
                    <div className="col-span-2">
                      <Input
                        className={err ? 'border-destructive' : ''}
                        placeholder={hint}
                        {...form.register(k, k === 'salesPrice' ? { setValueAs: (v: string) => v === '' ? undefined : Number(v) } : undefined)}
                      />
                      {err && <p className="text-xs text-destructive mt-1">{err.message}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
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
