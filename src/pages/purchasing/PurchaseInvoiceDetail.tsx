import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft, CheckCircle, ThumbsUp, CreditCard, Loader2, Pencil, Truck, RotateCcw, Link2, AlertTriangle,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import {
  getPurchaseInvoiceById,
  markPurchaseInvoiceReceived,
  updatePurchaseInvoice,
} from '@/services/purchaseInvoiceService';
import {
  getSupplierPaymentEvents,
  recordSupplierPaymentEvent,
  reverseSupplierPaymentEvent,
  transitionPiLifecycle,
} from '@/services/apService';
import { purchaseInvoiceSchema } from '@/lib/validations';
import type { PurchaseInvoiceLifecycleStatus } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const LIFECYCLE_STEPS: PurchaseInvoiceLifecycleStatus[] = ['received', 'verified', 'approved', 'paid'];

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

function fmt(n: number) {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const EMPTY_EDIT = { invoiceNo: '', supplier: '', chassisNo: '', model: '', invoiceDate: '', amount: '', remark: '' };

// ── Component ─────────────────────────────────────────────────────────────────

export default function PurchaseInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const companyId = useCompanyId();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Payment dialog
  const [payOpen, setPayOpen]     = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate]     = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState('');
  const [payRef, setPayRef]       = useState('');
  const [paying, setPaying]       = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [saving, setSaving]     = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-invoice', companyId, id] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-invoice-events', id] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-invoices', companyId] });
    void queryClient.invalidateQueries({ queryKey: ['ap-aging', companyId] });
  };

  // ── Queries ──────────────────────────────────────────────────────────────────

  const {
    data: invoice,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['purchase-invoice', companyId, id],
    queryFn: async () => {
      if (!companyId || !id) throw new Error('Missing params');
      const result = await getPurchaseInvoiceById(companyId, id);
      if (!result) throw new Error('Invoice not found');
      return result;
    },
    enabled: !!companyId && !!id,
    staleTime: 15_000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['purchase-invoice-events', id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await getSupplierPaymentEvents(id);
      return data;
    },
    enabled: !!id,
    staleTime: 15_000,
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleReceive = async () => {
    if (!invoice || !user?.company_id) return;
    const { error: err } = await markPurchaseInvoiceReceived(invoice.id, {
      companyId: user.company_id,
      chassisNo: invoice.chassisNo,
      model: invoice.model,
      actorId: user.id,
    });
    if (err) { toast({ title: 'Failed to mark received', description: err.message, variant: 'destructive' }); return; }
    toast({ title: 'Invoice marked received' });
    invalidate();
  };

  const handleVerify = async () => {
    if (!invoice) return;
    const { error: err } = await transitionPiLifecycle(invoice.id, 'verified', user?.id);
    if (err) { toast({ title: 'Failed to verify', description: err.message, variant: 'destructive' }); return; }
    toast({ title: 'Invoice verified', description: invoice.invoiceNo });
    invalidate();
  };

  const handleApprove = async () => {
    if (!invoice) return;
    const { error: err } = await transitionPiLifecycle(invoice.id, 'approved', user?.id);
    if (err) { toast({ title: 'Failed to approve', description: err.message, variant: 'destructive' }); return; }
    toast({ title: 'Invoice approved', description: invoice.invoiceNo });
    invalidate();
  };

  const openPayDialog = () => {
    setPayAmount('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('');
    setPayRef('');
    setPayOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!invoice || !payAmount) return;
    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    setPaying(true);
    const { error: err } = await recordSupplierPaymentEvent(invoice.id, amount, payDate, {
      paymentMethod: payMethod || undefined,
      referenceNo: payRef || undefined,
    });
    setPaying(false);
    if (err) { toast({ title: 'Payment failed', description: err.message, variant: 'destructive' }); return; }
    toast({ title: 'Payment recorded', description: `${invoice.invoiceNo} — ${fmt(amount)}` });
    setPayOpen(false);
    invalidate();
  };

  const handleReverse = async (eventId: string) => {
    const { error: err } = await reverseSupplierPaymentEvent(eventId);
    if (err) { toast({ title: 'Reversal failed', description: err.message, variant: 'destructive' }); return; }
    toast({ title: 'Payment reversed' });
    invalidate();
  };

  const openEditDialog = () => {
    if (!invoice) return;
    setEditForm({
      invoiceNo:   invoice.invoiceNo,
      supplier:    invoice.supplier,
      chassisNo:   invoice.chassisNo,
      model:       invoice.model,
      invoiceDate: invoice.invoiceDate,
      amount:      String(invoice.amount),
      remark:      invoice.remark ?? '',
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!invoice) return;
    const amount = parseFloat(editForm.amount);
    const parsed = purchaseInvoiceSchema.safeParse({
      ...editForm,
      amount: Number.isFinite(amount) ? amount : undefined,
    });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0]?.message ?? 'Invalid input', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error: err } = await updatePurchaseInvoice(companyId, invoice.id, {
      ...parsed.data,
      actorId: user?.id,
    });
    setSaving(false);
    if (err) { toast({ title: 'Update failed', description: err.message, variant: 'destructive' }); return; }
    toast({ title: 'Invoice updated' });
    setEditOpen(false);
    invalidate();
  };

  // ── Loading / error states ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-4 animate-fade-in">
        <PageHeader
          title="Invoice Not Found"
          breadcrumbs={[
            { label: 'FLC BI', path: '/' },
            { label: 'Purchasing', path: '/purchasing/invoices' },
            { label: 'Purchase Invoices', path: '/purchasing/invoices' },
            { label: 'Not Found' },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : 'Invoice could not be loaded.'}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/purchasing/invoices')}>
            <ArrowLeft className="h-4 w-4 mr-1" />Back to list
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const outstanding  = invoice.amount - invoice.paidAmount;
  const isEditable   = invoice.lifecycleStatus !== 'paid' && invoice.lifecycleStatus !== 'cancelled';
  const stepIndex    = LIFECYCLE_STEPS.indexOf(invoice.lifecycleStatus as PurchaseInvoiceLifecycleStatus);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 animate-fade-in">
      <PageHeader
        title={invoice.invoiceNo}
        description={`${invoice.supplier} · ${invoice.chassisNo}`}
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Purchasing', path: '/purchasing/invoices' },
          { label: 'Purchase Invoices', path: '/purchasing/invoices' },
          { label: invoice.invoiceNo },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/purchasing/invoices')}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
            {isEditable && (
              <Button variant="outline" size="sm" onClick={openEditDialog}>
                <Pencil className="h-4 w-4 mr-1" />Edit
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Invoice Details ─────────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Invoice Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Invoice No</dt>
                <dd className="font-mono font-medium">{invoice.invoiceNo}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Supplier</dt>
                <dd>{invoice.supplier}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Invoice Date</dt>
                <dd className="tabular-nums">{invoice.invoiceDate}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Chassis No</dt>
                <dd className="font-mono">{invoice.chassisNo}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Model</dt>
                <dd>{invoice.model}</dd>
              </div>
              {invoice.dueDate && (
                <div>
                  <dt className="text-xs text-muted-foreground">Due Date</dt>
                  <dd className="tabular-nums">{invoice.dueDate}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Invoice Amount</dt>
                <dd className="font-semibold tabular-nums">{fmt(invoice.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Paid</dt>
                <dd className="tabular-nums text-emerald-700 dark:text-emerald-400">{fmt(invoice.paidAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Outstanding</dt>
                <dd className={`font-semibold tabular-nums ${outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                  {fmt(outstanding)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Lifecycle</dt>
                <dd>
                  <Badge className={`text-[10px] capitalize ${LIFECYCLE_BADGE[invoice.lifecycleStatus]}`}>
                    {invoice.lifecycleStatus}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Payment</dt>
                <dd>
                  <Badge className={`text-[10px] capitalize ${AP_PAYMENT_BADGE[invoice.paymentStatus] ?? ''}`}>
                    {invoice.paymentStatus}
                  </Badge>
                </dd>
              </div>
              {invoice.remark && (
                <div className="col-span-full">
                  <dt className="text-xs text-muted-foreground">Remark</dt>
                  <dd className="text-sm">{invoice.remark}</dd>
                </div>
              )}
              {invoice.notes && (
                <div className="col-span-full">
                  <dt className="text-xs text-muted-foreground">Notes</dt>
                  <dd className="text-sm">{invoice.notes}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* ── PO Reference ─────────────────────────────────────────────── */}
        {invoice.poLineId && (
          <Card className={invoice.poNo && invoice.amount && invoice.poUnitPrice && Math.abs(invoice.amount - invoice.poUnitPrice) > 1 ? 'border-warning' : ''}>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5" />
                Purchase Order Reference
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">PO Number</dt>
                  <dd className="text-sm font-medium">
                    {invoice.poNo ? (
                      <Button variant="link" className="h-auto p-0" onClick={() => navigate(`/purchasing/orders/${invoice.poLineId?.split('-')[0] || ''}`)}>
                        {invoice.poNo}
                      </Button>
                    ) : '—'}
                  </dd>
                </div>
                {invoice.poQuantity != null && (
                  <div>
                    <dt className="text-xs text-muted-foreground">PO Quantity</dt>
                    <dd className="text-sm">{invoice.poQuantity}</dd>
                  </div>
                )}
                {invoice.poUnitPrice != null && (
                  <div>
                    <dt className="text-xs text-muted-foreground">PO Unit Price</dt>
                    <dd className="text-sm">{fmt(invoice.poUnitPrice)}</dd>
                  </div>
                )}
                {invoice.poUnitPrice != null && invoice.amount != null && Math.abs(invoice.amount - invoice.poUnitPrice) > 1 && (
                  <div className="col-span-full">
                    <div className="flex items-center gap-2 p-2 rounded bg-warning/10 text-warning">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <p className="text-xs">
                        Amount mismatch: Invoice {fmt(invoice.amount)} vs PO {fmt(invoice.poUnitPrice)} (diff: {fmt(Math.abs(invoice.amount - invoice.poUnitPrice))})
                      </p>
                    </div>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* ── AP Lifecycle + Actions ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              AP Lifecycle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Lifecycle stepper */}
            <ol className="space-y-2">
              {LIFECYCLE_STEPS.map((step, i) => {
                const done   = stepIndex > i;
                const active = step === invoice.lifecycleStatus;
                return (
                  <li
                    key={step}
                    className={`flex items-center gap-2 text-sm ${
                      done ? 'text-emerald-600 dark:text-emerald-400' :
                      active ? 'font-semibold text-foreground' :
                      'text-muted-foreground'
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                      done   ? 'border-emerald-500 bg-emerald-500 text-white' :
                      active ? 'border-primary bg-primary text-white' :
                               'border-muted-foreground/30'
                    }`}>
                      {done ? '✓' : i + 1}
                    </span>
                    <span className="capitalize">{step}</span>
                    {active && (
                      <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        Current
                      </span>
                    )}
                  </li>
                );
              })}
              {invoice.lifecycleStatus === 'cancelled' && (
                <li className="flex items-center gap-2 text-sm text-destructive">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-destructive bg-destructive text-white text-[10px] font-bold">
                    ✗
                  </span>
                  <span>Cancelled</span>
                  <span className="ml-auto rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                    Current
                  </span>
                </li>
              )}
            </ol>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 border-t pt-3">
              {invoice.status === 'pending' && (
                <Button size="sm" variant="outline" className="w-full gap-1.5 text-emerald-600" onClick={handleReceive}>
                  <Truck className="h-3.5 w-3.5" />Mark as Received
                </Button>
              )}
              {invoice.lifecycleStatus === 'received' && (
                <Button size="sm" variant="outline" className="w-full gap-1.5 text-purple-600" onClick={handleVerify}>
                  <CheckCircle className="h-3.5 w-3.5" />Verify Invoice
                </Button>
              )}
              {invoice.lifecycleStatus === 'verified' && (
                <Button size="sm" variant="outline" className="w-full gap-1.5 text-emerald-600" onClick={handleApprove}>
                  <ThumbsUp className="h-3.5 w-3.5" />Approve Invoice
                </Button>
              )}
              {(invoice.lifecycleStatus === 'approved' || invoice.lifecycleStatus === 'scheduled') && invoice.paymentStatus !== 'paid' && (
                <Button size="sm" className="w-full gap-1.5" onClick={openPayDialog}>
                  <CreditCard className="h-3.5 w-3.5" />Record Payment
                </Button>
              )}
            </div>

            {/* Audit timestamps */}
            {(invoice.verifiedAt || invoice.approvedAt) && (
              <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
                {invoice.verifiedAt && (
                  <p>Verified {formatDistanceToNow(new Date(invoice.verifiedAt), { addSuffix: true })}</p>
                )}
                {invoice.approvedAt && (
                  <p>Approved {formatDistanceToNow(new Date(invoice.approvedAt), { addSuffix: true })}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Payment Ledger ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Payment Ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No payment events recorded yet.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pl-6 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 pr-4 font-medium">Amount</th>
                  <th className="pb-2 pr-4 font-medium">Method</th>
                  <th className="pb-2 pr-4 font-medium">Reference</th>
                  <th className="pb-2 pr-4 font-medium">Recorded</th>
                  <th className="pb-2 pr-6 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    className={`border-b border-border/40 ${event.isReversed ? 'opacity-40 line-through' : ''}`}
                  >
                    <td className="py-2.5 pl-6 pr-4 tabular-nums text-xs">{event.paymentDate}</td>
                    <td className="py-2.5 pr-4">
                      <Badge
                        variant={event.eventType === 'reversal' ? 'destructive' : 'secondary'}
                        className="text-[10px] capitalize"
                      >
                        {event.eventType}
                      </Badge>
                    </td>
                    <td className={`py-2.5 pr-4 tabular-nums text-xs font-medium ${
                      event.eventType === 'reversal' ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'
                    }`}>
                      {event.eventType === 'reversal' ? '−' : '+'}{fmt(event.amount)}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">{event.paymentMethod ?? '—'}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{event.referenceNo ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                    </td>
                    <td className="py-2.5 pr-6">
                      {event.eventType === 'payment' && !event.isReversed && invoice.lifecycleStatus !== 'paid' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[10px] text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => handleReverse(event.id)}
                        >
                          <RotateCcw className="h-3 w-3 mr-0.5" />Reverse
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ── Record Payment Dialog ──────────────────────────────────────────── */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Supplier Payment</DialogTitle>
          </DialogHeader>
          <div className="mb-2 space-y-0.5 text-xs text-muted-foreground">
            <p><span className="font-medium text-foreground">{invoice.invoiceNo}</span> — {invoice.supplier}</p>
            <p>
              Invoice: {fmt(invoice.amount)} · Paid: {fmt(invoice.paidAmount)} ·{' '}
              <span className="font-medium text-red-600">Outstanding: {fmt(outstanding)}</span>
            </p>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="pi-pay-amount" className="text-xs font-medium text-muted-foreground">Amount (RM) *</label>
                <Input id="pi-pay-amount" type="number" className="h-8 text-sm" placeholder="0.00"
                  value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label htmlFor="pi-pay-date" className="text-xs font-medium text-muted-foreground">Payment Date *</label>
                <Input id="pi-pay-date" type="date" className="h-8 text-sm"
                  value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="pi-pay-method" className="text-xs font-medium text-muted-foreground">Payment Method</label>
              <Input id="pi-pay-method" className="h-8 text-sm" placeholder="e.g. Bank Transfer, Cheque"
                value={payMethod} onChange={e => setPayMethod(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="pi-pay-ref" className="text-xs font-medium text-muted-foreground">Reference No</label>
              <Input id="pi-pay-ref" className="h-8 text-sm" placeholder="Cheque no / bank ref"
                value={payRef} onChange={e => setPayRef(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleRecordPayment} disabled={paying || !payAmount}>
              {paying ? 'Recording…' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Purchase Invoice</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="pi-edit-no" className="text-xs font-medium text-muted-foreground">Invoice No *</label>
                <Input id="pi-edit-no" className="h-8 text-sm"
                  value={editForm.invoiceNo} onChange={e => setEditForm(f => ({ ...f, invoiceNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label htmlFor="pi-edit-date" className="text-xs font-medium text-muted-foreground">Invoice Date *</label>
                <Input id="pi-edit-date" type="date" className="h-8 text-sm"
                  value={editForm.invoiceDate} onChange={e => setEditForm(f => ({ ...f, invoiceDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="pi-edit-supplier" className="text-xs font-medium text-muted-foreground">Supplier *</label>
              <Input id="pi-edit-supplier" className="h-8 text-sm"
                value={editForm.supplier} onChange={e => setEditForm(f => ({ ...f, supplier: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="pi-edit-chassis" className="text-xs font-medium text-muted-foreground">Chassis No *</label>
                <Input id="pi-edit-chassis" className="h-8 text-sm"
                  value={editForm.chassisNo} onChange={e => setEditForm(f => ({ ...f, chassisNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label htmlFor="pi-edit-model" className="text-xs font-medium text-muted-foreground">Model *</label>
                <Input id="pi-edit-model" className="h-8 text-sm"
                  value={editForm.model} onChange={e => setEditForm(f => ({ ...f, model: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="pi-edit-amount" className="text-xs font-medium text-muted-foreground">Amount (RM) *</label>
              <Input id="pi-edit-amount" type="number" className="h-8 text-sm"
                value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label htmlFor="pi-edit-remark" className="text-xs font-medium text-muted-foreground">Remark</label>
              <Input id="pi-edit-remark" className="h-8 text-sm"
                value={editForm.remark} onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
