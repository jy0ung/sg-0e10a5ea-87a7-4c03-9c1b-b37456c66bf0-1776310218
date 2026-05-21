import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { reviewLeaveRequest } from '@/services/hrmsService';
import { submitApprovalDecision } from '@/services/approvalEngineService';
import { notifyApprovalInboxChanged } from '@/lib/hrms/approvalInbox';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string | null;
  approvalRequestId: string | null;
  action: 'approved' | 'rejected';
  userId: string;
}

export default function ReviewDialog({
  open,
  onOpenChange,
  requestId,
  approvalRequestId,
  action,
  userId,
}: ReviewDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isApprove = action === 'approved';

  async function handleConfirm() {
    if (!userId) return;
    setSubmitting(true);

    let error: string | null = null;
    if (approvalRequestId) {
      ({ error } = await submitApprovalDecision(approvalRequestId, userId, action, note));
    } else if (requestId) {
      ({ error } = await reviewLeaveRequest(requestId, userId, action, note));
    }

    if (error) {
      toast({ title: 'Error', description: error, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    toast({ title: `Request ${action}`, description: isApprove ? 'Leave request has been approved.' : 'Leave request has been rejected.' });
    notifyApprovalInboxChanged();
    onOpenChange(false);
    setNote('');
    setSubmitting(false);
    void queryClient.invalidateQueries({ queryKey: ['leave-control-center'] });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setNote(''); setSubmitting(false); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              isApprove ? 'bg-emerald-500/10' : 'bg-red-500/10'
            )}>
              {isApprove
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                : <XCircle className="h-4 w-4 text-red-600" />
              }
            </div>
            <span className="capitalize">{action} Request</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              Note <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="Leave a note for the employee..."
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting}
            className={cn(
              isApprove
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            )}
          >
            {submitting ? 'Processing…' : `Confirm ${action}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
