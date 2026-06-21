import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  bulkArchiveRequests,
  bulkNotifyRequestParticipants,
  bulkUpdateRequestPriority,
} from '@/services/requestManagementService';
import type { CompanyTicketRecord, TicketPriority } from '@/services/ticketService';

const priorityOptions: Array<{ value: TicketPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

interface RequestQueueBulkDialogsProps {
  selectedTickets: CompanyTicketRecord[];
  userId: string;
  companyId: string;
}

/**
 * Manages the three bulk-action dialogs (priority, archive, notify) for the
 * Request Queue. Returns an object with action openers and a `dialogs` JSX
 * element to render at the bottom of the page.
 *
 * Usage:
 * ```tsx
 * const bulk = useBulkDialogs({ selectedTickets, userId, companyId });
 * // In JSX: {bulk.dialogs}
 * // In buttons: onClick={bulk.openPriorityDialog}
 * ```
 */
export function useBulkDialogs({ selectedTickets, userId, companyId }: RequestQueueBulkDialogsProps) {
  const queryClient = useQueryClient();
  const [bulkSaving, setBulkSaving] = useState(false);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [bulkPriority, setBulkPriority] = useState<TicketPriority>('medium');
  const [priorityReason, setPriorityReason] = useState('');
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [notifyAudience, setNotifyAudience] = useState<'requesters' | 'owners'>('requesters');
  const [notifyMessage, setNotifyMessage] = useState('');

  const invalidateQueue = () =>
    queryClient.invalidateQueries({ queryKey: ['ticketQueue', companyId] });

  const handleBulkPriorityUpdate = async () => {
    if (selectedTickets.length === 0) return;
    setBulkSaving(true);
    const result = await bulkUpdateRequestPriority(selectedTickets.map((t) => t.id), bulkPriority, priorityReason, { userId, companyId });
    setBulkSaving(false);
    if (result.error) { toast.error('Bulk priority update failed', { description: result.error.message }); return; }
    setPriorityDialogOpen(false); setPriorityReason('');
    await invalidateQueue();
    toast.success(`${result.updated} request${result.updated === 1 ? '' : 's'} updated`);
  };

  const handleBulkArchive = async () => {
    if (selectedTickets.length === 0) return;
    setBulkSaving(true);
    const result = await bulkArchiveRequests(selectedTickets.map((t) => t.id), archiveReason, { userId, companyId });
    setBulkSaving(false);
    if (result.error) { toast.error('Bulk archive failed', { description: result.error.message }); return; }
    setArchiveDialogOpen(false); setArchiveReason('');
    await invalidateQueue();
    toast.success(`${result.updated} request${result.updated === 1 ? '' : 's'} archived`);
  };

  const handleBulkNotify = async () => {
    if (selectedTickets.length === 0) return;
    setBulkSaving(true);
    const result = await bulkNotifyRequestParticipants(selectedTickets, { audience: notifyAudience, message: notifyMessage }, { userId, companyId });
    setBulkSaving(false);
    if (result.error) { toast.error('Bulk notification failed', { description: result.error.message }); return; }
    setNotifyDialogOpen(false); setNotifyMessage('');
    await invalidateQueue();
    toast.success(`${result.notified} notification${result.notified === 1 ? '' : 's'} queued`);
  };

  return {
    openPriorityDialog: () => setPriorityDialogOpen(true),
    openArchiveDialog: () => setArchiveDialogOpen(true),
    openNotifyDialog: () => setNotifyDialogOpen(true),
    bulkSaving,
    dialogs: (
      <>
        <Dialog open={priorityDialogOpen} onOpenChange={(open) => { setPriorityDialogOpen(open); if (!open) setPriorityReason(''); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Bulk update priority</DialogTitle>
              <DialogDescription>Reason is required and will be recorded in the request activity trail.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Select value={bulkPriority} onValueChange={(value) => setBulkPriority(value as TicketPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((option) => (<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>))}
                </SelectContent>
              </Select>
              <Textarea value={priorityReason} onChange={(e) => setPriorityReason(e.target.value)} rows={3} placeholder="Reason for priority change" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPriorityDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleBulkPriorityUpdate()} disabled={bulkSaving || !priorityReason.trim()}>Update {selectedTickets.length}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={archiveDialogOpen} onOpenChange={(open) => { setArchiveDialogOpen(open); if (!open) setArchiveReason(''); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Bulk archive requests</DialogTitle>
              <DialogDescription>Selected active requests will be cancelled with an admin override reason.</DialogDescription>
            </DialogHeader>
            <Textarea value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} rows={3} placeholder="Reason for archiving" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setArchiveDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => void handleBulkArchive()} disabled={bulkSaving || !archiveReason.trim()}>Archive {selectedTickets.length}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={notifyDialogOpen} onOpenChange={(open) => { setNotifyDialogOpen(open); if (!open) setNotifyMessage(''); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Bulk notify participants</DialogTitle>
              <DialogDescription>Send a request notification to the selected audience and record the action.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Select value={notifyAudience} onValueChange={(value) => setNotifyAudience(value as 'requesters' | 'owners')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="requesters">Requesters</SelectItem>
                  <SelectItem value="owners">Owners</SelectItem>
                </SelectContent>
              </Select>
              <Textarea value={notifyMessage} onChange={(e) => setNotifyMessage(e.target.value)} rows={3} placeholder="Notification message" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNotifyDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleBulkNotify()} disabled={bulkSaving || !notifyMessage.trim()}>Notify {selectedTickets.length}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    ),
  };
}
