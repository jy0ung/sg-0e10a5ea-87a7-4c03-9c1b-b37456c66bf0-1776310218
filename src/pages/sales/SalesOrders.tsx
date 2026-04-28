import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useSales } from '@/contexts/SalesContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { createSalesOrder, createVehicleFromSalesOrder } from '@/services/salesOrderService';
import { SalesOrder, SalesOrderStatus } from '@/types';
import { Plus, Search, Link2, ChevronRight } from 'lucide-react';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { salesOrderSchema } from '@/lib/validations';

const STATUS_COLORS: Record<SalesOrderStatus, string> = {
  enquiry: 'bg-secondary text-secondary-foreground',
  quoted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  confirmed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  booked: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const STATUSES: SalesOrderStatus[] = ['enquiry','quoted','confirmed','booked','delivered','cancelled'];

export default function SalesOrders() {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const { salesOrders, customers, reloadSales, loading } = useSales();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkOrder, setLinkOrder] = useState<SalesOrder | null>(null);
  const [chassisNo, setChassisNo] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ orderNo: '', customerId: '', branchCode: '', salesmanName: '', model: '', variant: '', colour: '', bookingDate: new Date().toISOString().split('T')[0], bookingAmount: '', totalPrice: '', status: 'enquiry' as SalesOrderStatus, vsoNo: '', depositAmount: '', bankLoanAmount: '', financeCompany: '', insuranceCompany: '', plateNo: '' });

  const filtered = salesOrders.filter(o =>
    (statusFilter === 'all' || o.status === statusFilter) &&
    [o.orderNo, o.customerName, o.model, o.branchCode, o.salesmanName].join(' ').toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    const result = salesOrderSchema.safeParse({
      orderNo:      form.orderNo,
      customerId:   form.customerId,
      model:        form.model,
      branchCode:   form.branchCode || undefined,
      salesmanName: form.salesmanName || undefined,
      variant:      form.variant || undefined,
      colour:       form.colour || undefined,
      bookingDate:  form.bookingDate,
      bookingAmount: form.bookingAmount ? parseFloat(form.bookingAmount) : undefined,
      totalPrice:   form.totalPrice ? parseFloat(form.totalPrice) : undefined,
      status:       form.status,
      vsoNo:        form.vsoNo || undefined,
      depositAmount: form.depositAmount ? parseFloat(form.depositAmount) : undefined,
      bankLoanAmount: form.bankLoanAmount ? parseFloat(form.bankLoanAmount) : undefined,
      financeCompany: form.financeCompany || undefined,
      insuranceCompany: form.insuranceCompany || undefined,
      plateNo:      form.plateNo || undefined,
    });
    if (!result.success) {
      const first = result.error.errors[0];
      return toast({ title: first.message, variant: 'destructive' });
    }
    setCreating(true);
    const customer = customers.find(c => c.id === form.customerId);
    const { error } = await createSalesOrder(companyId, {
      orderNo: form.orderNo,
      customerId: form.customerId,
      customerName: customer?.name,
      branchCode: form.branchCode,
      salesmanName: form.salesmanName || undefined,
      model: form.model,
      variant: form.variant || undefined,
      colour: form.colour || undefined,
      bookingDate: form.bookingDate,
      bookingAmount: form.bookingAmount ? parseFloat(form.bookingAmount) : undefined,
      totalPrice: form.totalPrice ? parseFloat(form.totalPrice) : undefined,
      status: form.status,
      vsoNo: form.vsoNo || undefined,
      depositAmount: form.depositAmount ? parseFloat(form.depositAmount) : undefined,
      bankLoanAmount: form.bankLoanAmount ? parseFloat(form.bankLoanAmount) : undefined,
      financeCompany: form.financeCompany || undefined,
      insuranceCompany: form.insuranceCompany || undefined,
      plateNo: form.plateNo || undefined,
    }, user?.id);
    setCreating(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await reloadSales();
    setAddOpen(false);
    toast({ title: 'Order created' });
  };

  const handleLinkVehicle = async () => {
    if (!linkOrder || !chassisNo.trim()) return toast({ title: 'Chassis No is required', variant: 'destructive' });
    setCreating(true);
    const { error } = await createVehicleFromSalesOrder(linkOrder.id, chassisNo.trim(), user?.id ?? '', companyId);
    setCreating(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await reloadSales();
    setLinkOpen(false);
    setChassisNo('');
    toast({ title: 'Vehicle BG entry created', description: `Chassis: ${chassisNo}` });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Sales Orders"
        description="Track orders from enquiry to delivery"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Sales' }, { label: 'Orders' }]}
        actions={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" />New Order</Button>}
      />

      {loading ? (
        <TableSkeleton rows={8} cols={9} colWidths={['w-24','w-24','w-28','w-24','w-20','w-24','w-20','w-20','w-16']} />
      ) : (
      <div className="glass-panel p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-40 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Search orders…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} orders</span>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Order No</th>
                <th className="pb-2 pr-4 font-medium">VSO No</th>
                <th className="pb-2 pr-4 font-medium">Customer</th>
                <th className="pb-2 pr-4 font-medium">Model</th>
                <th className="pb-2 pr-4 font-medium">Branch</th>
                <th className="pb-2 pr-4 font-medium">Booking Date</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Chassis</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="py-2 pr-4 font-mono text-xs font-medium">{o.orderNo}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{o.vsoNo ?? '—'}</td>
                  <td className="py-2 pr-4">{o.customerName ?? '—'}</td>
                  <td className="py-2 pr-4">{o.model}{o.variant ? ` / ${o.variant}` : ''}</td>
                  <td className="py-2 pr-4">{o.branchCode}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{o.bookingDate}</td>
                  <td className="py-2 pr-4"><span className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${STATUS_COLORS[o.status]}`}>{o.status}</span></td>
                  <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{o.chassisNo ?? '—'}</td>
                  <td className="py-2 text-right">
                    {!o.vehicleId && (o.status === 'confirmed' || o.status === 'booked') && (
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => { setLinkOrder(o); setLinkOpen(true); }}>
                        <Link2 className="h-3 w-3 mr-1" />Create BG
                      </Button>
                    )}
                    {o.vehicleId && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600">BG Linked</Badge>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground text-xs">No orders found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* New Order Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Sales Order</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {[
              { field: 'orderNo', label: 'Order No *' },
              { field: 'branchCode', label: 'Branch Code *' },
              { field: 'model', label: 'Model *' },
              { field: 'variant', label: 'Variant' },
              { field: 'colour', label: 'Colour' },
              { field: 'salesmanName', label: 'Salesman' },
              { field: 'bookingDate', label: 'Booking Date', type: 'date' },
              { field: 'bookingAmount', label: 'Booking Amt', type: 'number' },
              { field: 'totalPrice', label: 'Total Price', type: 'number' },
              { field: 'vsoNo', label: 'VSO No' },
              { field: 'depositAmount', label: 'Deposit Amt', type: 'number' },
              { field: 'bankLoanAmount', label: 'Bank Loan', type: 'number' },
              { field: 'financeCompany', label: 'Finance Co' },
              { field: 'insuranceCompany', label: 'Insurance Co' },
              { field: 'plateNo', label: 'Plate No' },
            ].map(({ field, label, type }) => (
              <div key={field} className="space-y-1">
                <label htmlFor={`sales-order-${field}`} className="text-xs text-muted-foreground">{label}</label>
                <Input id={`sales-order-${field}`} type={type ?? 'text'} className="h-8 text-sm" value={form[field as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <label htmlFor="sales-order-customer" className="text-xs text-muted-foreground">Customer *</label>
              <Select value={form.customerId} onValueChange={v => setForm(f => ({ ...f, customerId: v }))}>
                <SelectTrigger id="sales-order-customer" className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="sales-order-status" className="text-xs text-muted-foreground">Status</label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as SalesOrderStatus }))}>
                <SelectTrigger id="sales-order-status" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link BG Dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create Auto Aging BG Entry</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Order: {linkOrder?.orderNo} — {linkOrder?.model}</p>
          <div className="space-y-2 py-2">
            <label htmlFor="sales-order-bg-chassis-no" className="text-xs font-medium text-muted-foreground">Chassis Number *</label>
            <Input id="sales-order-bg-chassis-no" className="h-8 text-sm font-mono" placeholder="e.g. PM00A1234" value={chassisNo} onChange={e => setChassisNo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={handleLinkVehicle} disabled={creating}>{creating ? 'Creating…' : 'Create BG Entry'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
