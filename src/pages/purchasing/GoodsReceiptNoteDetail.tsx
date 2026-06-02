import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Button } from '@/components/ui/button';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { getGoodsReceiptNote } from '@/services/grnService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { ArrowLeft, ExternalLink } from 'lucide-react';

export default function GoodsReceiptNoteDetail() {
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const companyId = useCompanyId();
  const canUsePo = useFeatureFlag('phase3e.po-grn-v2', false);

  const query = useQuery({
    queryKey: ['goods_receipt_note', companyId, id],
    queryFn: async () => {
      const r = await getGoodsReceiptNote(companyId, id);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && !!id && canUsePo,
    staleTime: 10_000,
  });

  if (!canUsePo) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="GRN" description="" breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Purchasing' }, { label: 'GRN' }]} />
        <FeatureUnavailableState routeId="purchasing-grn-detail" />
      </div>
    );
  }

  if (query.isLoading) return <TableSkeleton />;
  if (query.isError)   return <PageErrorState error={query.error} />;
  const grn = query.data;
  if (!grn) return (
    <div className="glass-panel py-16 text-center text-sm text-muted-foreground">GRN not found.</div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`GRN ${grn.grnNo}`}
        description={`Received ${grn.receivedDate}`}
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Purchasing' },
          { label: 'GRN', path: '/purchasing/grn' },
          { label: grn.grnNo },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/purchasing/grn')}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />Back
            </Button>
            <Button size="sm" onClick={() => navigate(`/purchasing/orders/${grn.purchaseOrderId}`)} data-testid="grn-open-po">
              View PO <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        }
      />

      {/* Header */}
      <div className="glass-panel p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Received Date</p>
          <p className="mt-1 text-sm">{grn.receivedDate}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Supplier DN</p>
          <p className="mt-1 text-sm font-mono">{grn.supplierDnNo ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">PO ID</p>
          <p className="mt-1 text-xs font-mono">{grn.purchaseOrderId.slice(0, 8)}…</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Lines</p>
          <p className="mt-1 text-sm font-semibold tabular-nums" data-testid="grn-line-count">{grn.lines.length}</p>
        </div>
        {grn.notes && (
          <div className="col-span-full">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Notes</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{grn.notes}</p>
          </div>
        )}
      </div>

      {/* Lines */}
      <ScrollableRegion label="Received lines">
        <h3 className="mb-3 text-sm font-semibold">Received quantities</h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">PO Line</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Received Qty</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Line Notes</th>
              </tr>
            </thead>
            <tbody>
              {grn.lines.map(line => (
                <tr key={line.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{line.purchaseOrderLineId.slice(0, 8)}…</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{line.receivedQuantity}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{line.lineNotes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollableRegion>
    </div>
  );
}
