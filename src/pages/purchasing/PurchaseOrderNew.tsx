import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { createPurchaseOrder } from '@/services/purchaseOrderService';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CreatePurchaseOrderLineInput } from '@/types';

interface DraftLine extends CreatePurchaseOrderLineInput {
  // local-only id for React keys
  key: string;
}

function newKey(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyLine(lineNo: number): DraftLine {
  return { key: newKey(), lineNo, chassisNo: '', model: '', variant: '', quantity: 1, unitPrice: 0 };
}

export default function PurchaseOrderNew() {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const canUsePo = useFeatureFlag('phase3e.po-grn-v2', false);

  const [poNo, setPoNo] = useState('');
  const [supplier, setSupplier] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [orderDate, setOrderDate] = useState(today);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(1)]);
  const [saving, setSaving] = useState(false);

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0),
    [lines],
  );

  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  function addLine() {
    setLines(prev => [...prev, emptyLine(prev.length + 1)]);
  }

  function removeLine(idx: number) {
    setLines(prev => prev
      .filter((_, i) => i !== idx)
      .map((l, i) => ({ ...l, lineNo: i + 1 })));
  }

  async function handleSave() {
    if (!poNo.trim() || !supplier.trim()) {
      toast.error('PO number and supplier are required');
      return;
    }
    if (lines.length === 0) {
      toast.error('At least one line is required');
      return;
    }
    if (lines.some(l => !l.model.trim())) {
      toast.error('Every line needs a model');
      return;
    }

    setSaving(true);
    const result = await createPurchaseOrder(companyId, {
      poNo: poNo.trim(),
      supplier: supplier.trim(),
      orderDate,
      expectedDeliveryDate: expectedDeliveryDate || undefined,
      notes: notes.trim() || undefined,
      lines: lines.map(l => ({
        lineNo:    l.lineNo,
        chassisNo: l.chassisNo?.trim() || undefined,
        model:     l.model.trim(),
        variant:   l.variant?.trim() || undefined,
        quantity:  Number(l.quantity) || 1,
        unitPrice: Number(l.unitPrice) || 0,
      })),
    });
    setSaving(false);

    if (result.error || !result.data) {
      toast.error('Failed to create PO', { description: result.error?.message });
      return;
    }
    toast.success('Purchase order created');
    navigate(`/purchasing/orders/${result.data}`);
  }

  if (!canUsePo) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="New Purchase Order"
          description="Create a new PO from a supplier"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Purchasing' }, { label: 'New PO' }]}
        />
        <FeatureUnavailableState routeId="purchasing-order-new" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="New Purchase Order"
        description="Create a draft PO. Submission and approval happen on the detail page once saved."
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Purchasing' },
          { label: 'Purchase Orders', path: '/purchasing/orders' },
          { label: 'New' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/purchasing/orders')}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />Cancel
          </Button>
        }
      />

      {/* Header form */}
      <div className="glass-panel p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">PO Number</Label>
          <Input value={poNo} onChange={e => setPoNo(e.target.value)} placeholder="PO-2026-001" data-testid="po-no-input" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Supplier</Label>
          <Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier name" data-testid="po-supplier-input" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Order Date</Label>
          <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Expected Delivery (optional)</Label>
          <Input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-2 lg:col-span-4">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>
      </div>

      {/* Lines */}
      <div className="glass-panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Order lines</h3>
          <Button size="sm" variant="outline" onClick={addLine} data-testid="add-line-button">
            <Plus className="h-3.5 w-3.5 mr-1" />Add line
          </Button>
        </div>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-12">#</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Chassis (optional)</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Model</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Variant</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Qty</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-32">Unit Price</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-32">Line Total</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line.key} className="border-b last:border-0" data-testid={`po-line-${idx}`}>
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{line.lineNo}</td>
                  <td className="px-3 py-2">
                    <Input value={line.chassisNo ?? ''} onChange={e => updateLine(idx, { chassisNo: e.target.value })} className="h-8 text-xs" />
                  </td>
                  <td className="px-3 py-2">
                    <Input value={line.model} onChange={e => updateLine(idx, { model: e.target.value })} className="h-8 text-xs" data-testid={`po-line-${idx}-model`} />
                  </td>
                  <td className="px-3 py-2">
                    <Input value={line.variant ?? ''} onChange={e => updateLine(idx, { variant: e.target.value })} className="h-8 text-xs" />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min="0" step="1" value={line.quantity} onChange={e => updateLine(idx, { quantity: Number(e.target.value) })} className="h-8 text-xs text-right" />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={e => updateLine(idx, { unitPrice: Number(e.target.value) })} className="h-8 text-xs text-right" />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {lines.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeLine(idx)} className="h-7 w-7 p-0" data-testid={`remove-line-${idx}`}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold">
                <td colSpan={6} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">PO Total</td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid="po-total">{total.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/purchasing/orders')}>Cancel</Button>
        <Button onClick={() => void handleSave()} disabled={saving} data-testid="save-po-button">
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Create PO (draft)
        </Button>
      </div>
    </div>
  );
}
