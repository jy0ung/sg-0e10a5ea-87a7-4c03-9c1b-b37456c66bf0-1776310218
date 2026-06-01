import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Button } from '@/components/ui/button';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getPurchaseOrder, transitionPoStatus } from '@/services/purchaseOrderService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseOrderStatus } from '@/types';

const STATUS_BADGE: Record<PurchaseOrderStatus, string> = {
  draft:     'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  approved:  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  fulfilled: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  closed:    'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

// Permitted transitions from each state (mirrors the SQL state machine)
const NEXT_STATUSES: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft:     ['submitted', 'cancelled'],
  submitted: ['approved', 'cancelled'],
  approved:  ['fulfilled', 'cancelled'],
  fulfilled: ['closed'],
  closed:    [],
  cancelled: [],
};

const ACTION_LABELS: Record<PurchaseOrderStatus, string> = {
  draft:     'Reset to draft',
  submitted: 'Submit for approval',
  approved:  'Approve',
  fulfilled: 'Mark fulfilled',
  closed:    'Close PO',
  cancelled: 'Cancel',
};

function fmtMoney(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PurchaseOrderDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id = '' } = useParams<{ id: string }>();
  const companyId = useCompanyId();
  const canUsePo = useFeatureFlag('phase3e.po-grn-v2', false);

  const [transitioning, setTransitioning] = useState<PurchaseOrderStatus | null>(null);

  const query = useQuery({
    queryKey: ['purchase_order', companyId, id],
    queryFn: async () => {
      const r = await getPurchaseOrder(companyId, id);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && !!id && canUsePo,
    staleTime: 10_000,
  });

  async function handleTransition(target: PurchaseOrderStatus) {
    setTransitioning(target);
    const result = await transitionPoStatus(companyId, id, target);
    setTransitioning(null);
    if (result.error) {
      toast.error('Transition failed', { description: result.error.message });
      return;
    }
    toast.success(`PO ${target}`);
    void queryClient.invalidateQueries({ queryKey: ['purchase_order', companyId, id] });
    void queryClient.invalidateQueries({ queryKey: ['purchase_orders', companyId] });
  }

  if (!canUsePo) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Purchase Order" description="" breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Purchasing' }, { label: 'Purchase Order' }]} />
        <FeatureUnavailableState featureName="Purchase Order" flagName="phase3e.po-grn-v2" />
      </div>
    );
  }

  if (query.isLoading) return <TableSkeleton />;
  if (query.isError)   return <PageErrorState error={query.error} />;
  const po = query.data;
  if (!po) return (
    <div className="glass-panel py-16 text-center text-sm text-muted-foreground">Purchase order not found.</div>
  );

  const nextStatuses = NEXT_STATUSES[po.lifecycleStatus];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`PO ${po.poNo}`}
        description={`${po.supplier} · ordered ${po.orderDate}`}
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Purchasing' },
          { label: 'Purchase Orders', path: '/purchasing/orders' },
          { label: po.poNo },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/purchasing/orders')}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />Back
            </Button>
            {(po.lifecycleStatus === 'approved' || po.lifecycleStatus === 'fulfilled') && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/purchasing/grn/new?poId=${po.id}`)}
                data-testid="po-receive-button"
              >
                <ClipboardCheck className="h-3.5 w-3.5 mr-1" />Receive (GRN)
              </Button>
            )}
            {nextStatuses.map(next => (
              <Button
                key={next}
                size="sm"
                variant={next === 'cancelled' ? 'outline' : 'default'}
                className={next === 'cancelled' ? 'text-red-600 border-red-500/40 hover:bg-red-500/10' : ''}
                disabled={transitioning !== null}
                onClick={() => void handleTransition(next)}
                data-testid={`po-transition-${next}`}
              >
                {transitioning === next
                  ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  : next === 'cancelled' ? <XCircle className="h-3.5 w-3.5 mr-1" />
                  : next === 'submitted' ? <Send className="h-3.5 w-3.5 mr-1" />
                  : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                {ACTION_LABELS[next]}
              </Button>
            ))}
          </div>
        }
      />

      {/* Header metadata */}
      <div className="glass-panel p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
          <p className="mt-1">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[po.lifecycleStatus]}`} data-testid="po-status-badge">
              {po.lifecycleStatus}
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
          <p className="mt-1 text-sm font-semibold tabular-nums" data-testid="po-total-amount">RM {fmtMoney(po.totalAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Expected Delivery</p>
          <p className="mt-1 text-sm">{po.expectedDeliveryDate ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Approved</p>
          <p className="mt-1 text-sm">{po.approvedAt ? new Date(po.approvedAt).toLocaleDateString('en-MY') : '—'}</p>
        </div>
        {po.notes && (
          <div className="col-span-full">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Notes</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{po.notes}</p>
          </div>
        )}
      </div>

      {/* Lines */}
      <ScrollableRegion label="Purchase order lines">
        <h3 className="mb-3 text-sm font-semibold">Lines ({po.lines.length})</h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-12">#</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Chassis</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Model</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Variant</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Qty</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Unit Price</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map(line => (
                <tr key={line.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`po-detail-line-${line.lineNo}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{line.lineNo}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{line.chassisNo ?? '—'}</td>
                  <td className="px-4 py-2.5">{line.model}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{line.variant ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(line.unitPrice)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtMoney(line.lineAmount)}</td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold">
                <td colSpan={6} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Grand Total</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(po.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ScrollableRegion>
    </div>
  );
}
