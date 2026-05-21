import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { createLeaveRequest } from '@/services/hrmsService';
import { createLeaveRequestSchema } from '@/lib/validations';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { CalendarPlus } from 'lucide-react';
import type { LeaveType, CreateLeaveRequestInput } from '@/types';

interface ApplyLeaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaveTypes: LeaveType[];
  employeeId: string;
  companyId: string;
}

export default function ApplyLeaveDialog({
  open,
  onOpenChange,
  leaveTypes,
  employeeId,
  companyId,
}: ApplyLeaveDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<CreateLeaveRequestInput>>({});
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setForm({});
    setSubmitting(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !companyId) return;

    const result = createLeaveRequestSchema.safeParse(form);
    if (!result.success) {
      toast({ title: 'Validation error', description: result.error.errors[0].message, variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const days = differenceInCalendarDays(
      parseISO(form.endDate!),
      parseISO(form.startDate!),
    ) + 1;

    const { error } = await createLeaveRequest(employeeId, companyId, {
      ...form as CreateLeaveRequestInput,
      days,
    });

    if (error) {
      toast({ title: 'Error', description: error, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    toast({ title: 'Leave application submitted', description: `${days} day${days !== 1 ? 's' : ''} requested successfully.` });
    onOpenChange(false);
    reset();
    void queryClient.invalidateQueries({ queryKey: ['leave-control-center'] });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <CalendarPlus className="h-4 w-4 text-primary" />
            </div>
            Apply for Leave
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Leave Type</Label>
            <Select
              value={form.leaveTypeId ?? ''}
              onValueChange={v => setForm(f => ({ ...f, leaveTypeId: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted-foreground ml-1.5">
                      ({t.daysPerYear > 0 ? `${t.daysPerYear}d/yr` : 'Unpaid'})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Start Date</Label>
              <Input
                type="date"
                value={form.startDate ?? ''}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">End Date</Label>
              <Input
                type="date"
                value={form.endDate ?? ''}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                required
              />
            </div>
          </div>

          {form.startDate && form.endDate && form.endDate >= form.startDate && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Duration: <span className="font-semibold text-foreground">
                {differenceInCalendarDays(parseISO(form.endDate), parseISO(form.startDate)) + 1} day(s)
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-medium">Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              value={form.reason ?? ''}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              rows={3}
              placeholder="Brief reason for leave..."
              className="resize-none"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Application'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
