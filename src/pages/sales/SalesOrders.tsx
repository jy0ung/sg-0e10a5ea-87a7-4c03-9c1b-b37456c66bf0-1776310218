import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useSales } from '@/contexts/SalesContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { createSalesOrder, linkExistingVehicle, unlinkExistingVehicle } from '@/services/salesOrderService';
import { searchVehicles } from '@/services/vehicleService';
import { SalesOrder, SalesOrderStatus, VehicleCanonical } from '@/types';
import { Loader2, Plus, Search, Link2, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MobileCardList } from '@/components/shared/MobileCardList';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
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
  const { salesOrders, customers, invoices, reloadSales, loading } = useSales();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkOrder, setLinkOrder] = useState<SalesOrder | null>(null);
  const [chassisNo, setChassisNo] = useState('');
  const [vehicleResults, setVehicleResults] = useState<VehicleCanonical[]>([]);
  const [vehicleSearchLoading, setVehicleSearchLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<SalesOrder | null>(null);
  const [form, setForm] = useState({ orderNo: '', customerId: '', branchCode: '', salesmanName: '', model: '', variant: '', colour: '', bookingDate: new Date().toISOString().split('T')[0], bookingAmount: '', totalPrice: '', status: 'enquiry' as SalesOrderStatus, vsoNo: '', depositAmount: '', bankLoanAmount: '', financeCompany: '', insuranceCompany: '', plateNo: '' });

  const filtered = salesOrders.filter(o =>
    (statusFilter === 'all' || o.status === statusFilter) &&
    [o.orderNo, o.customerName, o.model, o.branchCode, o.salesmanName].join(' ').toLowerCase().includes(search.toLowerCase())
  );

  const invoicedOrderIds = new Set(invoices.map(inv => inv.salesOrderId).filter(Boolean));

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

  const openLinkDialog = (order: SalesOrder) => {
    setLinkOrder(order);
    setChassisNo(order.chassisNo ?? '');
    setVehicleResults([]);
    setLinkOpen(true);
  };

  const handleVehicleSearch = async () => {
    if (!chassisNo.trim()) return toast({ title: 'Search text is required', variant: 'destructive' });
    setVehicleSearchLoading(true);
    const { data, error } = await searchVehicles({ search: chassisNo.trim(), limit: 8, sortColumn: 'chassis_no', sortDirection: 'asc' });
    setVehicleSearchLoading(false);
    if (error) return toast({ title: 'Vehicle search failed', description: error.message, variant: 'destructive' });
    setVehicleResults(data.rows);
    if (data.rows.length === 0) toast({ title: 'No matching vehicles found' });
  };

  const handleLinkVehicle = async (vehicle?: VehicleCanonical) => {
    const targetChassis = vehicle?.chassis_no ?? chassisNo.trim();
    if (!linkOrder || !targetChassis) return toast({ title: 'Chassis No is required', variant: 'destructive' });
    setCreating(true);
    const { error } = await linkExistingVehicle(companyId, {
      orderId: linkOrder.id,
      chassisNo: targetChassis,
      vehicleId: vehicle?.id ?? null,
    }, user?.id);
    setCreating(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await reloadSales();
    setLinkOpen(false);
    setChassisNo('');
    setVehicleResults([]);
    toast({ title: 'Vehicle linked', description: `Chassis: ${targetChassis}` });
  };

  const handleUnlinkVehicle = async (order: SalesOrder) => {
    if (!order.vehicleId) return;
    setCreating(true);
    const { error } = await unlinkExistingVehicle(companyId, order.id, user?.id);
    setCreating(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await reloadSales();
    setUnlinkTarget(null);
    toast({ title: 'Vehicle unlinked', description: order.chassisNo ? `Chassis: ${order.chassisNo}` : undefined });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 animate-fade-in">
      <PageHeader
        title="Sales Orders"
        description="Track orders from enquiry to delivery"
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Sales', path: '/sales' }, { label: 'Orders' }]}
        actions={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" />New Order</Button>}
      />

      {loading ? (
        <TableSkeleton rows={8} cols={9} colWidths={['w-24','w-24','w-28','w-24','w-20','w-24','w-20','w-20','w-16']} />
      ) : (
      <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Order Queue</p>
            <p className="mt-0.5 text-sm text-foreground">Monitor customer orders, vehicle links, and invoice readiness in one workspace.</p>
          </div>
          <div className="relative min-w-[240px] flex-1 lg:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 pl-9 text-sm" placeholder="Search orders…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-40 text-sm" aria-label="Sales order status filter"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="rounded-md border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">{filtered.length} orders</span>
        </div>

        <ScrollableRegion className="hidden min-h-0 flex-1 overflow-auto sm:block" label="Sales orders table">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 text-muted-foreground backdrop-blur">
              <tr className="border-b border-border text-left text-xs">
                <th className="whitespace-nowrap px-4 py-3 font-medium">Order No</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">VSO No</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Customer</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Model</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Branch</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Booking Date</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Status</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Chassis</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium">{o.orderNo}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">{o.vsoNo ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">{o.customerName ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">{o.model}{o.variant ? ` / ${o.variant}` : ''}</td>
                  <td className="whitespace-nowrap px-4 py-3">{o.branchCode}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{o.bookingDate}</td>
                  <td className="whitespace-nowrap px-4 py-3"><span className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${STATUS_COLORS[o.status]}`}>{o.status}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">{o.chassisNo ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!invoicedOrderIds.has(o.id) && (o.status === 'delivered' || o.status === 'booked') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                          onClick={() => navigate('/sales/invoices', { state: { prefillOrderId: o.id } })}
                        >
                          <FileText className="h-3 w-3 mr-1" />Create Invoice
                        </Button>
                      )}
                      {!o.vehicleId && (o.status === 'confirmed' || o.status === 'booked') && (
                        <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => openLinkDialog(o)}>
                          <Link2 className="h-3 w-3 mr-1" />Link Vehicle
                        </Button>
                      )}
                      {o.vehicleId && (
                        <div className="flex justify-end items-center gap-2">
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600">Vehicle Linked</Badge>
                          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setUnlinkTarget(o)} disabled={creating}>
                            Unlink
                          </Button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground text-xs">No orders found</td></tr>}
            </tbody>
          </table>
        </ScrollableRegion>

        <MobileCardList
          data={filtered}
          className="p-3"
          emptyMessage="No orders found"
          renderCard={o => (
            <div key={o.id} className="glass-panel p-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">{o.orderNo}</span>
                <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${STATUS_COLORS[o.status]}`}>{o.status}</span>
              </div>
              <div className="text-foreground font-medium">{o.customerName ?? '—'}</div>
              <div className="text-xs text-muted-foreground">{o.model}{o.variant ? ` / ${o.variant}` : ''} · {o.branchCode}</div>
              {o.chassisNo && <div className="text-xs text-muted-foreground font-mono">Chassis: {o.chassisNo}</div>}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {!invoicedOrderIds.has(o.id) && (o.status === 'delivered' || o.status === 'booked') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    onClick={() => navigate('/sales/invoices', { state: { prefillOrderId: o.id } })}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" />Create Invoice
                  </Button>
                )}
                {!o.vehicleId && (o.status === 'confirmed' || o.status === 'booked') && (
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => openLinkDialog(o)}>
                    <Link2 className="h-3.5 w-3.5 mr-1" />Link Vehicle
                  </Button>
                )}
                {o.vehicleId && (
                  <>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600">Vehicle Linked</Badge>
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setUnlinkTarget(o)} disabled={creating}>Unlink</Button>
                  </>
                )}
              </div>
            </div>
          )}
        />
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

      {/* Link Existing Vehicle Dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Link Existing Vehicle</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Order: {linkOrder?.orderNo} — {linkOrder?.model}. The selected vehicle must already exist in Auto Aging for the same company.</p>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <label htmlFor="sales-order-link-chassis-no" className="text-xs font-medium text-muted-foreground">Chassis Number or Search Text *</label>
              <div className="flex gap-2">
                <Input id="sales-order-link-chassis-no" className="h-8 text-sm font-mono" placeholder="e.g. PM00A1234" value={chassisNo} onChange={e => setChassisNo(e.target.value)} />
                <Button type="button" variant="outline" size="sm" className="h-8" aria-label="Search vehicles" onClick={handleVehicleSearch} disabled={vehicleSearchLoading}>
                  {vehicleSearchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            {vehicleResults.length > 0 && (
              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 py-2 text-[11px] font-medium text-muted-foreground bg-secondary/40">
                  <span>Chassis</span>
                  <span>Model</span>
                  <span>Branch</span>
                  <span></span>
                </div>
                {vehicleResults.map(vehicle => (
                  <div key={vehicle.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 py-2 text-xs border-t border-border items-center">
                    <span className="font-mono">{vehicle.chassis_no}</span>
                    <span>{vehicle.model}</span>
                    <span>{vehicle.branch_code}</span>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleLinkVehicle(vehicle)} disabled={creating}>
                      Link
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={() => handleLinkVehicle()} disabled={creating}>{creating ? 'Linking…' : 'Link by Chassis'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink vehicle confirmation */}
      <ConfirmDialog
        open={!!unlinkTarget}
        onOpenChange={open => { if (!open) setUnlinkTarget(null); }}
        title="Unlink vehicle?"
        description={`This will remove the vehicle link${unlinkTarget?.chassisNo ? ` (Chassis: ${unlinkTarget.chassisNo})` : ''} from order ${unlinkTarget?.orderNo ?? ''}. The vehicle record is preserved.`}
        confirmLabel="Unlink"
        confirmVariant="destructive"
        loading={creating}
        onConfirm={() => unlinkTarget && handleUnlinkVehicle(unlinkTarget)}
      />
    </div>
  );
}
