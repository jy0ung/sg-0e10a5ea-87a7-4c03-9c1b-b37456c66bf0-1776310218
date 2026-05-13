import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  listLeaveRequests,
  listLeaveTypes,
  listLeaveBalances,
  listLeaveHolidays,
  getLeaveApprovalPreview,
  getLeaveEmployeeInfo,
  createLeaveRequest,
  reviewLeaveRequest,
  validateLeaveAttachment,
} from '@/services/hrmsService';
import type { LeaveDayPart, LeaveRequest, LeaveStatus, CreateLeaveRequestInput } from '@/types';
import { AlertCircle, CheckCircle2, XCircle, Clock, Plus, ChevronDown, ChevronUp, FileText, Paperclip, SlidersHorizontal, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { HRMS_LEAVE_APPROVER_ROLES } from '@/config/hrmsConfig';
import { createLeaveRequestSchema } from '@/lib/validations';
import { notifyApprovalInboxChanged } from '@/lib/hrms/approvalInbox';
import {
  getPendingApprovalsForUser,
  submitApprovalDecision,
} from '@/services/approvalEngineService';

const MANAGER_ROLES = HRMS_LEAVE_APPROVER_ROLES;
const STATUS_COLORS: Record<LeaveStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  approved:  'bg-green-100 text-green-700 border-green-200',
  rejected:  'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

const LEAVE_DRAFT_STORAGE_PREFIX = 'flc.hrms.leave-draft';
const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

const DAY_PART_OPTIONS: Array<{ value: LeaveDayPart; label: string; days: string }> = [
  { value: 'full_day', label: 'Full Day', days: '1.0' },
  { value: 'half_day_morning', label: 'Half Day (Morning)', days: '0.5' },
  { value: 'half_day_afternoon', label: 'Half Day (Afternoon)', days: '0.5' },
];

type ApplyFormState = Partial<CreateLeaveRequestInput> & {
  dayPart: LeaveDayPart;
};

function getDefaultApplyForm(): ApplyFormState {
  return { dayPart: 'full_day' };
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isWeekend(date: string): boolean {
  const day = parseDate(date).getDay();
  return day === 0 || day === 6;
}

function getHolidayDates(holidays: Array<{ date: string; isRecurring: boolean }>, startDate: string, endDate: string): Set<string> {
  if (!startDate || !endDate) return new Set();
  const years = new Set<string>();
  const cursor = parseDate(startDate);
  const end = parseDate(endDate);
  while (cursor.getTime() <= end.getTime()) {
    years.add(String(cursor.getFullYear()));
    cursor.setDate(cursor.getDate() + 1);
  }

  const holidayDates = new Set<string>();
  for (const holiday of holidays) {
    if (holiday.isRecurring) {
      for (const year of years) holidayDates.add(`${year}-${holiday.date.slice(5)}`);
    } else {
      holidayDates.add(holiday.date);
    }
  }
  return holidayDates;
}

// eslint-disable-next-line react-refresh/only-export-components
export function calculateLeaveDays(
  startDate: string | undefined,
  endDate: string | undefined,
  dayPart: LeaveDayPart,
  holidays: Array<{ date: string; isRecurring: boolean }> = [],
): number {
  if (!startDate) return 0;
  const effectiveEndDate = dayPart === 'full_day' ? endDate : startDate;
  if (!effectiveEndDate || effectiveEndDate < startDate) return 0;

  const holidayDates = getHolidayDates(holidays, startDate, effectiveEndDate);
  if (dayPart !== 'full_day') {
    return isWeekend(startDate) || holidayDates.has(startDate) ? 0 : 0.5;
  }

  let days = 0;
  const cursor = parseDate(startDate);
  const end = parseDate(effectiveEndDate);
  while (cursor.getTime() <= end.getTime()) {
    const current = formatDateOnly(cursor);
    if (!isWeekend(current) && !holidayDates.has(current)) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function formatDays(days: number): string {
  return days.toLocaleString(undefined, { minimumFractionDigits: days % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type LeaveApproverIdentity = {
  id?: string;
  role?: string;
} | null | undefined;

// eslint-disable-next-line react-refresh/only-export-components
export function isRequestAssignedToApprover(
  request: LeaveRequest,
  approver: LeaveApproverIdentity,
  isManager: boolean,
): boolean {
  if (request.status !== 'pending' || !approver) return false;
  if (request.currentApproverUserId) return request.currentApproverUserId === approver.id;
  if (request.currentApproverRole) {
    const looksLikeHrmsRoleId = /^[0-9a-f-]{24,}$/i.test(request.currentApproverRole);
    return looksLikeHrmsRoleId ? isManager : request.currentApproverRole === approver.role;
  }
  return isManager;
}

// eslint-disable-next-line react-refresh/only-export-components
export function filterLeaveRequestsForView(
  requests: LeaveRequest[],
  filterStatus: LeaveStatus | 'all',
  viewMode: 'all' | 'my_queue',
  approver: LeaveApproverIdentity,
  isManager: boolean,
): LeaveRequest[] {
  const filteredByStatus = filterStatus === 'all'
    ? requests
    : requests.filter(request => request.status === filterStatus);

  return viewMode === 'my_queue'
    ? filteredByStatus.filter(request => isRequestAssignedToApprover(request, approver, isManager))
    : filteredByStatus;
}

function statusIcon(s: LeaveStatus) {
  if (s === 'approved') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (s === 'rejected') return <XCircle className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

export default function LeaveManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManager = MANAGER_ROLES.includes(user?.role as typeof MANAGER_ROLES[number]);
  const selfServiceEmployeeId = user?.employeeId ?? user?.id;
  const selectedLeaveYear = useMemo(() => {
    return Number((new Date()).getFullYear());
  }, []);

  const queryClient = useQueryClient();

  const { data: leaveData, isPending: loading } = useQuery({
    queryKey: ['leave-management', user?.companyId, user?.id, isManager, selfServiceEmployeeId],
    queryFn: async () => {
      const [reqRes, typeRes, balanceRes, holidayRes, employeeInfoRes, approvalPreviewRes, approvalsRes] = await Promise.all([
        listLeaveRequests(user!.companyId, isManager
          ? { includeApprovalHistory: true }
          : { employeeId: selfServiceEmployeeId, includeApprovalHistory: true }),
        listLeaveTypes(user!.companyId),
        selfServiceEmployeeId ? listLeaveBalances(selfServiceEmployeeId, selectedLeaveYear) : Promise.resolve({ data: [], error: null }),
        listLeaveHolidays(user!.companyId),
        selfServiceEmployeeId ? getLeaveEmployeeInfo(user!.companyId, selfServiceEmployeeId) : Promise.resolve({ data: null, error: null }),
        selfServiceEmployeeId ? getLeaveApprovalPreview(user!.companyId, selfServiceEmployeeId) : Promise.resolve({ data: null, error: null }),
        isManager ? getPendingApprovalsForUser(user!.companyId, user!.id) : Promise.resolve({ data: [], error: null }),
      ]);
      if (reqRes.error) toast({ title: 'Error', description: reqRes.error, variant: 'destructive' });
      if (typeRes.error) toast({ title: 'Error', description: typeRes.error, variant: 'destructive' });
      if (balanceRes.error) toast({ title: 'Error', description: balanceRes.error, variant: 'destructive' });
      if (holidayRes.error) toast({ title: 'Error', description: holidayRes.error, variant: 'destructive' });
      if (employeeInfoRes.error) toast({ title: 'Error', description: employeeInfoRes.error, variant: 'destructive' });
      if (approvalPreviewRes.error) toast({ title: 'Approval flow warning', description: approvalPreviewRes.error, variant: 'destructive' });
      return {
        requests: reqRes.data,
        leaveTypes: typeRes.data,
        leaveBalances: balanceRes.data,
        holidays: holidayRes.data,
        employeeInfo: employeeInfoRes.data,
        approvalPreview: approvalPreviewRes.data,
        pendingApprovals: approvalsRes.data,
      };
    },
    enabled: !!user?.companyId && (!!(isManager) || !!selfServiceEmployeeId),
  });
  const requests       = leaveData?.requests       ?? [];
  const leaveTypes     = leaveData?.leaveTypes     ?? [];
  const leaveBalances   = leaveData?.leaveBalances  ?? [];
  const holidays        = leaveData?.holidays       ?? [];
  const employeeInfo    = leaveData?.employeeInfo   ?? null;
  const approvalPreview = leaveData?.approvalPreview ?? null;
  const pendingApprovals = leaveData?.pendingApprovals ?? [];

  const [filterStatus, setFilterStatus] = useState<LeaveStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'all' | 'my_queue'>('all');
  const [showApply, setShowApply]   = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  // Approval engine queue
  const [approvalsExpanded, setApprovalsExpanded] = useState(true);
  // When a pending approval is being acted on, track the approval_request id
  const [reviewingApprovalId, setReviewingApprovalId] = useState<string | null>(null);

  // Apply form
  const [applyForm, setApplyForm] = useState<ApplyFormState>(getDefaultApplyForm);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const leaveDraftKey = user?.companyId && user?.id
    ? `${LEAVE_DRAFT_STORAGE_PREFIX}:${user.companyId}:${user.id}`
    : null;

  const calculatedDays = calculateLeaveDays(
    applyForm.startDate,
    applyForm.dayPart === 'full_day' ? applyForm.endDate : applyForm.startDate,
    applyForm.dayPart,
    holidays,
  );
  const selectedBalance = leaveBalances.find(balance => balance.leaveTypeId === applyForm.leaveTypeId) ?? null;
  const selectedLeaveType = leaveTypes.find(type => type.id === applyForm.leaveTypeId) ?? null;
  const balanceInsufficient = !!selectedBalance && calculatedDays > selectedBalance.remainingDays;

  useEffect(() => {
    if (!leaveDraftKey || draftRestored) return;
    setDraftRestored(true);
    try {
      const rawDraft = window.localStorage.getItem(leaveDraftKey);
      if (!rawDraft) return;
      const parsed = JSON.parse(rawDraft) as { form?: ApplyFormState };
      if (parsed.form) setApplyForm({ ...getDefaultApplyForm(), ...parsed.form });
    } catch {
      window.localStorage.removeItem(leaveDraftKey);
    }
  }, [draftRestored, leaveDraftKey]);

  useEffect(() => {
    if (!leaveDraftKey || !draftRestored) return;
    try {
      window.localStorage.setItem(leaveDraftKey, JSON.stringify({ form: applyForm, updatedAt: new Date().toISOString() }));
    } catch {
      // Ignore storage failures; the in-memory form still works.
    }
  }, [applyForm, draftRestored, leaveDraftKey]);

  useEffect(() => {
    if (applyForm.dayPart === 'full_day' || !applyForm.startDate) return;
    if (applyForm.endDate !== applyForm.startDate) {
      setApplyForm(form => ({ ...form, endDate: form.startDate }));
    }
  }, [applyForm.dayPart, applyForm.endDate, applyForm.startDate]);

  function canReviewRequest(request: LeaveRequest): boolean {
    return isRequestAssignedToApprover(request, user, isManager);
  }

  const myQueueCount = requests.filter(req => canReviewRequest(req)).length;
  const companyPendingCount = requests.filter(req => req.status === 'pending').length;
  const filtered = filterLeaveRequestsForView(requests, filterStatus, viewMode, user, isManager);

  function toggleHistory(requestId: string) {
    setExpandedHistory(prev => ({ ...prev, [requestId]: !prev[requestId] }));
  }

  function formatTimelineTimestamp(value?: string) {
    if (!value) return 'Unknown time';
    try {
      return format(parseISO(value), 'dd MMM yyyy, h:mm a');
    } catch {
      return value;
    }
  }

  function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;

    const validationError = validateLeaveAttachment(file);
    setAttachmentError(validationError);
    if (validationError) {
      setAttachmentFile(null);
      return;
    }
    setAttachmentFile(file);
  }

  function removeAttachment() {
    setAttachmentFile(null);
    setAttachmentError(null);
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.companyId || !selfServiceEmployeeId) return;
    const endDate = applyForm.dayPart === 'full_day' ? applyForm.endDate : applyForm.startDate;
    const result = createLeaveRequestSchema.safeParse({ ...applyForm, endDate });
    if (!result.success) {
      toast({ title: 'Validation error', description: result.error.errors[0].message, variant: 'destructive' });
      return;
    }
    if (attachmentError) {
      toast({ title: 'Attachment error', description: attachmentError, variant: 'destructive' });
      return;
    }
    if (calculatedDays <= 0) {
      toast({ title: 'Validation error', description: 'Select at least one working leave day.', variant: 'destructive' });
      return;
    }
    if (balanceInsufficient) {
      toast({ title: 'Insufficient leave balance', description: `${selectedLeaveType?.name ?? 'Selected leave'} remaining balance is ${selectedBalance?.remainingDays ?? 0} day(s).`, variant: 'destructive' });
      return;
    }
    const { error } = await createLeaveRequest(selfServiceEmployeeId, user.companyId, {
      ...(result.data as CreateLeaveRequestInput),
      days: calculatedDays,
      attachmentFile: attachmentFile ?? undefined,
    });
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Leave application submitted' });
    setShowApply(false);
    setApplyForm(getDefaultApplyForm());
    setAttachmentFile(null);
    setAttachmentError(null);
    if (leaveDraftKey) window.localStorage.removeItem(leaveDraftKey);
    void queryClient.invalidateQueries({ queryKey: ['leave-management', user?.companyId] });
  }

  async function handleReview() {
    if (!user?.id) return;
    let error: string | null = null;
    if (reviewingApprovalId) {
      // Route through approval engine
      ({ error } = await submitApprovalDecision(reviewingApprovalId, user.id, reviewAction, reviewNote));
    } else if (reviewingId) {
      // Direct review (no workflow configured)
      ({ error } = await reviewLeaveRequest(reviewingId, user.id, reviewAction, reviewNote));
    }
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: `Request ${reviewAction}` });
    notifyApprovalInboxChanged();
    setReviewingId(null);
    setReviewingApprovalId(null);
    setReviewNote('');
    void queryClient.invalidateQueries({ queryKey: ['leave-management', user?.companyId] });
  }

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Leave Management"
        description="Apply for leave and manage approvals"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Leave Management' }]}
        actions={
          <Button size="sm" onClick={() => setShowApply(true)}>
            <Plus className="h-4 w-4 mr-1" /> Apply Leave
          </Button>
        }
      />

      {/* Pending approvals queue (managers only) */}
      {isManager && pendingApprovals.length > 0 && (
        <Card className="overflow-hidden border-amber-200 shadow-sm dark:border-amber-800">
          <CardHeader className="border-b bg-amber-50/70 px-4 py-3 dark:bg-amber-950/20">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                <Clock className="h-4 w-4" />
                Awaiting My Approval ({pendingApprovals.length})
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setApprovalsExpanded(v => !v)}>
                {approvalsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          {approvalsExpanded && (
            <CardContent className="space-y-3 p-4">
              {pendingApprovals.map(pa => (
                <div key={pa.id} className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-0.5 text-sm">
                    <p className="font-medium">{pa.requesterName ?? pa.requesterId}</p>
                    {pa.leaveRequest && (
                      <p className="text-muted-foreground">
                        {pa.leaveRequest.leaveTypeName} · {pa.leaveRequest.days}d
                        &nbsp;({pa.leaveRequest.startDate} – {pa.leaveRequest.endDate})
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">Step: {pa.currentStepName} · Flow: {pa.flowName}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm" variant="outline"
                      className="text-green-700 border-green-300 hover:bg-green-50 h-7 px-2"
                      onClick={() => {
                        setReviewingApprovalId(pa.id);
                        setReviewingId(pa.entityId);
                        setReviewAction('approved');
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="text-red-700 border-red-300 hover:bg-red-50 h-7 px-2"
                      onClick={() => {
                        setReviewingApprovalId(pa.id);
                        setReviewingId(pa.entityId);
                        setReviewAction('rejected');
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Filters */}
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-foreground">Leave filters</p>
              <p className="text-[11px] leading-tight text-muted-foreground">Segment requests by queue and decision state</p>
            </div>
          </div>
          <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground tabular-nums">{filtered.length} requests</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {isManager && (
          <>
            <Button
              variant={viewMode === 'my_queue' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('my_queue')}
            >
              My Queue ({myQueueCount})
            </Button>
            <Button
              variant={viewMode === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('all')}
            >
              All Requests ({requests.length})
            </Button>
            <span className="text-xs text-muted-foreground">Pending company-wide: {companyPendingCount}</span>
          </>
        )}
        {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map(s => (
          <Button
            key={s}
            variant={filterStatus === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus(s)}
            className="capitalize"
          >
            {s}
          </Button>
        ))}
        </div>
      </div>

      {/* Requests list */}
      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-lg border bg-card shadow-sm">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
            {viewMode === 'my_queue' ? 'No approvals are currently assigned to you.' : 'No requests found.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <Card key={req.id} className="overflow-hidden shadow-sm">
              <CardHeader className="border-b bg-muted/30 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{req.employeeName ?? 'You'}</CardTitle>
                    <p className="text-sm text-muted-foreground">{req.leaveTypeName} · {req.days} day(s)</p>
                  </div>
                  <Badge className={`flex items-center gap-1 text-xs capitalize ${STATUS_COLORS[req.status]}`} variant="outline">
                    {statusIcon(req.status)} {req.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 p-4">
                <p className="text-sm">
                  <span className="text-muted-foreground">Period: </span>
                  {req.startDate} → {req.endDate}
                </p>
                {req.reason && (
                  <p className="text-sm"><span className="text-muted-foreground">Reason: </span>{req.reason}</p>
                )}
                {req.attachmentFileName && (
                  <p className="flex items-center gap-1.5 text-sm">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Attachment: </span>
                    <span className="truncate">{req.attachmentFileName}</span>
                  </p>
                )}
                {req.reviewerNote && (
                  <p className="text-sm"><span className="text-muted-foreground">Note: </span>{req.reviewerNote}</p>
                )}
                {req.status === 'pending' && (
                  <p className="text-sm text-muted-foreground">
                    Current step: {req.currentApprovalStepName ?? 'Manager review'}
                  </p>
                )}
                {canReviewRequest(req) && (
                  <p className="text-xs font-medium text-primary">Assigned to you</p>
                )}
                {(req.approvalInstanceId || req.approvalHistory?.length) && (
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => toggleHistory(req.id)}
                    >
                      {expandedHistory[req.id] ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                      {expandedHistory[req.id] ? 'Hide Timeline' : 'Show Timeline'}
                    </Button>
                  </div>
                )}
                {expandedHistory[req.id] && (
                  <div className="mt-3 space-y-3 border-l border-border pl-4">
                    {req.approvalHistory?.map(decision => {
                      const decisionApproved = decision.decision === 'approved';
                      return (
                        <div key={decision.id} className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            {decisionApproved ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <span>{decision.stepName ?? `Step ${decision.stepOrder}`}</span>
                            <span className={decisionApproved ? 'text-green-700' : 'text-red-700'}>
                              {decision.decision}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {decision.approverName ?? 'Unknown approver'} · {formatTimelineTimestamp(decision.decidedAt)}
                          </p>
                          {decision.note && (
                            <p className="text-sm text-muted-foreground">{decision.note}</p>
                          )}
                        </div>
                      );
                    })}
                    {req.status === 'pending' && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{req.currentApprovalStepName ?? 'Awaiting review'}</span>
                          <span>pending</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Waiting for {req.currentApproverRole ? 'assigned HRMS role' : 'assigned approver'}
                        </p>
                      </div>
                    )}
                    {!req.approvalHistory?.length && req.status !== 'pending' && (
                      <p className="text-sm text-muted-foreground">No approval decisions recorded.</p>
                    )}
                  </div>
                )}
                {canReviewRequest(req) && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm" variant="outline"
                      className="text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() => { setReviewingId(req.id); setReviewAction('approved'); }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="text-red-700 border-red-300 hover:bg-red-50"
                      onClick={() => { setReviewingId(req.id); setReviewAction('rejected'); }}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Apply leave dialog */}
      <Dialog open={showApply} onOpenChange={setShowApply}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
          <form onSubmit={handleApply} className="space-y-4">
            <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Branch</p>
                <p className="mt-1 truncate text-sm font-medium">{employeeInfo?.branch ?? 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Department</p>
                <p className="mt-1 truncate text-sm font-medium">{employeeInfo?.department ?? 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Position</p>
                <p className="mt-1 truncate text-sm font-medium">{employeeInfo?.position ?? 'Not assigned'}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select
                value={applyForm.leaveTypeId ?? ''}
                onValueChange={v => setApplyForm(f => ({ ...f, leaveTypeId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.daysPerYear}d/yr)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBalance && (
              <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Entitled Leave</p>
                  <p className="font-semibold">{formatDays(selectedBalance.entitledDays)} Days</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Used Leave</p>
                  <p className="font-semibold">{formatDays(selectedBalance.usedDays)} Days</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining Leave</p>
                  <p className={balanceInsufficient ? 'font-semibold text-destructive' : 'font-semibold'}>
                    {formatDays(selectedBalance.remainingDays)} Days
                  </p>
                </div>
              </div>
            )}
            {applyForm.leaveTypeId && !selectedBalance && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No balance record was found for this leave type in {selectedLeaveYear}.
              </p>
            )}

            <div className="space-y-2">
              <Label>Leave Duration</Label>
              <ToggleGroup
                type="single"
                value={applyForm.dayPart}
                onValueChange={value => {
                  if (!value) return;
                  const dayPart = value as LeaveDayPart;
                  setApplyForm(form => ({
                    ...form,
                    dayPart,
                    endDate: dayPart === 'full_day' ? form.endDate : form.startDate,
                  }));
                }}
                className="grid grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {DAY_PART_OPTIONS.map(option => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="h-auto justify-start rounded-md border px-3 py-2 text-left data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    <span>
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-xs opacity-80">{option.days} day</span>
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={applyForm.startDate ?? ''}
                  onChange={e => setApplyForm(f => ({
                    ...f,
                    startDate: e.target.value,
                    endDate: f.dayPart === 'full_day' ? f.endDate : e.target.value,
                  }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={applyForm.dayPart === 'full_day' ? applyForm.endDate ?? '' : applyForm.startDate ?? ''}
                  onChange={e => setApplyForm(f => ({ ...f, endDate: e.target.value }))}
                  disabled={applyForm.dayPart !== 'full_day'}
                  required
                />
              </div>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2">
              <p className="text-sm font-semibold">Total Leave Applied: {formatDays(calculatedDays)} Day{calculatedDays === 1 ? '' : 's'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Weekends and configured public/company holidays are excluded.</p>
              {balanceInsufficient && (
                <p className="mt-1 text-xs font-medium text-destructive">Insufficient balance for this leave type.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea value={applyForm.reason ?? ''} onChange={e => setApplyForm(f => ({ ...f, reason: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Supporting Document</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                className="sr-only"
                onChange={handleAttachmentChange}
              />
              <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4" />
                Upload PDF/JPG/PNG (max 3MB)
              </Button>
              {attachmentFile && (
                <div className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{attachmentFile.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(attachmentFile.size)}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={removeAttachment} aria-label={`Remove ${attachmentFile.name}`}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {attachmentError && (
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {attachmentError}
                </p>
              )}
            </div>
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <p>
                This leave request will be submitted to:{' '}
                <span className="font-semibold">{approvalPreview?.nextStepLabel ?? 'Manual HR review'}</span>
              </p>
              {approvalPreview?.fullFlow && approvalPreview.fullFlow.length > 1 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Approval flow: {approvalPreview.fullFlow.join(' → ')}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowApply(false)}>Cancel</Button>
              <Button type="submit" disabled={calculatedDays <= 0 || balanceInsufficient || !!attachmentError}>Submit</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Review dialog */}
      <Dialog open={!!reviewingId} onOpenChange={v => { if (!v) setReviewingId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="capitalize">{reviewAction} Leave Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Note (optional)</Label>
            <Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={3} placeholder="Leave a note for the employee..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewingId(null)}>Cancel</Button>
            <Button
              onClick={handleReview}
              className={reviewAction === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              Confirm {reviewAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
