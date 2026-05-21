import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { reviewLeaveRequest } from '@/services/hrmsService';
import { notifyApprovalInboxChanged } from '@/lib/hrms/approvalInbox';
import type { LeaveRequest } from '@/types';
import { formatDays, fmtDateRange } from './utils';

interface ReviewDialogProps {
  request: LeaveRequest | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReviewDialog({ request, open, onClose, onSuccess }: ReviewDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    onClose();
    setDecision('approved');
    setNote('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!request || !user?.id) return;
    setSubmitting(true);
    try {
      const { error } = await reviewLeaveRequest(request.id, user.id, decision, note || undefined);
      if (error) {
        toast({ title: 'Error', description: error, variant: 'destructive' });
        return;
      }
      toast({ title: decision === 'approved' ? 'Request approved' : 'Request rejected' });
      notifyApprovalInboxChanged();
      onSuccess();
      handleClose();
    } finally {
      setSubmitting(false);
    }
  }

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Review Leave Request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <p className="font-medium">{request.employeeName ?? 'Employee'}</p>
            <p className="text-muted-foreground">{request.leaveTypeName ?? 'Leave'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {fmtDateRange(request.startDate, request.endDate)} · {formatDays(request.days)} day{request.days !== 1 ? 's' : ''}
            </p>
            {request.reason && (
              <p className="mt-1 text-xs italic text-muted-foreground">"{request.reason}"</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Decision</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={decision === 'approved' ? 'default' : 'outline'}
                size="sm"
                className={decision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                onClick={() => setDecision('approved')}
              >
                Approve
              </Button>
              <Button
                type="button"
                variant={decision === 'rejected' ? 'default' : 'outline'}
                size="sm"
                className={decision === 'rejected' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
                onClick={() => setDecision('rejected')}
              >
                Reject
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Note <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder={decision === 'approved' ? 'Approval note…' : 'Reason for rejection…'}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className={decision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {submitting ? 'Submitting…' : decision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
