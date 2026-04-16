import React, { useEffect, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSales } from '@/contexts/SalesContext';
import { SalesOrder, DealStage } from '@/types';
import { GripVertical } from 'lucide-react';

export default function DealPipeline() {
  const { salesOrders, dealStages, moveOrderStage, reloadSales } = useSales();
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => { reloadSales(); }, [reloadSales]);

  const ordersByStage = (stageId: string) =>
    salesOrders.filter(o => o.dealStageId === stageId && o.status !== 'cancelled');

  const unassigned = salesOrders.filter(o => !o.dealStageId && o.status !== 'cancelled');

  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    setDragging(orderId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', orderId);
  };

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) await moveOrderStage(id, stageId);
    setDragging(null);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const STAGE_COLORS = ['bg-secondary', 'bg-blue-500/10', 'bg-yellow-500/10', 'bg-emerald-500/10', 'bg-purple-500/10', 'bg-rose-500/10', 'bg-gray-500/10'];

  return (
    <div className="space-y-4 animate-fade-in overflow-hidden">
      <PageHeader
        title="Deal Pipeline"
        description="Drag-and-drop kanban tracking of deals by stage"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Sales' }, { label: 'Pipeline' }]}
      />

      <div className="flex gap-3 overflow-x-auto pb-4">
        {dealStages.map((stage, idx) => {
          const orders = ordersByStage(stage.id);
          return (
            <div
              key={stage.id}
              className={`flex-shrink-0 w-60 rounded-xl border border-border ${STAGE_COLORS[idx % STAGE_COLORS.length]} flex flex-col`}
              onDrop={e => handleDrop(e, stage.id)}
              onDragOver={handleDragOver}
            >
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold">{stage.name}</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">{orders.length}</Badge>
              </div>
              <div className="flex flex-col gap-2 p-2 min-h-24 flex-1">
                {orders.map(o => (
                  <OrderCard key={o.id} order={o} dragging={dragging === o.id} onDragStart={handleDragStart} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {unassigned.length > 0 && (
        <div className="glass-panel p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Unassigned ({unassigned.length})</p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(o => (
              <span key={o.id} className="text-xs bg-secondary rounded px-2 py-1">{o.orderNo} — {o.model}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, dragging, onDragStart }: { order: SalesOrder; dragging: boolean; onDragStart: (e: React.DragEvent, id: string) => void }) {
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, order.id)}
      className={`rounded-lg border border-border bg-background p-2.5 cursor-grab active:cursor-grabbing transition-opacity ${dragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div>
          <p className="text-xs font-medium">{order.orderNo}</p>
          <p className="text-[11px] text-muted-foreground">{order.customerName ?? '—'}</p>
          <p className="text-[11px] text-muted-foreground">{order.model}{order.variant ? ` / ${order.variant}` : ''}</p>
        </div>
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      </div>
      {order.totalPrice && (
        <p className="text-[11px] font-semibold text-primary mt-1">RM {order.totalPrice.toLocaleString()}</p>
      )}
    </div>
  );
}
