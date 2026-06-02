import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { createGrn, getPoLineReceipts } from '@/services/grnService';
import { getPurchaseOrder } from '@/services/purchaseOrderService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { ArrowLeft, ClipboardCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function GoodsReceiptNoteNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const poId = searchParams.get('poId') ?? '';
  const companyId = useCompanyId();
  const canUsePo = useFeatureFlag('phase3e.po-grn-v2', false);

  const [grnNo, setGrnNo] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [receivedDate, setReceivedDate] = useState(today);
  const [supplierDnNo, setSupplierDnNo] = useState('');
  const [notes, setNotes] = useState('');
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});  // po_line_id → input value
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const poQuery = useQuery({
    queryKey: ['purchase_order', companyId, poId],
    queryFn: async () => {
      const r = await getPurchaseOrder(companyId, poId);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && !!poId && canUsePo,
    staleTime: 30_000,
  });

  const receiptsQuery = useQuery({
    queryKey: ['po_line_receipts', companyId, poId],
    queryFn: async () => {
      const r = await getPoLineReceipts(companyId, poId);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && !!poId && canUsePo,
    staleTime: 30_000,
  });

  const summaries = useMemo(() => receiptsQuery.data ?? [], [receiptsQuery.data]);

  const totalReceiving = useMemo(
    () => summaries.reduce((s, line) => s + (Number(receiveQty[line.purchaseOrderLineId]) || 0), 0),
    [summaries, receiveQty],
  );

  async function handleSave() {
    if (!grnNo.trim()) {
      toast.error('GRN number is required');
      return;
    }
    const lines = summaries
      .map(line => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        receivedQuantity:    Number(receiveQty[line.purchaseOrderLineId]) || 0,
        lineNotes:           lineNotes[line.purchaseOrderLineId]?.trim() || undefined,
        remaining:           line.remainingQuantity,
      }))
      .filter(l => l.receivedQuantity > 0);

    if (lines.length === 0) {
      toast.error('Enter at least one received quantity');
      return;
    }
    const overReceived = lines.find(l => l.receivedQuantity > l.remaining);
    if (overReceived) {
      toast.error('A received quantity exceeds remaining', {
        description: `Line ${overReceived.purchaseOrderLineId.slice(0, 8)}…: receiving ${overReceived.receivedQuantity} but only ${overReceived.remaining} remaining.`,
      });
      return;
    }

    setSaving(true);
    const result = await createGrn(companyId, {
      grnNo: grnNo.trim(),
      purchaseOrderId: poId,
      receivedDate,
      supplierDnNo: supplierDnNo.trim() || undefined,
      notes: notes.trim() || undefined,
      lines: lines.map(({ purchaseOrderLineId, receivedQuantity, lineNotes }) => ({
        purchaseOrderLineId, receivedQuantity, lineNotes,
      })),
    });
    setSaving(false);

    if (result.error || !result.data) {
      toast.error('Failed to create GRN', { description: result.error?.message });
      return;
    }
    toast.success('GRN created');
    navigate(`/purchasing/grn/${result.data}`);
  }

  if (!canUsePo) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Receive Goods" description="" breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Purchasing' }, { label: 'Receive' }]} />
        <FeatureUnavailableState routeId="purchasing-grn-new" />
      </div>
    );
  }

  if (!poId) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Receive Goods" description="" breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Purchasing' }, { label: 'Receive' }]} />
        <div className="glass-panel py-16 text-center text-sm text-muted-foreground">
          No purchase order specified. Open a PO from the Purchase Orders list and click Receive.
        </div>
      </div>
    );
  }

  if (poQuery.isLoading || receiptsQuery.isLoading) return <TableSkeleton />;
  if (poQuery.isError)   return <PageErrorState error={poQuery.error} />;
  if (receiptsQuery.isError) return <PageErrorState error={receiptsQuery.error} />;
  const po = poQuery.data;
  if (!po) return (
    <div className="glass-panel py-16 text-center text-sm text-muted-foreground">Purchase order not found.</div>
  );

  const remainingExists = summaries.some(s => s.remainingQuantity > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`Receive against PO ${po.poNo}`}
        description={`${po.supplier} · ordered ${po.orderDate}`}
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Purchasing' },
          { label: 'Purchase Orders', path: '/purchasing/orders' },
          { label: po.poNo, path: `/purchasing/orders/${poId}` },
          { label: 'Receive' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(`/purchasing/orders/${poId}`)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />Cancel
          </Button>
        }
      />

      {!remainingExists && (
        <div className="glass-panel p-4 border-l-4 border-l-emerald-500">
          <p className="text-sm">All PO lines have been fully received. No further GRNs can be created against this PO.</p>
        </div>
      )}

      {/* Header form */}
      <div className="glass-panel p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">GRN Number</Label>
          <Input value={grnNo} onChange={e => setGrnNo(e.target.value)} placeholder="GRN-2026-001" data-testid="grn-no-input" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Received Date</Label>
          <Input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} max={today} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Supplier DN (optional)</Label>
          <Input value={supplierDnNo} onChange={e => setSupplierDnNo(e.target.value)} placeholder="DN-12345" />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>
      </div>

      {/* Receiving lines */}
      <div className="glass-panel p-4 space-y-3">
        <h3 className="text-sm font-semibold">Receive quantities</h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-12">#</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Chassis</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Model / Variant</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Ordered</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Received</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Remaining</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Receive Now</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(line => {
                const isComplete = line.remainingQuantity <= 0;
                return (
                  <tr key={line.purchaseOrderLineId}
                      className={`border-b last:border-0 ${isComplete ? 'opacity-50' : ''}`}
                      data-testid={`receive-line-${line.lineNo}`}>
                    <td className="px-3 py-2 font-mono text-xs">{line.lineNo}</td>
                    <td className="px-3 py-2 font-mono text-xs">{line.chassisNo ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      <div>{line.model}</div>
                      <div className="text-muted-foreground">{line.variant ?? ''}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{line.orderedQuantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-emerald-600 dark:text-emerald-400">{line.receivedQuantity}</td>
                    <td className={`px-3 py-2 text-right tabular-nums text-xs ${line.remainingQuantity > 0 ? 'font-medium' : 'text-muted-foreground'}`}>
                      {line.remainingQuantity}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        max={line.remainingQuantity}
                        step="1"
                        disabled={isComplete}
                        value={receiveQty[line.purchaseOrderLineId] ?? ''}
                        onChange={e => setReceiveQty(prev => ({ ...prev, [line.purchaseOrderLineId]: e.target.value }))}
                        className="h-8 text-xs text-right"
                        data-testid={`receive-qty-${line.lineNo}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        disabled={isComplete}
                        value={lineNotes[line.purchaseOrderLineId] ?? ''}
                        onChange={e => setLineNotes(prev => ({ ...prev, [line.purchaseOrderLineId]: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-muted/30 font-semibold">
                <td colSpan={6} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Total receiving now</td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid="total-receiving">{totalReceiving}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(`/purchasing/orders/${poId}`)}>Cancel</Button>
        <Button
          onClick={() => void handleSave()}
          disabled={saving || !remainingExists || totalReceiving === 0}
          data-testid="save-grn-button"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5 mr-1" />}
          Post GRN
        </Button>
      </div>
    </div>
  );
}
