import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { listBranches } from '@/services/branchService';
import { markPurchaseInvoiceReceived, type PurchaseInvoiceRecord } from '@/services/purchaseInvoiceService';

interface Props {
  invoice: PurchaseInvoiceRecord | null;
  companyId: string;
  onClose: () => void;
  onReceived: () => void;
}

export function PurchaseInvoiceReceiptDialog({ invoice, companyId, onClose, onReceived }: Props) {
  const { toast } = useToast();
  const [branchId, setBranchId] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => listBranches(companyId),
    enabled: !!invoice && !!companyId,
  });

  const receive = async () => {
    if (!invoice || !branchId || saving) return;
    setSaving(true);
    const { error } = await markPurchaseInvoiceReceived(invoice.id, { companyId, branchId });
    setSaving(false);
    if (error) {
      toast({ title: 'Receipt failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Invoice and vehicle received', description: invoice.invoiceNo });
    setBranchId('');
    onClose();
    onReceived();
  };

  return (
    <Dialog open={!!invoice} onOpenChange={open => { if (!open && !saving) { setBranchId(''); onClose(); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Receive purchase invoice</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {invoice?.invoiceNo} · {invoice?.chassisNo}. Choose the outlet receiving this vehicle.
        </p>
        <div className="space-y-2">
          <label htmlFor="pi-receiving-branch" className="text-sm font-medium">Receiving branch</label>
          <Select value={branchId} onValueChange={setBranchId} disabled={isLoading || saving}>
            <SelectTrigger id="pi-receiving-branch"><SelectValue placeholder={isLoading ? 'Loading branches…' : 'Select branch'} /></SelectTrigger>
            <SelectContent>
              {branches.map(branch => <SelectItem key={branch.id} value={branch.id}>{branch.name} ({branch.code})</SelectItem>)}
            </SelectContent>
          </Select>
          {!isLoading && branches.length === 0 && <p className="text-sm text-destructive">No company branches are available. Ask an administrator to add one.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void receive()} disabled={!branchId || saving}>{saving ? 'Receiving…' : 'Receive invoice'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
