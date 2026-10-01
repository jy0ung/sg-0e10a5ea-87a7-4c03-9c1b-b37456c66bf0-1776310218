import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listEligiblePoLines } from '@/services/purchaseInvoiceService';

interface Props {
  companyId: string;
  poId: string;
  value: string;
  onChange: (poId: string, poLineId: string) => void;
}

export function PurchaseInvoicePoLineSelect({ companyId, poId, value, onChange }: Props) {
  const { data: lines = [], isLoading, error } = useQuery({
    queryKey: ['eligible-purchase-order-lines', companyId],
    queryFn: () => listEligiblePoLines(companyId),
    enabled: !!companyId,
  });
  const orders = [...new Map(lines.map(line => [line.poId, line])).values()];
  const poLines = lines.filter(line => line.poId === poId);
  const chosen = lines.find(line => line.id === value);

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium">Purchase order reference</p>
      <p className="text-xs text-muted-foreground">Choose an approved PO and its exact line. The invoice stores the line ID for three-way match.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="invoice-po">Purchase order</label>
          <Select value={poId || 'none'} onValueChange={next => onChange(next === 'none' ? '' : next, '')}>
            <SelectTrigger id="invoice-po"><SelectValue placeholder="Choose PO" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No PO reference</SelectItem>
              {orders.map(order => <SelectItem key={order.poId} value={order.poId}>{order.poNo} · {order.supplier}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="invoice-po-line">PO line</label>
          <Select value={value || 'none'} onValueChange={next => onChange(poId, next === 'none' ? '' : next)} disabled={!poId}>
            <SelectTrigger id="invoice-po-line"><SelectValue placeholder="Choose line" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Choose line</SelectItem>
              {poLines.map(line => (
                <SelectItem key={line.id} value={line.id}>
                  #{line.lineNo} · {line.model} · {line.chassisNo ?? 'No chassis'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {chosen && (
        <p className="text-xs text-muted-foreground">
          {chosen.poNo} · {chosen.supplier} · {chosen.model} · {chosen.chassisNo ?? 'No chassis'} ·
          ordered {chosen.orderedQuantity} · received {chosen.receivedQuantity} ·
          RM {chosen.unitPrice.toFixed(2)} per unit
        </p>
      )}
      {isLoading && <p className="text-xs text-muted-foreground">Loading eligible PO lines…</p>}
      {error && <p className="text-xs text-destructive">{error instanceof Error ? error.message : 'Unable to load PO lines'}</p>}
    </div>
  );
}
