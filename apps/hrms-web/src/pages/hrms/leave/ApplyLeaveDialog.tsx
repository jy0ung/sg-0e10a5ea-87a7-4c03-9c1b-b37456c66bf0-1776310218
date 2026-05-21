import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, CheckCircle2, FileText, Paperclip, X, XCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  createLeaveRequest,
  validateLeaveAttachment,
  type LeaveApprovalPreview,
  type LeaveEmployeeInfo,
  type LeaveHoliday,
} from '@/services/hrmsService';
import { checkLeaveQuotaAvailability } from '../../../services/leaveQuotaService';
import { createLeaveRequestSchema } from '@/lib/validations';
import type { CreateLeaveRequestInput, LeaveDayPart, LeaveBalance, LeaveType } from '@/types';
import { calculateLeaveDays, formatBytes, formatDays } from './utils';

const LEAVE_DRAFT_STORAGE_PREFIX = 'flc.hrms.leave-draft';
const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

const DAY_PART_OPTIONS: Array<{ value: LeaveDayPart; label: string; days: string }> = [
  { value: 'full_day', label: 'Full Day', days: '1.0' },
  { value: 'half_day_morning', label: 'Half Day (Morning)', days: '0.5' },
  { value: 'half_day_afternoon', label: 'Half Day (Afternoon)', days: '0.5' },
];

type ApplyFormState = Partial<CreateLeaveRequestInput> & { dayPart: LeaveDayPart };

function getDefaultForm(): ApplyFormState {
  return { dayPart: 'full_day' };
}

interface ApplyLeaveDialogProps {
  open: boolean;
  onClose: () => void;
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  holidays: LeaveHoliday[];
  employeeInfo: LeaveEmployeeInfo | null;
  approvalPreview: LeaveApprovalPreview | null;
  onSuccess: () => void;
}

export function ApplyLeaveDialog({
  open,
  onClose,
  leaveTypes,
  leaveBalances,
  holidays,
  employeeInfo,
  approvalPreview,
  onSuccess,
}: ApplyLeaveDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const selfServiceEmployeeId = user?.employeeId ?? user?.id;
  const selectedLeaveYear = new Date().getFullYear();
  const leaveDraftKey = user?.companyId && user?.id
    ? `${LEAVE_DRAFT_STORAGE_PREFIX}:${user.companyId}:${user.id}`
    : null;

  const [form, setForm] = useState<ApplyFormState>(getDefaultForm);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore draft on open
  useEffect(() => {
    if (!open || !leaveDraftKey || draftRestored) return;
    setDraftRestored(true);
    try {
      const raw = window.localStorage.getItem(leaveDraftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { form?: ApplyFormState };
        if (parsed.form) setForm({ ...getDefaultForm(), ...parsed.form });
      }
    } catch {
      window.localStorage.removeItem(leaveDraftKey);
    }
  }, [open, draftRestored, leaveDraftKey]);

  // Save draft
  useEffect(() => {
    if (!leaveDraftKey || !draftRestored) return;
    try {
      window.localStorage.setItem(leaveDraftKey, JSON.stringify({ form, updatedAt: new Date().toISOString() }));
    } catch { /* ignore */ }
  }, [form, draftRestored, leaveDraftKey]);

  // Sync end date for half-day
  useEffect(() => {
    if (form.dayPart === 'full_day' || !form.startDate) return;
    if (form.endDate !== form.startDate) setForm(f => ({ ...f, endDate: f.startDate }));
  }, [form.dayPart, form.endDate, form.startDate]);

  const selectedLeaveType = leaveTypes.find(t => t.id === form.leaveTypeId) ?? null;
  const selectedBalance = leaveBalances.find(b => b.leaveTypeId === form.leaveTypeId) ?? null;
  const effectiveEnd = form.dayPart === 'full_day' ? form.endDate : form.startDate;

  const calculatedDays = calculateLeaveDays(form.startDate, effectiveEnd, form.dayPart, holidays);
  const balanceInsufficient = (selectedLeaveType?.requiresBalance !== false) &&
    !!selectedBalance && calculatedDays > selectedBalance.remainingDays;

  const advanceNoticeDays = selectedLeaveType?.minAdvanceNoticeDays ?? null;
  const advanceNoticeViolation: string | null = (() => {
    if (!advanceNoticeDays || !form.startDate) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const minStart = new Date(today.getTime() + advanceNoticeDays * 24 * 60 * 60 * 1000);
    const start = new Date(`${form.startDate}T00:00:00`);
    return start < minStart
      ? `${selectedLeaveType?.name ?? 'This leave type'} requires ${advanceNoticeDays} day${advanceNoticeDays === 1 ? '' : 's'} advance notice. Earliest: ${minStart.toISOString().slice(0, 10)}.`
      : null;
  })();

  const quotaCheckEnabled = !!user?.companyId && !!selfServiceEmployeeId &&
    !!form.leaveTypeId && !!form.startDate && !!effectiveEnd;

  const { data: quotaAvailability, isFetching: quotaLoading } = useQuery({
    queryKey: ['leave-quota-check', user?.companyId, selfServiceEmployeeId, form.leaveTypeId, form.startDate, effectiveEnd, form.dayPart],
    queryFn: () => checkLeaveQuotaAvailability(
      user!.companyId,
      selfServiceEmployeeId!,
      form.leaveTypeId,
      form.startDate,
      effectiveEnd,
      form.dayPart as 'full_day' | 'half_day_morning' | 'half_day_afternoon',
    ),
    enabled: quotaCheckEnabled,
    staleTime: 30000,
  });

  function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    const err = validateLeaveAttachment(file);
    setAttachmentError(err);
    setAttachmentFile(err ? null : file);
  }

  function handleClose() {
    onClose();
    setForm(getDefaultForm());
    setAttachmentFile(null);
    setAttachmentError(null);
    setDraftRestored(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.companyId || !selfServiceEmployeeId) return;
    const endDate = form.dayPart === 'full_day' ? form.endDate : form.startDate;
    const result = createLeaveRequestSchema.safeParse({ ...form, endDate });
    if (!result.success) {
      toast({ title: 'Validation error', description: result.error.errors[0].message, variant: 'destructive' });
      return;
    }
    if (attachmentError) { toast({ title: 'Attachment error', description: attachmentError, variant: 'destructive' }); return; }
    if (calculatedDays <= 0) { toast({ title: 'Validation error', description: 'Select at least one working leave day.', variant: 'destructive' }); return; }
    if (balanceInsufficient) { toast({ title: 'Insufficient balance', description: `${selectedLeaveType?.name ?? 'Selected leave'} remaining: ${selectedBalance?.remainingDays ?? 0} day(s).`, variant: 'destructive' }); return; }
    if (advanceNoticeViolation) { toast({ title: 'Advance notice required', description: advanceNoticeViolation, variant: 'destructive' }); return; }
    if (quotaAvailability?.isQuotaFull) { toast({ title: 'Quota exceeded', description: quotaAvailability.message ?? 'Leave quota is full for this period.', variant: 'destructive' }); return; }

    const { error } = await createLeaveRequest(selfServiceEmployeeId, user.companyId, {
      leaveTypeId: result.data.leaveTypeId,
      startDate:   result.data.startDate,
      endDate:     result.data.endDate,
      dayPart:     result.data.dayPart,
      reason:      result.data.reason,
      days: calculatedDays,
      attachmentFile: attachmentFile ?? undefined,
    });

    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Leave application submitted' });
    if (leaveDraftKey) window.localStorage.removeItem(leaveDraftKey);
    void queryClient.invalidateQueries({ queryKey: ['leave-management', user?.companyId] });
    handleClose();
    onSuccess();
  }

  const canSubmit = calculatedDays > 0 && !balanceInsufficient && !advanceNoticeViolation && !attachmentError && quotaAvailability?.isQuotaFull !== true;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply for Leave</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employee info */}
          {employeeInfo && (
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Branch</p>
                <p className="mt-0.5 truncate text-sm font-medium">{employeeInfo.branch || 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Department</p>
                <p className="mt-0.5 truncate text-sm font-medium">{employeeInfo.department || 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Position</p>
                <p className="mt-0.5 truncate text-sm font-medium">{employeeInfo.position || 'Not assigned'}</p>
              </div>
            </div>
          )}

          {/* Leave type */}
          <div className="space-y-2">
            <Label>Leave Type</Label>
            <Select value={form.leaveTypeId ?? ''} onValueChange={v => setForm(f => ({ ...f, leaveTypeId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
              <SelectContent>
                {leaveTypes.filter(lt => lt.active).map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{t.requiresBalance ? ` (${t.daysPerYear}d/yr)` : ' — Unpaid'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Balance display */}
          {selectedLeaveType?.requiresBalance && selectedBalance && (
            <div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">Entitled</p><p className="font-semibold">{formatDays(selectedBalance.entitledDays)} days</p></div>
              <div><p className="text-xs text-muted-foreground">Used</p><p className="font-semibold">{formatDays(selectedBalance.usedDays)} days</p></div>
              <div><p className="text-xs text-muted-foreground">Remaining</p><p className={`font-semibold ${balanceInsufficient ? 'text-destructive' : ''}`}>{formatDays(selectedBalance.remainingDays)} days</p></div>
            </div>
          )}
          {selectedLeaveType && !selectedLeaveType.requiresBalance && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">Unpaid leave — no balance required.</p>
          )}
          {form.leaveTypeId && selectedLeaveType?.requiresBalance && !selectedBalance && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">No balance record for {selectedLeaveYear}. Contact HR.</p>
          )}

          {/* Duration */}
          <div className="space-y-2">
            <Label>Leave Duration</Label>
            <ToggleGroup
              type="single"
              value={form.dayPart}
              onValueChange={value => {
                if (!value) return;
                const dayPart = value as LeaveDayPart;
                setForm(f => ({ ...f, dayPart, endDate: dayPart === 'full_day' ? f.endDate : f.startDate }));
              }}
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {DAY_PART_OPTIONS.map(opt => (
                <ToggleGroupItem
                  key={opt.value}
                  value={opt.value}
                  className="h-auto justify-start rounded-lg border px-3 py-2 text-left data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  <span>
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="block text-xs opacity-80">{opt.days} day</span>
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.startDate ?? ''}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: f.dayPart === 'full_day' ? f.endDate : e.target.value }))}
                required
              />
              {advanceNoticeDays && (
                <p className="text-xs text-muted-foreground">{advanceNoticeDays} day{advanceNoticeDays === 1 ? '' : 's'} advance notice required</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={form.dayPart === 'full_day' ? form.endDate ?? '' : form.startDate ?? ''}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                disabled={form.dayPart !== 'full_day'}
                required
              />
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-1.5 rounded-lg border bg-muted/20 px-3 py-2.5">
            <p className="text-sm font-semibold">Total: {formatDays(calculatedDays)} working day{calculatedDays === 1 ? '' : 's'}</p>
            <p className="text-xs text-muted-foreground">Weekends and public holidays excluded.</p>
            {balanceInsufficient && (
              <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Insufficient leave balance.
              </p>
            )}
            {advanceNoticeViolation && (
              <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {advanceNoticeViolation}
              </p>
            )}
            {quotaCheckEnabled && (
              quotaLoading ? (
                <p className="text-xs text-muted-foreground">Checking quota…</p>
              ) : quotaAvailability?.hasRule ? (
                <p className={`flex items-center gap-1 text-xs ${
                  quotaAvailability.isQuotaFull ? 'font-medium text-destructive'
                  : quotaAvailability.isQuotaNearlyFull ? 'text-amber-700 dark:text-amber-400'
                  : 'text-emerald-700 dark:text-emerald-400'
                }`}>
                  {quotaAvailability.isQuotaFull
                    ? <><XCircle className="h-3.5 w-3.5 shrink-0" />{quotaAvailability.message ?? 'Quota full.'}</>
                    : <><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{quotaAvailability.message ?? `${Math.floor(quotaAvailability.available)} slot(s) remaining`}</>
                  }
                </p>
              ) : null
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              value={form.reason ?? ''}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              rows={3}
              placeholder="Reason for leave…"
            />
          </div>

          {/* Attachment */}
          <div className="space-y-2">
            <Label htmlFor="leave-attachment">
              Supporting Document <span className="text-xs font-normal text-muted-foreground">(PDF/JPG/PNG, max 3 MB)</span>
            </Label>
            <input
              id="leave-attachment"
              ref={fileInputRef}
              type="file"
              aria-label="Upload supporting document"
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              onChange={handleAttachmentChange}
            />
            {!attachmentFile ? (
              <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4" /> Attach document
              </Button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{attachmentFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(attachmentFile.size)}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={() => { setAttachmentFile(null); setAttachmentError(null); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {attachmentError && <p className="text-xs text-destructive">{attachmentError}</p>}
          </div>

          {/* Approval preview */}
          {approvalPreview && (
            <div className="flex items-start gap-2 rounded-lg border bg-blue-50/50 px-3 py-2 text-xs text-muted-foreground dark:bg-blue-950/20">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span>
                <span className="font-medium">Approval: {approvalPreview.nextStepLabel ?? 'Direct review'}</span>
                {approvalPreview.fullFlow && approvalPreview.fullFlow.length > 1 && (
                  <span className="ml-1">{approvalPreview.fullFlow.join(' → ')}</span>
                )}
              </span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit}>Submit Request</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
