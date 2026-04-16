import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Search, Plus, Truck } from 'lucide-react';

type PIStatus = 'pending' | 'received' | 'cancelled';

interface PurchaseInvoice {
  id: string;
  invoiceNo: string;
  supplier: string;
  chassisNo: string;
  model: string;
  invoiceDate: string;
  amount: number;
  status: PIStatus;
  receivedDate?: string;
  remark?: string;
}

const STATUS_BADGE: Record<PIStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  received:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled: 'bg-secondary text-secondary-foreground',
};

const EMPTY_FORM = { invoiceNo: '', supplier: '', chassisNo: '', model: '', invoiceDate: new Date().toISOString().split('T')[0], amount: '', remark: '' };

function fmt(n: number) {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rowToInvoice(row: Record<string, unknown>): PurchaseInvoice {
  return {
    id:           String(row.id ?? ''),
    invoiceNo:    String(row.invoice_no ?? ''),
    supplier:     String(row.supplier ?? ''),
    chassisNo:    String(row.chassis_no ?? ''),
    model:        String(row.model ?? ''),
    invoiceDate:  String(row.invoice_date ?? ''),
    amount:       Number(row.amount ?? 0),
    status:       (row.status as PIStatus) ?? 'pending',
    receivedDate: row.received_date ? String(row.received_date) : undefined,
    remark:       row.remark ? String(row.remark) : undefined,
  };
}

export default function PurchaseInvoices() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [invoices, setInvoices]   = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState<string>('all');
  const [addOpen, setAddOpen]     = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  const loadInvoices = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('purchase_invoices')
      .select('*')
      .eq('company_id', user.company_id)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load purchase invoices', variant: 'destructive' });
    } else {
      setInvoices((data ?? []).map(row => rowToInvoice(row as Record<string, unknown>)));
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const filtered = invoices.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return !q || [i.invoiceNo, i.supplier, i.chassisNo, i.model].join(' ').toLowerCase().includes(q);
  });

  const totalAmount = invoices.reduce((s, i) => s + i.amount, 0);
  const pendingAmount = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0);

  const handleCreate = async () => {
    if (!form.invoiceNo || !form.supplier || !form.chassisNo || !form.model || !form.amount) {
      return toast({ title: 'Invoice No, Supplier, Chassis, Model, and Amount are required', variant: 'destructive' });
    }
    const parsed = parseFloat(form.amount);
    if (isNaN(parsed) || parsed <= 0) {
      return toast({ title: 'Amount must be a positive number', variant: 'destructive' });
    }
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('purchase_invoices')
      .insert({
        company_id:   user.company_id,
        invoice_no:   form.invoiceNo,
        supplier:     form.supplier,
        chassis_no:   form.chassisNo.toUpperCase(),
        model:        form.model,
        invoice_date: form.invoiceDate,
        amount:       parsed,
        status:       'pending',
        remark:       form.remark || null,
      });
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to create invoice', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Purchase invoice created', description: form.invoiceNo });
    setForm(EMPTY_FORM);
    setAddOpen(false);
    loadInvoices();
  };

  const markReceived = async (id: string) => {
    const prev = invoices.find(i => i.id === id);
    if (!prev) return;
    const receivedDate = new Date().toISOString().split('T')[0];
    // Optimistic update
    setInvoices(is => is.map(i =>
      i.id === id ? { ...i, status: 'received' as PIStatus, receivedDate } : i
    ));
    const { error } = await supabase
      .from('purchase_invoices')
      .update({ status: 'received', received_date: receivedDate })
      .eq('id', id);
    if (error) {
      setInvoices(is => is.map(i => i.id === id ? prev : i));
      toast({ title: 'Failed to mark received', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Purchase Invoices" description="CBU vehicle procurement invoices from suppliers"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Purchasing' }, { label: 'Purchase Invoices' }]} />
        <div className="glass-panel p-12 text-center text-sm text-muted-foreground">Loading invoices…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Purchase Invoices"
        description="CBU vehicle procurement invoices from suppliers"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Purchasing' }, { label: 'Purchase Invoices' }]}
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />New Invoice
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Invoices</p>
          <p className="text-2xl font-bold text-foreground">{invoices.length}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
          <p className="text-2xl font-bold text-foreground">{fmt(totalAmount)}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Pending Receipt</p>
          <p className="text-2xl font-bold text-warning">{invoices.filter(i => i.status === 'pending').length}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Pending Amount</p>
          <p className="text-2xl font-bold text-warning">{fmt(pendingAmount)}</p>
        </div>
      </div>

      <div className="glass-panel p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-40 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Invoice no, supplier, chassis…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
            <Truck className="h-3.5 w-3.5" />{filtered.length} invoices
          </span>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Invoice No</th>
                <th className="pb-2 pr-4 font-medium">Supplier</th>
                <th className="pb-2 pr-4 font-medium">Chassis No</th>
                <th className="pb-2 pr-4 font-medium">Model</th>
                <th className="pb-2 pr-4 font-medium">Invoice Date</th>
                <th className="pb-2 pr-4 font-medium">Amount</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">No purchase invoices found</td></tr>
              ) : (
                filtered.map(pi => (
                  <tr key={pi.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 font-mono text-xs font-medium">{pi.invoiceNo}</td>
                    <td className="py-2 pr-4 text-xs">{pi.supplier}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{pi.chassisNo}</td>
                    <td className="py-2 pr-4 text-xs">{pi.model}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{pi.invoiceDate}</td>
                    <td className="py-2 pr-4 text-xs font-medium">{fmt(pi.amount)}</td>
                    <td className="py-2 pr-4">
                      <Badge className={`text-[10px] capitalize ${STATUS_BADGE[pi.status]}`}>{pi.status}</Badge>
                    </td>
                    <td className="py-2">
                      {pi.status === 'pending' && (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-emerald-600" onClick={() => markReceived(pi.id)}>
                          Mark Received
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Invoice Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Purchase Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Invoice No *</label>
                <Input className="h-8 text-sm" placeholder="e.g. PI-2026-001" value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Invoice Date *</label>
                <Input type="date" className="h-8 text-sm" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Supplier *</label>
              <Input className="h-8 text-sm" placeholder="e.g. Proton Edar Sdn Bhd" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Chassis No *</label>
                <Input className="h-8 text-sm uppercase" placeholder="e.g. PM00012345" value={form.chassisNo} onChange={e => setForm(f => ({ ...f, chassisNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Model *</label>
                <Input className="h-8 text-sm" placeholder="e.g. X50 1.5T Premium" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Amount (RM) *</label>
              <Input type="number" className="h-8 text-sm" placeholder="e.g. 85000.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Remark</label>
              <Input className="h-8 text-sm" placeholder="Optional note" value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
