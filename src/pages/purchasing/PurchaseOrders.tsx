import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { listPurchaseOrders } from '@/services/purchaseOrderService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { ArrowRight, Plus } from 'lucide-react';
import type { PurchaseOrderStatus } from '@/types';

const STATUS_BADGE: Record<PurchaseOrderStatus, string> = {
  draft:     'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  approved:  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  fulfilled: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  closed:    'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function fmtMoney(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const canUsePo = useFeatureFlag('phase3e.po-grn-v2', false);

  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | 'all'>('all');
  const [supplierFilter, setSupplierFilter] = useState('');

  const query = useQuery({
    queryKey: ['purchase_orders', companyId, statusFilter, supplierFilter],
    queryFn: async () => {
      const r = await listPurchaseOrders(companyId, {
        status:   statusFilter === 'all' ? undefined : statusFilter,
        supplier: supplierFilter || undefined,
      });
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && canUsePo,
    staleTime: 30_000,
  });

  if (!canUsePo) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Purchase Orders"
          description="Track CBU procurement from supplier order through fulfilment"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Purchasing' }, { label: 'Purchase Orders' }]}
        />
        <FeatureUnavailableState featureName="Purchase Orders" flagName="phase3e.po-grn-v2" />
      </div>
    );
  }

  const rows = query.data ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Purchase Orders"
        description="CBU procurement lifecycle: draft → submitted → approved → fulfilled → closed"
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Purchasing' },
          { label: 'Purchase Orders' },
        ]}
        actions={
          <Button size="sm" onClick={() => navigate('/purchasing/orders/new')} data-testid="new-po-button">
            <Plus className="h-3.5 w-3.5 mr-1" />New PO
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as PurchaseOrderStatus | 'all')}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="fulfilled">Fulfilled</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="text"
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
          placeholder="Filter by supplier…"
          className="h-9 w-48"
          data-testid="po-supplier-filter"
        />
      </div>

      <ScrollableRegion label="Purchase orders list">
        {query.isLoading ? <TableSkeleton />
          : query.isError ? <PageErrorState error={query.error} />
          : rows.length === 0 ? (
            <div className="glass-panel py-10 text-center text-sm text-muted-foreground">
              No purchase orders match the current filters.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">PO No.</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Supplier</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Order Date</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Expected Delivery</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total (RM)</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(po => (
                    <tr key={po.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`po-row-${po.id}`}>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium">{po.poNo}</td>
                      <td className="px-4 py-2.5">{po.supplier}</td>
                      <td className="px-4 py-2.5 text-xs">{po.orderDate}</td>
                      <td className="px-4 py-2.5 text-xs">{po.expectedDeliveryDate ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(po.totalAmount)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[po.lifecycleStatus]}`}>
                          {po.lifecycleStatus}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => navigate(`/purchasing/orders/${po.id}`)}
                          data-testid={`po-open-${po.id}`}
                        >
                          Open <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </ScrollableRegion>
    </div>
  );
}
