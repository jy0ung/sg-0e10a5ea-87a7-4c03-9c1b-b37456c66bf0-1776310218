import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Button } from '@/components/ui/button';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { listGoodsReceiptNotes } from '@/services/grnService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { AlertTriangle, ArrowRight, ClipboardCheck } from 'lucide-react';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-MY', { dateStyle: 'medium' });
}

export default function GoodsReceiptNotes() {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const canUsePo = useFeatureFlag('phase3e.po-grn-v2', false);

  const query = useQuery({
    queryKey: ['goods_receipt_notes', companyId],
    queryFn: async () => {
      const r = await listGoodsReceiptNotes(companyId);
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
          title="Goods Receipt Notes"
          description="Physical receipts against purchase orders"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Purchasing' }, { label: 'GRN' }]}
        />
        <div className="glass-panel p-12 text-center max-w-md mx-auto">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Feature not available</h3>
          <p className="text-sm text-muted-foreground">Purchasing module is not enabled for your company.</p>
        </div>
      </div>
    );
  }

  const rows = query.data ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Goods Receipt Notes"
        description="Receipts recorded against purchase orders. Immutable after creation."
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Purchasing' },
          { label: 'GRN' },
        ]}
      />

      <ScrollableRegion label="GRN list">
        {query.isLoading ? <TableSkeleton />
          : query.isError ? <PageErrorState error={query.error} />
          : rows.length === 0 ? (
            <div className="glass-panel py-10 text-center text-sm text-muted-foreground">
              No goods receipt notes yet. Receive against an approved PO from the PO detail page.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">GRN No.</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">PO</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Received Date</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Supplier DN</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(grn => (
                    <tr key={grn.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`grn-row-${grn.id}`}>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium">
                        <ClipboardCheck className="h-3 w-3 inline mr-1 text-emerald-600 dark:text-emerald-400" />
                        {grn.grnNo}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{grn.purchaseOrderId.slice(0, 8)}…</td>
                      <td className="px-4 py-2.5 text-xs">{fmtDate(grn.receivedDate)}</td>
                      <td className="px-4 py-2.5 text-xs">{grn.supplierDnNo ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => navigate(`/purchasing/grn/${grn.id}`)}
                          data-testid={`grn-open-${grn.id}`}
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
