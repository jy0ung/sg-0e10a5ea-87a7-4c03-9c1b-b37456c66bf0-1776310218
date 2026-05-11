import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import {
  createPurchaseInvoice,
  listPurchaseInvoices,
  markPurchaseInvoiceReceived,
  type PurchaseInvoiceRecord,
} from '@/services/purchaseInvoiceService';
import {
  transitionPiLifecycle,
  recordSupplierPaymentEvent,
  getApAgingSummary,
} from '@/services/apService';
import { STALE } from '@/lib/queryClient';
import { purchaseInvoiceSchema } from '@/lib/validations';
import { Search, Plus, Truck, CheckCircle, ThumbsUp, CreditCard } from 'lucide-react';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import type { PurchaseInvoiceLifecycleStatus } from '@/types';

type _PIStatus = 'pending' | 'received' | 'cancelled';




const LIFECYCLE_BADGE: Record<PurchaseInvoiceLifecycleStatus, string> = {
  received:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  verified:  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  approved:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  scheduled: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  paid:      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-secondary text-secondary-foreground',
};

const AP_PAYMENT_BADGE: Record<string, string> = {
  unpaid:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  paid:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const EMPTY_FORM = { invoiceNo: '', supplier: '', chassisNo: '', model: '', invoiceDate: new Date().toISOString().split('T')[0], amount: '', remark: '' };

function fmt(n: number) {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PurchaseInvoices() {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState<string>('all');
  const [addOpen, setAddOpen]     = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  // Payment dialog state
  const [payOpen, setPayOpen]       = useState(false);
  const [payTarget, setPayTarget]   = useState<PurchaseInvoiceRecord | null>(null);
  const [payAmount, setPayAmount]   = useState('');
  const [payDate, setPayDate]       = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod]   = useState('');
  const [payRef, setPayRef]         = useState('');
  const [paying, setPaying]         = useState(false);

  const { data: invoices = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['purchase-invoices', companyId],
    queryFn: () => listPurchaseInvoices(companyId),
    enabled: !!companyId,
    staleTime: STALE.transactional,
  });

  const { data: agingData = [] } = useQuery({
    queryKey: ['ap-aging', companyId],
    queryFn: async () => { const { data } = await getApAgingSummary(companyId); return data ?? []; },
    enabled: !!companyId,
    staleTime: STALE.transactional,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-invoices', companyId] });
    void queryClient.invalidateQueries({ queryKey: ['ap-aging', companyId] });
  };

  const filtered = invoices.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return !q || [i.invoiceNo, i.supplier, i.chassisNo, i.model].join(' ').toLowerCase().includes(q);
  });

  const totalOutstanding = agingData.reduce((s, b) => s + b.totalOutstanding, 0);
  const due30 = agingData.filter(b => b.bucket === 'current' || b.bucket === '1_30_days').reduce((s, b) => s + b.totalOutstanding, 0);
  const overdue3160 = agingData.find(b => b.bucket === '31_60_days')?.totalOutstanding ?? 0;
  const overdueOver60 = agingData.filter(b => b.bucket === '61_90_days' || b.bucket === 'over_90_days').reduce((s, b) => s + b.totalOutstanding, 0);

  const handleVerify = async (pi: PurchaseInvoiceRecord) => {
    const { error } = await transitionPiLifecycle(pi.id, 'verified', user?.id);
    if (error) { toast({ title: 'Failed to verify', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Invoice verified', description: pi.invoiceNo });
    invalidate();
  };

  const handleApprove = async (pi: PurchaseInvoiceRecord) => {
    const { error } = await transitionPiLifecycle(pi.id, 'approved', user?.id);
    if (error) { toast({ title: 'Failed to approve', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Invoice approved', description: pi.invoiceNo });
    invalidate();
  };

  const openPayDialog = (pi: PurchaseInvoiceRecord) => {
    setPayTarget(pi);
    setPayAmount('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('');
    setPayRef('');
    setPayOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!payTarget || !payAmount) return;
    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    setPaying(true);
    const { error } = await recordSupplierPaymentEvent(payTarget.id, amount, payDate, {
      paymentMethod: payMethod || undefined,
      referenceNo: payRef || undefined,
    });
    setPaying(false);
    if (error) { toast({ title: 'Payment failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Payment recorded', description: `${payTarget.invoiceNo} — ${fmt(amount)}` });
    setPayOpen(false);
    invalidate();
  };

  const handleCreate = async () => {
    const amount = parseFloat(form.amount);
    const parsed = purchaseInvoiceSchema.safeParse({
      ...form,
      amount: Number.isFinite(amount) ? amount : undefined,
    });
    if (!parsed.success) {
      return toast({
        title: parsed.error.issues[0]?.message ?? 'Invalid input',
        variant: 'destructive',
      });
    }
    if (!user) return;
    setSaving(true);
    const { error } = await createPurchaseInvoice({
      companyId: user.company_id,
      actorId: user.id,
      invoiceNo: parsed.data.invoiceNo,
      supplier: parsed.data.supplier,
      chassisNo: parsed.data.chassisNo,
      model: parsed.data.model,
      invoiceDate: parsed.data.invoiceDate,
      amount: parsed.data.amount,
      remark: parsed.data.remark ?? null,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to create invoice', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Purchase invoice created', description: parsed.data.invoiceNo });
    setForm(EMPTY_FORM);
    setAddOpen(false);
    invalidate();
  };

  const markReceived = async (id: string) => {
    const prev = invoices.find(i => i.id === id);
    if (!prev) return;
    if (!user?.company_id) return;
    const { error } = await markPurchaseInvoiceReceived(id, {
      companyId: user.company_id,
      chassisNo: prev.chassisNo,
      model: prev.model,
      actorId: user.id,
    });
    if (error) {
      toast({ title: 'Failed to mark received', description: error.message, variant: 'destructive' });
      return;
    }
    invalidate();
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Purchase Invoices" description="CBU vehicle procurement invoices from suppliers"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Purchasing', path: '/purchasing/invoices' }, { label: 'Purchase Invoices' }]} />
        <TableSkeleton rows={8} cols={6} colWidths={['w-24','w-32','w-28','w-24','w-20','w-16']} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Purchase Invoices" description="CBU vehicle procurement invoices from suppliers"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Purchasing', path: '/purchasing/invoices' }, { label: 'Purchase Invoices' }]} />
        <PageErrorState title="Unable to load purchase invoices" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Purchase Invoices"
        description="CBU vehicle procurement invoices from suppliers"
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Purchasing', path: '/purchasing/invoices' }, { label: 'Purchase Invoices' }]}
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />New Invoice
          </Button>
        }
      />

      {/* AP Aging summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Outstanding (AP)</p>
          <p className="text-2xl font-bold text-foreground">{fmt(totalOutstanding)}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Due ≤ 30 Days</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{fmt(due30)}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Overdue 31–60 Days</p>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{fmt(overdue3160)}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Overdue 60+ Days</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{fmt(overdueOver60)}</p>
        </div>
      </div>

      <div className="glass-panel p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-40 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Invoice no, supplier, chassis…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-36 text-xs" aria-label="Purchase invoice status filter"><SelectValue placeholder="All Statuses" /></SelectTrigger>
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
                <th className="pb-2 pr-4 font-medium">Invoice Date</th>
                <th className="pb-2 pr-4 font-medium">Amount</th>
                <th className="pb-2 pr-4 font-medium">Paid</th>
                <th className="pb-2 pr-4 font-medium">Lifecycle</th>
                <th className="pb-2 pr-4 font-medium">Payment</th>
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
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{pi.invoiceDate}</td>
                    <td className="py-2 pr-4 text-xs font-medium">{fmt(pi.amount)}</td>
                    <td className="py-2 pr-4 text-xs">{fmt(pi.paidAmount)}</td>
                    <td className="py-2 pr-4">
                      <Badge className={`text-[10px] capitalize ${LIFECYCLE_BADGE[pi.lifecycleStatus]}`}>{pi.lifecycleStatus}</Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge className={`text-[10px] capitalize ${AP_PAYMENT_BADGE[pi.paymentStatus] ?? ''}`}>{pi.paymentStatus}</Badge>
                    </td>
                    <td className="py-2 flex items-center gap-1 flex-wrap">
                      {pi.status === 'pending' && (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-emerald-600" onClick={() => markReceived(pi.id)}>
                          <Truck className="h-3 w-3 mr-0.5" />Receive
                        </Button>
                      )}
                      {pi.lifecycleStatus === 'received' && (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-purple-600" onClick={() => handleVerify(pi)}>
                          <CheckCircle className="h-3 w-3 mr-0.5" />Verify
                        </Button>
                      )}
                      {pi.lifecycleStatus === 'verified' && (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-emerald-600" onClick={() => handleApprove(pi)}>
                          <ThumbsUp className="h-3 w-3 mr-0.5" />Approve
                        </Button>
                      )}
                      {(pi.lifecycleStatus === 'approved' || pi.lifecycleStatus === 'scheduled') && pi.paymentStatus !== 'paid' && (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-blue-600" onClick={() => openPayDialog(pi)}>
                          <CreditCard className="h-3 w-3 mr-0.5" />Pay
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

      {/* Record Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Record Supplier Payment</DialogTitle></DialogHeader>
          {payTarget && (
            <div className="space-y-1 mb-2 text-xs text-muted-foreground">
              <p><span className="font-medium text-foreground">{payTarget.invoiceNo}</span> — {payTarget.supplier}</p>
              <p>Invoice amount: {fmt(payTarget.amount)} | Paid: {fmt(payTarget.paidAmount)} | <span className="font-medium text-red-600">Outstanding: {fmt(payTarget.amount - payTarget.paidAmount)}</span></p>
            </div>
          )}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="pi-pay-amount" className="text-xs font-medium text-muted-foreground">Amount (RM) *</label>
                <Input id="pi-pay-amount" type="number" className="h-8 text-sm" placeholder="0.00" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label htmlFor="pi-pay-date" className="text-xs font-medium text-muted-foreground">Payment Date *</label>
                <Input id="pi-pay-date" type="date" className="h-8 text-sm" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="pi-pay-method" className="text-xs font-medium text-muted-foreground">Payment Method</label>
              <Input id="pi-pay-method" className="h-8 text-sm" placeholder="e.g. Bank Transfer, Cheque" value={payMethod} onChange={e => setPayMethod(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="pi-pay-ref" className="text-xs font-medium text-muted-foreground">Reference No</label>
              <Input id="pi-pay-ref" className="h-8 text-sm" placeholder="Cheque no / bank ref" value={payRef} onChange={e => setPayRef(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleRecordPayment} disabled={paying || !payAmount}>{paying ? 'Recording…' : 'Record Payment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Invoice Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Purchase Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="purchase-invoice-no" className="text-xs font-medium text-muted-foreground">Invoice No *</label>
                <Input id="purchase-invoice-no" className="h-8 text-sm" placeholder="e.g. PI-2026-001" value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label htmlFor="purchase-invoice-date" className="text-xs font-medium text-muted-foreground">Invoice Date *</label>
                <Input id="purchase-invoice-date" type="date" className="h-8 text-sm" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="purchase-invoice-supplier" className="text-xs font-medium text-muted-foreground">Supplier *</label>
              <Input id="purchase-invoice-supplier" className="h-8 text-sm" placeholder="e.g. Proton Edar Sdn Bhd" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="purchase-invoice-chassis-no" className="text-xs font-medium text-muted-foreground">Chassis No *</label>
                <Input id="purchase-invoice-chassis-no" className="h-8 text-sm uppercase" placeholder="e.g. PM00012345" value={form.chassisNo} onChange={e => setForm(f => ({ ...f, chassisNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label htmlFor="purchase-invoice-model" className="text-xs font-medium text-muted-foreground">Model *</label>
                <Input id="purchase-invoice-model" className="h-8 text-sm" placeholder="e.g. X50 1.5T Premium" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="purchase-invoice-amount" className="text-xs font-medium text-muted-foreground">Amount (RM) *</label>
              <Input id="purchase-invoice-amount" type="number" className="h-8 text-sm" placeholder="e.g. 85000.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label htmlFor="purchase-invoice-remark" className="text-xs font-medium text-muted-foreground">Remark</label>
              <Input id="purchase-invoice-remark" className="h-8 text-sm" placeholder="Optional note" value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
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
