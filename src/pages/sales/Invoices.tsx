import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useSales } from '@/contexts/SalesContext';
import { createInvoice, recordPayment } from '@/services/invoiceService';
import { Invoice, InvoicePaymentStatus, InvoiceType } from '@/types';
import { Plus, CreditCard } from 'lucide-react';
import { TableSkeleton } from '@/components/shared/TableSkeleton';

const STATUS_BADGE: Record<InvoicePaymentStatus, string> = {
  unpaid: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const TYPE_LABELS: Record<InvoiceType, string> = {
  customer_sales: 'Customer Sales',
  dealer_sales: 'Dealer Sales',
  purchase: 'Purchase',
};

function InvoiceTable({ invoices, onPay }: { invoices: Invoice[]; onPay: (inv: Invoice) => void }) {
  return (
    <div className="glass-panel overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {['Invoice No','Customer','Issue Date','Due Date','Total','Paid','Status',''].map(h => (
              <th key={h} className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.map(inv => (
            <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
              <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNo}</td>
              <td className="px-3 py-2">{inv.customerName ?? '—'}</td>
              <td className="px-3 py-2 text-muted-foreground">{inv.issueDate}</td>
              <td className="px-3 py-2 text-muted-foreground">{inv.dueDate ?? '—'}</td>
              <td className="px-3 py-2 font-medium">RM {inv.totalAmount.toLocaleString()}</td>
              <td className="px-3 py-2 text-muted-foreground">RM {(inv.paidAmount ?? 0).toLocaleString()}</td>
              <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${STATUS_BADGE[inv.paymentStatus]}`}>{inv.paymentStatus}</span></td>
              <td className="px-3 py-2 text-right">
                {inv.paymentStatus !== 'paid' && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onPay(inv)}>
                    <CreditCard className="h-3.5 w-3.5 mr-1" />Pay
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {invoices.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">No invoices</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function Invoices() {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const { invoices, customers, salesOrders, reloadSales, loading } = useSales();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ invoiceNo: '', salesOrderId: '', customerId: '', issueDate: new Date().toISOString().split('T')[0], dueDate: '', subtotal: '', taxAmount: '', discountAmount: '', notes: '', invoiceType: 'customer_sales' as InvoiceType });

  const totalRevenue = invoices.filter(i => i.paymentStatus === 'paid').reduce((s, i) => s + i.totalAmount, 0);
  const outstanding = invoices.filter(i => i.paymentStatus !== 'paid').reduce((s, i) => s + (i.totalAmount - (i.paidAmount ?? 0)), 0);

  const byType = (type: InvoiceType) => invoices.filter(i => (i.invoiceType ?? 'customer_sales') === type);

  const handleCreate = async () => {
    if (!form.invoiceNo || !form.salesOrderId || !form.customerId || !form.subtotal) return toast({ title: 'Required fields missing', variant: 'destructive' });
    setSaving(true);
    const subtotal = parseFloat(form.subtotal);
    const tax = form.taxAmount ? parseFloat(form.taxAmount) : 0;
    const discount = form.discountAmount ? parseFloat(form.discountAmount) : 0;
    const total = subtotal + tax - discount;
    const customer = customers.find(c => c.id === form.customerId);
    const { error } = await createInvoice(companyId, {
      invoiceNo: form.invoiceNo,
      salesOrderId: form.salesOrderId,
      customerId: form.customerId,
      customerName: customer?.name,
      issueDate: form.issueDate,
      dueDate: form.dueDate || undefined,
      subtotal,
      taxAmount: tax || undefined,
      discountAmount: discount || undefined,
      totalAmount: total,
      paidAmount: 0,
      paymentStatus: 'unpaid',
      notes: form.notes || undefined,
      invoiceType: form.invoiceType,
    });
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await reloadSales();
    setAddOpen(false);
    toast({ title: 'Invoice created' });
  };

  const handlePay = async () => {
    if (!payTarget || !payAmount) return;
    setSaving(true);
    const { error } = await recordPayment(payTarget.id, parseFloat(payAmount));
    setSaving(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await reloadSales();
    setPayOpen(false);
    toast({ title: 'Payment recorded' });
  };

  const openPay = (inv: Invoice) => { setPayTarget(inv); setPayAmount(''); setPayOpen(true); };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Invoices"
        description="Track invoices and payment status"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Sales' }, { label: 'Invoices' }]}
        actions={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" />New Invoice</Button>}
      />

      {loading ? (
        <TableSkeleton rows={8} cols={7} colWidths={['w-28','w-32','w-20','w-20','w-24','w-20','w-16']} />
      ) : (<>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Collected', value: `RM ${totalRevenue.toLocaleString()}`, color: 'text-emerald-500' },
          { label: 'Outstanding', value: `RM ${outstanding.toLocaleString()}`, color: 'text-red-500' },
          { label: 'Total Invoices', value: invoices.length, color: 'text-foreground' },
        ].map(k => (
          <div key={k.label} className="glass-panel p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="customer_sales">
        <TabsList>
          <TabsTrigger value="customer_sales">Customer Sales ({byType('customer_sales').length})</TabsTrigger>
          <TabsTrigger value="dealer_sales">Dealer Sales ({byType('dealer_sales').length})</TabsTrigger>
          <TabsTrigger value="purchase">Purchase ({byType('purchase').length})</TabsTrigger>
        </TabsList>
        <TabsContent value="customer_sales" className="mt-4"><InvoiceTable invoices={byType('customer_sales')} onPay={openPay} /></TabsContent>
        <TabsContent value="dealer_sales" className="mt-4"><InvoiceTable invoices={byType('dealer_sales')} onPay={openPay} /></TabsContent>
        <TabsContent value="purchase" className="mt-4"><InvoiceTable invoices={byType('purchase')} onPay={openPay} /></TabsContent>
      </Tabs>
      </>)}

      {/* New Invoice Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-muted-foreground">Invoice Type *</label>
              <Select value={form.invoiceType} onValueChange={v => setForm(f => ({ ...f, invoiceType: v as InvoiceType }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_sales">Customer Sales</SelectItem>
                  <SelectItem value="dealer_sales">Dealer Sales</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {[
              { field: 'invoiceNo', label: 'Invoice No *' },
              { field: 'issueDate', label: 'Issue Date *', type: 'date' },
              { field: 'dueDate', label: 'Due Date', type: 'date' },
              { field: 'subtotal', label: 'Subtotal *', type: 'number' },
              { field: 'taxAmount', label: 'Tax', type: 'number' },
              { field: 'discountAmount', label: 'Discount', type: 'number' },
            ].map(({ field, label, type }) => (
              <div key={field} className="space-y-1">
                <label className="text-xs text-muted-foreground">{label}</label>
                <Input type={type ?? 'text'} className="h-8 text-sm" value={form[field as keyof typeof form] as string} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Sales Order *</label>
              <Select value={form.salesOrderId} onValueChange={v => { const o = salesOrders.find(s => s.id === v); setForm(f => ({ ...f, salesOrderId: v, customerId: o?.customerId ?? f.customerId })); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{salesOrders.map(o => <SelectItem key={o.id} value={o.id}>{o.orderNo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Customer *</label>
              <Select value={form.customerId} onValueChange={v => setForm(f => ({ ...f, customerId: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-muted-foreground">Notes</label>
              <Input className="h-8 text-sm" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Invoice: {payTarget?.invoiceNo} — Outstanding: RM {((payTarget?.totalAmount ?? 0) - (payTarget?.paidAmount ?? 0)).toLocaleString()}</p>
          <div className="space-y-2 py-2">
            <label className="text-xs font-medium text-muted-foreground">Amount Paid *</label>
            <Input type="number" className="h-8 text-sm" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={handlePay} disabled={saving}>{saving ? 'Saving…' : 'Record Payment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


