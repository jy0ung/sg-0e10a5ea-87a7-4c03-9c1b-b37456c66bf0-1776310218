import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useSales } from '@/contexts/SalesContext';
import { createVehicleFromSalesOrder } from '@/services/salesOrderService';
import { SalesOrder, Invoice } from '@/types';
import { Link2, CheckCircle, Receipt, History } from 'lucide-react';
import { getAutoAgingFieldLabel } from '@/config/autoAgingFieldLabels';

interface SalesOrderDetailProps {
  order: SalesOrder;
  invoices: Invoice[];
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  enquiry: 'bg-secondary text-secondary-foreground',
  quoted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  confirmed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  booked: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const PAY_COLORS: Record<string, string> = {
  unpaid: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled: 'bg-secondary text-secondary-foreground',
};

export function SalesOrderDetail({ order, invoices, onClose }: SalesOrderDetailProps) {
  const { user } = useAuth();
  const companyId = useCompanyId();
  const { reloadSales } = useSales();
  const { toast } = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const [chassisNo, setChassisNo] = useState('');
  const [creating, setCreating] = useState(false);

  const orderInvoices = invoices.filter(i => i.salesOrderId === order.id);

  const handleCreateBg = async () => {
    if (!chassisNo.trim()) return toast({ title: 'Chassis No is required', variant: 'destructive' });
    setCreating(true);
    const { error } = await createVehicleFromSalesOrder(order.id, chassisNo.trim(), user?.id ?? '', companyId);
    setCreating(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await reloadSales();
    setLinkOpen(false);
    toast({ title: 'Inventory entry created', description: `Chassis: ${chassisNo}` });
  };

  return (
    <>
      <div className="space-y-1 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{order.orderNo}</h2>
          <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[order.status] ?? ''}`}>{order.status}</span>
        </div>
        <p className="text-sm text-muted-foreground">{order.customerName} — {order.model}{order.variant ? ` / ${order.variant}` : ''}</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-8 text-xs">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invoice">Invoices ({orderInvoices.length})</TabsTrigger>
          <TabsTrigger value="vehicle">Inventory Tracking</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-3 space-y-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              { label: 'Branch', value: order.branchCode },
              { label: 'Salesman', value: order.salesmanName ?? '—' },
              { label: 'Booking Date', value: order.bookingDate },
              { label: 'Delivery Date', value: order.deliveryDate ?? '—' },
              { label: 'Total Price', value: order.totalPrice ? `RM ${order.totalPrice.toLocaleString()}` : '—' },
              { label: 'Booking Amt', value: order.bookingAmount ? `RM ${order.bookingAmount.toLocaleString()}` : '—' },
              { label: 'Colour', value: order.colour ?? '—' },
              { label: 'Chassis', value: order.chassisNo ?? '—' },
            ].map(({ label, value }) => (
              <React.Fragment key={label}>
                <dt className="text-muted-foreground font-medium">{label}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
          </dl>
          {order.notes && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              {order.notes}
            </div>
          )}
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoice" className="mt-3">
          {orderInvoices.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No invoices yet</p>
          ) : (
            <div className="space-y-2">
              {orderInvoices.map(inv => (
                <div key={inv.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-medium">{inv.invoiceNo}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${PAY_COLORS[inv.paymentStatus]}`}>{inv.paymentStatus}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Total: RM {inv.totalAmount.toLocaleString()}</span>
                    <span>Paid: RM {(inv.paidAmount ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Auto Aging Link */}
        <TabsContent value="vehicle" className="mt-3 space-y-3">
          {order.vehicleId ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm space-y-1">
              <div className="flex items-center gap-2 text-emerald-600 font-medium">
                <CheckCircle className="h-4 w-4" />
                Inventory Entry Created
              </div>
              <p className="text-xs text-muted-foreground">Chassis: <span className="font-mono font-medium text-foreground">{order.chassisNo}</span></p>
              <p className="text-xs text-muted-foreground">{getAutoAgingFieldLabel('bg_date', 'BG DATE')}: {order.bookingDate}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-3">
              <Link2 className="h-8 w-8 text-muted-foreground mx-auto" />
              <div>
                <p className="text-sm font-medium">No Inventory Entry Linked</p>
                <p className="text-xs text-muted-foreground mt-0.5">Create the inventory tracking entry once the chassis number is confirmed.</p>
              </div>
              {(order.status === 'confirmed' || order.status === 'booked') ? (
                <Button size="sm" onClick={() => setLinkOpen(true)}>
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Create Inventory Entry
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Advance order to <strong>Confirmed</strong> or <strong>Booked</strong> status first.</p>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Chassis Dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create Inventory Tracking Entry</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Order: {order.orderNo} — {order.model}<br />Inventory {getAutoAgingFieldLabel('bg_date', 'BG DATE')} will be set from Booking Date: <strong>{order.bookingDate}</strong></p>
          <div className="space-y-2 py-2">
            <label htmlFor="sales-order-chassis-no" className="text-xs font-medium text-muted-foreground">Chassis Number *</label>
            <Input id="sales-order-chassis-no" className="h-8 text-sm font-mono" placeholder="e.g. PM00A1234" value={chassisNo} onChange={e => setChassisNo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBg} disabled={creating}>{creating ? 'Creating…' : 'Create Inventory Entry'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
