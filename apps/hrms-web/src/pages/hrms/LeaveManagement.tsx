import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
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
  validateLeaveAttachment,
} from '@/services/hrmsService';
import type { LeaveDayPart, LeaveRequest, LeaveStatus, CreateLeaveRequestInput, LeaveType, LeaveBalance } from '@/types';
import { AlertCircle, AlertTriangle, CheckCircle2, XCircle, Clock, Plus, ChevronDown, ChevronUp, FileText, Paperclip, X, Calendar, Users, Search, TrendingUp, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { matchesHrmsApproverRole, type HrmsApproverIdentity } from '@/lib/hrms/access';
import { createLeaveRequestSchema } from '@/lib/validations';
import { getApprovalInboxReviewPath } from '@/lib/hrms/approvalInbox';
import { checkLeaveQuotaAvailability } from '@/services/leaveQuotaService';
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

export type LeaveApproverIdentity = HrmsApproverIdentity;

// eslint-disable-next-line react-refresh/only-export-components
export function isRequestAssignedToApprover(
  request: LeaveRequest,
  approver: LeaveApproverIdentity,
  _canApproveRequests: boolean,
): boolean {
  if (request.status !== 'pending' || !approver) return false;
  if (request.currentApproverUserId) return request.currentApproverUserId === approver.id;
  if (request.currentApproverRole) return matchesHrmsApproverRole(request.currentApproverRole, approver);
  return false;
}

// eslint-disable-next-line react-refresh/only-export-components
export function filterLeaveRequestsForView(
  requests: LeaveRequest[],
  filterStatus: LeaveStatus | 'all',
  viewMode: 'all' | 'my_queue',
  approver: LeaveApproverIdentity,
  canApproveRequests: boolean,
): LeaveRequest[] {
  const filteredByStatus = filterStatus === 'all'
    ? requests
    : requests.filter(request => request.status === filterStatus);

  return viewMode === 'my_queue'
    ? filteredByStatus.filter(request => isRequestAssignedToApprover(request, approver, canApproveRequests))
    : filteredByStatus;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type LeaveTab = 'my-leave' | 'team-leave';

type StatusConfig = {
  label: string;
  stage: string | null;
  className: string;
  stageClassName: string;
};

// ─── Status display helpers ───────────────────────────────────────────────────

function getStatusConfig(req: LeaveRequest): StatusConfig {
  const lastHistory = req.approvalHistory?.length
    ? req.approvalHistory[req.approvalHistory.length - 1]
    : undefined;

  switch (req.status) {
    case 'approved':
      return {
        label: 'Approved',
        stage: lastHistory?.stepName ? `${lastHistory.stepName} Approved` : null,
        className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
        stageClassName: 'text-emerald-600 dark:text-emerald-500',
      };
    case 'rejected': {
      const rejectedAt = req.approvalHistory?.find(d => d.decision === 'rejected');
      const stageLabel = rejectedAt?.stepName
        ? `Rejected at ${rejectedAt.stepName}`
        : rejectedAt?.approverName
          ? `Rejected by ${rejectedAt.approverName}`
          : null;
      return {
        label: 'Rejected',
        stage: stageLabel,
        className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
        stageClassName: 'text-red-500/80 dark:text-red-400/70',
      };
    }
    case 'cancelled':
      return {
        label: 'Cancelled',
        stage: null,
        className: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
        stageClassName: 'text-muted-foreground',
      };
    default: // pending
      if (req.currentApprovalStepName) {
        return {
          label: 'Pending Approval',
          stage: req.currentApprovalStepName,
          className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
          stageClassName: 'text-amber-600/80 dark:text-amber-500/80',
        };
      }
      return {
        label: 'Pending Approval',
        stage: 'Awaiting Review',
        className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
        stageClassName: 'text-amber-600/80 dark:text-amber-500/80',
      };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BalanceCard({ lt, balance }: { lt: LeaveType; balance: LeaveBalance | null }) {
  const isUnpaid    = !lt.requiresBalance;
  const hasBalance  = !!balance;
  const entitled    = balance?.entitledDays  ?? 0;
  const used        = balance?.usedDays      ?? 0;
  const remaining   = balance?.remainingDays ?? 0;
  const pct         = entitled > 0 ? Math.min(100, (used / entitled) * 100) : 0;
  const isLow       = !isUnpaid && hasBalance && entitled > 0 && remaining <= 3;
  const isCritical  = !isUnpaid && hasBalance && entitled > 0 && remaining < 1;

  return (
    <div className={[
      'flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow',
      isLow ? 'border-amber-200 dark:border-amber-800' : '',
    ].join(' ')}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{lt.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isUnpaid ? 'Unpaid leave' : lt.isPaid ? `Paid · ${lt.daysPerYear} days/year` : `${lt.daysPerYear} days/year`}
          </p>
        </div>
        {isLow && (
          <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${isCritical ? 'text-red-500' : 'text-amber-500'}`} />
        )}
      </div>

      {isUnpaid ? (
        <div className="mt-auto space-y-0.5 rounded-md bg-muted/50 px-2.5 py-2">
          <p className="text-xs font-medium text-foreground">No entitlement limit</p>
          <p className="text-xs text-muted-foreground">Subject to approval</p>
        </div>
      ) : hasBalance ? (
        <div className="mt-auto">
          <div className="mb-1 flex items-end justify-between">
            <span className={`text-2xl font-bold tabular-nums leading-none ${isCritical ? 'text-red-600 dark:text-red-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
              {formatDays(remaining)}
            </span>
            <span className="pb-0.5 text-xs text-muted-foreground">of {formatDays(entitled)}</span>
          </div>
          <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${isCritical ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.max(0, 100 - pct)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{formatDays(used)} used</p>
        </div>
      ) : (
        <p className="mt-auto text-xs italic text-muted-foreground">Balance not initialized</p>
      )}
    </div>
  );
}

function StatusBadge({ req }: { req: LeaveRequest }) {
  const { label, stage, className, stageClassName } = getStatusConfig(req);
  return (
    <div className="flex min-w-0 flex-col items-end gap-0.5">
      <Badge variant="outline" className={`shrink-0 text-xs font-medium ${className}`}>{label}</Badge>
      {stage && <span className={`hidden max-w-32 truncate text-right text-xs sm:block ${stageClassName}`}>{stage}</span>}
    </div>
  );
}

function LeaveSnapshotMetric({
  icon, label, value, subLabel, colorClass, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subLabel?: string;
  colorClass?: string;
  onClick?: () => void;
}) {
  const base = 'flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} cursor-pointer text-left`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <p className={`text-xl font-bold tabular-nums leading-tight ${colorClass ?? 'text-foreground'}`}>{value}</p>
      {subLabel && <p className="truncate text-xs text-muted-foreground">{subLabel}</p>}
    </button>
  ) : (
    <div className={base}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <p className={`text-xl font-bold tabular-nums leading-tight ${colorClass ?? 'text-foreground'}`}>{value}</p>
      {subLabel && <p className="truncate text-xs text-muted-foreground">{subLabel}</p>}
    </div>
  );
}

function ApprovalTimeline({ req, fmtTs }: { req: LeaveRequest; fmtTs: (v?: string) => string }) {
  return (
    <div className="space-y-3 border-l-2 border-border pl-4">
      {req.approvalHistory?.map(d => {
        const ok = d.decision === 'approved';
        return (
          <div key={d.id} className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-red-600" />}
              <span>{d.stepName ?? `Step ${d.stepOrder}`}</span>
              <Badge variant="outline" className={`text-xs ${ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{d.decision}</Badge>
            </div>
            <p className="ml-6 text-xs text-muted-foreground">{d.approverName ?? 'Unknown approver'} · {fmtTs(d.decidedAt)}</p>
            {d.note && <p className="ml-6 text-xs italic text-muted-foreground">"{d.note}"</p>}
          </div>
        );
      })}
      {req.status === 'pending' && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0 text-amber-500" />
            <span>{req.currentApprovalStepName ?? 'Awaiting review'}</span>
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">pending</Badge>
          </div>
          <p className="ml-6 text-xs text-muted-foreground">Waiting for {req.currentApproverRole ? 'assigned HRMS role' : 'assigned approver'}</p>
        </div>
      )}
      {!req.approvalHistory?.length && req.status !== 'pending' && (
        <p className="text-sm text-muted-foreground">No approval decisions recorded.</p>
      )}
    </div>
  );
}

function LeaveRequestRow({ req, isMyLeave, canReview, expanded, onToggleExpand, fmtTs }: {
  req: LeaveRequest; isMyLeave: boolean; canReview: boolean;
  expanded: boolean; onToggleExpand: () => void;
  fmtTs: (v?: string) => string;
}) {
  const hasTimeline = !!(req.approvalInstanceId || req.approvalHistory?.length);
  return (
    <div className={['overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow', canReview ? 'border-amber-200 dark:border-amber-800' : ''].join(' ')}>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {!isMyLeave && <span className="text-sm font-semibold text-foreground">{req.employeeName ?? 'Unknown employee'}</span>}
            <span className={`text-sm font-medium ${isMyLeave ? 'text-foreground' : 'text-muted-foreground'}`}>{req.leaveTypeName ?? 'Leave'}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs tabular-nums text-muted-foreground">{formatDays(req.days)} day{req.days !== 1 ? 's' : ''}</span>
            {canReview && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400">
                Action Required
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="tabular-nums">{req.startDate} → {req.endDate}</span>
            {req.reason && <span className="hidden max-w-52 truncate sm:block" title={req.reason}>{req.reason}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-2 pt-0.5">
          <StatusBadge req={req} />
          {hasTimeline && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={onToggleExpand}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
          {hasTimeline && <ApprovalTimeline req={req} fmtTs={fmtTs} />}
          {req.reviewerNote && <p className="text-sm text-muted-foreground"><span className="font-medium">Reviewer note: </span>{req.reviewerNote}</p>}
          {req.attachmentFileName && (
            <p className="flex items-center gap-1.5 text-sm">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">Attachment:</span>
              <span className="truncate">{req.attachmentFileName}</span>
            </p>
          )}
        </div>
      )}
      {canReview && (
        <div className="flex items-center gap-2 border-t bg-amber-50/50 px-4 py-2.5 dark:bg-amber-950/10">
          <span className="flex-1 text-xs text-muted-foreground">
            {req.currentApprovalStepName ? `Stage: ${req.currentApprovalStepName}` : 'Direct review'}
          </span>
          <Button asChild size="sm" variant="outline" className="h-7 border-amber-300 px-3 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300">
            <Link to={getApprovalInboxReviewPath('leave_request', req.id)}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Review in Approval Inbox
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ title, count, colorClass }: { title: string; count?: number; colorClass?: string }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {count != null && count > 0 && (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${colorClass ?? 'bg-muted text-muted-foreground'}`}>{count}</span>
      )}
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

function LoadingRow() {
  return <div className="h-20 animate-pulse rounded-xl border bg-muted/30" />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LeaveManagement() {
  const { user } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const canApproveRequests = hrmsAccess.canApproveRequests;
  const canViewTeam        = canApproveRequests || hrmsAccess.canAccessEmployees;
  const selfServiceEmployeeId = user?.employeeId ?? user?.id;
  const selectedLeaveYear = useMemo(() => new Date().getFullYear(), []);

  const queryClient = useQueryClient();

  const { data: leaveData, isPending: loading } = useQuery({
    queryKey: ['leave-management', user?.companyId, user?.id, canApproveRequests, selfServiceEmployeeId],
    queryFn: async () => {
      const [reqRes, typeRes, balanceRes, holidayRes, employeeInfoRes, approvalPreviewRes] = await Promise.all([
        listLeaveRequests(user!.companyId, canApproveRequests
          ? { includeApprovalHistory: true }
          : { employeeId: selfServiceEmployeeId, includeApprovalHistory: true }),
        listLeaveTypes(user!.companyId),
        selfServiceEmployeeId ? listLeaveBalances(selfServiceEmployeeId, selectedLeaveYear) : Promise.resolve({ data: [], error: null }),
        listLeaveHolidays(user!.companyId),
        selfServiceEmployeeId ? getLeaveEmployeeInfo(user!.companyId, selfServiceEmployeeId) : Promise.resolve({ data: null, error: null }),
        selfServiceEmployeeId ? getLeaveApprovalPreview(user!.companyId, selfServiceEmployeeId) : Promise.resolve({ data: null, error: null }),
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
      };
    },
    enabled: !!user?.companyId && (!!canApproveRequests || !!selfServiceEmployeeId),
  });
  const requests       = useMemo(() => leaveData?.requests       ?? [], [leaveData]);
  const leaveTypes     = leaveData?.leaveTypes     ?? [];
  const leaveBalances   = leaveData?.leaveBalances  ?? [];
  const holidays        = leaveData?.holidays       ?? [];
  const employeeInfo    = leaveData?.employeeInfo   ?? null;
  const approvalPreview = leaveData?.approvalPreview ?? null;

  // ── Navigation ──────────────────────────────────────────────────────────────
  const requestedTab = searchParams.get('tab') as LeaveTab | null;
  const activeTab: LeaveTab = requestedTab === 'team-leave' && canViewTeam ? 'team-leave' : 'my-leave';
  function setActiveTab(tab: LeaveTab) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'my-leave') next.delete('tab');
      else next.set('tab', tab);
      return next;
    });
  }

  // ── Team leave filter state ──────────────────────────────────────────────────
  const [teamFilterStatus, setTeamFilterStatus] = useState<LeaveStatus | 'all'>('all');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamViewMode, setTeamViewMode] = useState<'all' | 'my_queue'>('all');

  // ── Expanded timelines ───────────────────────────────────────────────────────
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  // ── Apply form state ─────────────────────────────────────────────────────────
  const [showApply, setShowApply] = useState(false);
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
  // Balance check only applies when the leave type requires a balance (e.g. unpaid leave does not)
  const balanceInsufficient =
    (selectedLeaveType?.requiresBalance !== false) &&
    !!selectedBalance &&
    calculatedDays > selectedBalance.remainingDays;
  // Advance notice check: block submission if start_date is fewer than minAdvanceNoticeDays calendar days away
  const advanceNoticeDays = selectedLeaveType?.minAdvanceNoticeDays ?? null;
  const advanceNoticeViolation: string | null = (() => {
    if (!advanceNoticeDays || !applyForm.startDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minStart = new Date(today.getTime() + advanceNoticeDays * 24 * 60 * 60 * 1000);
    const start = new Date(`${applyForm.startDate}T00:00:00`);
    return start < minStart
      ? `${selectedLeaveType?.name ?? 'This leave type'} must be applied at least ${advanceNoticeDays} calendar day${advanceNoticeDays === 1 ? '' : 's'} in advance. Earliest start date: ${minStart.toISOString().slice(0, 10)}.`
      : null;
  })();

  // ── Quota availability check ────────────────────────────────────────────────
  const quotaCheckEnabled =
    !!user?.companyId &&
    !!selfServiceEmployeeId &&
    !!applyForm.leaveTypeId &&
    !!applyForm.startDate &&
    !!(applyForm.dayPart === 'full_day' ? applyForm.endDate : applyForm.startDate);
  const { data: quotaAvailability, isFetching: quotaLoading } = useQuery({
    queryKey: [
      'leave-quota-check',
      user?.companyId,
      selfServiceEmployeeId,
      applyForm.leaveTypeId,
      applyForm.startDate,
      applyForm.dayPart === 'full_day' ? applyForm.endDate : applyForm.startDate,
      applyForm.dayPart,
    ],
    queryFn: () =>
      checkLeaveQuotaAvailability(
        user!.companyId,
        selfServiceEmployeeId!,
        applyForm.leaveTypeId,
        applyForm.startDate,
        applyForm.dayPart === 'full_day' ? applyForm.endDate : applyForm.startDate,
        applyForm.dayPart as 'full_day' | 'half_day_morning' | 'half_day_afternoon',
      ),
    enabled: quotaCheckEnabled,
    staleTime: 30000,
  });

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

  // ── Approver identity ────────────────────────────────────────────────────────
  const approverIdentity: LeaveApproverIdentity = useMemo(() => ({
    id: user?.id,
    hrmsRoleIds:   hrmsAccess.roleIds,
    hrmsRoleCodes: hrmsAccess.roleCodes,
  }), [user?.id, hrmsAccess.roleIds, hrmsAccess.roleCodes]);

  function canReviewRequest(req: LeaveRequest): boolean {
    return isRequestAssignedToApprover(req, approverIdentity, canApproveRequests);
  }

  // ── Derived request sets ─────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const myRequests = useMemo(
    () => requests.filter(r => r.employeeId === selfServiceEmployeeId),
    [requests, selfServiceEmployeeId],
  );
  const myActivePending = myRequests.filter(r => r.status === 'pending');
  const myUpcoming      = myRequests.filter(r => r.status === 'approved' && r.startDate > today);
  const myHistory       = myRequests.filter(r => r.status !== 'pending' && !(r.status === 'approved' && r.startDate > today));

  const filteredTeamRequests = useMemo(() => {
    let result = requests;
    if (teamViewMode === 'my_queue') result = result.filter(r => canReviewRequest(r));
    if (teamFilterStatus !== 'all')  result = result.filter(r => r.status === teamFilterStatus);
    if (teamSearch.trim()) {
      const q = teamSearch.toLowerCase();
      result = result.filter(r =>
        (r.employeeName ?? '').toLowerCase().includes(q) ||
        (r.leaveTypeName ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, teamViewMode, teamFilterStatus, teamSearch, canApproveRequests]);

  function toggleHistory(requestId: string) {
    setExpandedHistory(prev => ({ ...prev, [requestId]: !prev[requestId] }));
  }

  const fmtTs = (value?: string): string => {
    if (!value) return '—';
    try { return format(parseISO(value), 'dd MMM yyyy, h:mm a'); } catch { return value; }
  };

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
    if (advanceNoticeViolation) {
      toast({ title: 'Advance notice required', description: advanceNoticeViolation, variant: 'destructive' });
      return;
    }
    if (quotaAvailability?.isQuotaFull) {
      toast({ title: 'Quota exceeded', description: quotaAvailability.message ?? 'Leave quota is full for this period.', variant: 'destructive' });
      return;
    }
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
    setShowApply(false);
    setApplyForm(getDefaultApplyForm());
    setAttachmentFile(null);
    setAttachmentError(null);
    if (leaveDraftKey) window.localStorage.removeItem(leaveDraftKey);
    void queryClient.invalidateQueries({ queryKey: ['leave-management', user?.companyId] });
  }

  // ── Tab config ────────────────────────────────────────────────────────────────

  // Snapshot metrics
  const annualLeaveType   = leaveTypes.find(lt => lt.active && /annual/i.test(lt.name));
  const annualBalance     = annualLeaveType ? (leaveBalances.find(b => b.leaveTypeId === annualLeaveType.id) ?? null) : null;
  const annualAvailable   = annualBalance?.remainingDays ?? null;
  const teamOnLeaveToday  = canViewTeam
    ? requests.filter(r => r.status === 'approved' && r.startDate <= today && r.endDate >= today && r.employeeId !== selfServiceEmployeeId).length
    : 0;

  // Consolidated balance-initialization warning (once, not per-card)
  const activeLeaveTypes  = leaveTypes.filter(lt => lt.active && lt.requiresBalance);
  const uninitializedCount = activeLeaveTypes.filter(lt => !leaveBalances.some(b => b.leaveTypeId === lt.id)).length;

  const tabs: Array<{ id: LeaveTab; label: string; icon: React.ReactNode; badge?: number }> = [
    {
      id: 'my-leave',
      label: 'My Leave',
      icon: <Calendar className="h-3.5 w-3.5" />,
      badge: myActivePending.length > 0 ? myActivePending.length : undefined,
    },
    ...(canViewTeam ? [
      {
        id: 'team-leave' as LeaveTab,
        label: 'Team Leave',
        icon: <Users className="h-3.5 w-3.5" />,
      },
    ] : []),
  ];

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Leave Management"
        description="Manage your leave requests, balances, and team approvals"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Leave Management' }]}
        actions={
          <Button size="sm" onClick={() => setShowApply(true)}>
            <Plus className="mr-1 h-4 w-4" /> Apply for Leave
          </Button>
        }
      />

      {/* ── Leave Snapshot Row ───────────────────────────────────────────── */}
      {!loading && (
        <div className="flex flex-wrap gap-2.5">
          <LeaveSnapshotMetric
            icon={<TrendingUp className="h-3 w-3" />}
            label="Annual Leave Available"
            value={annualAvailable !== null ? formatDays(annualAvailable) : '—'}
            subLabel={annualLeaveType?.name ?? 'Annual leave'}
          />
          <LeaveSnapshotMetric
            icon={<Calendar className="h-3 w-3" />}
            label="Upcoming Leave"
            value={myUpcoming.length}
            subLabel={myUpcoming.length === 1 ? 'approved, upcoming' : 'approved, upcoming'}
            colorClass={myUpcoming.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}
          />
          {canViewTeam && (
            <LeaveSnapshotMetric
              icon={<Users className="h-3 w-3" />}
              label="Team On Leave Today"
              value={teamOnLeaveToday}
              subLabel={teamOnLeaveToday === 1 ? 'member absent' : 'members absent'}
              colorClass={teamOnLeaveToday > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'}
            />
          )}
        </div>
      )}

      {/* ── Tab navigation ──────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-1.5 shadow-sm">
        <nav className="flex flex-wrap gap-1" aria-label="Leave management sections">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                ].join(' ')}
              >
                {tab.icon}
                {tab.label}
                {tab.badge != null && (
                  <span className={[
                    'ml-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                    isActive
                      ? 'bg-white/20 text-primary-foreground'
                      : tab.id === 'approval-queue'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
                  ].join(' ')}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* MY LEAVE TAB */}
      {activeTab === 'my-leave' && (
        <div className="space-y-6">
          {approvalPreview && (
            <div className="flex items-start gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span>
                Your leave requests follow the{' '}
                <span className="font-medium">{approvalPreview.flowName ?? 'direct review'}</span>{' '}
                approval workflow.
                {approvalPreview.fullFlow && approvalPreview.fullFlow.length > 1 && (
                  <> Flow: {approvalPreview.fullFlow.join(' → ')}</>
                )}
              </span>
            </div>
          )}

          <section>
            <div className="flex items-center justify-between">
              <SectionHeading title={`Leave Balances — ${selectedLeaveYear}`} />
            </div>
            {!loading && uninitializedCount > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {uninitializedCount === activeLeaveTypes.length
                    ? `Leave balances for ${selectedLeaveYear} have not been initialized.`
                    : `${uninitializedCount} leave type${uninitializedCount > 1 ? 's have' : ' has'} not been initialized for ${selectedLeaveYear}.`}
                  {' '}Contact your HR administrator.
                </span>
              </div>
            )}
            {loading ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {[1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/30" />)}
              </div>
            ) : leaveTypes.filter(lt => lt.active).length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {leaveTypes.filter(lt => lt.active).map(lt => (
                  <BalanceCard key={lt.id} lt={lt} balance={leaveBalances.find(b => b.leaveTypeId === lt.id) ?? null} />
                ))}
              </div>
            ) : (
              <EmptyState title="No leave types configured" description="Your company has not set up leave types yet. Contact your HR administrator." />
            )}
          </section>

          <section>
            <SectionHeading title="Pending Requests" count={myActivePending.length} colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" />
            <div className="mt-3 space-y-2">
              {loading ? <LoadingRow /> : myActivePending.length === 0 ? (
                <EmptyState
                  title="No pending leave requests"
                  description="You have no leave requests waiting for approval."
                />
              ) : (
                myActivePending.map(req => (
                  <LeaveRequestRow key={req.id} req={req} isMyLeave canReview={false}
                    expanded={!!expandedHistory[req.id]} onToggleExpand={() => toggleHistory(req.id)}
                    fmtTs={fmtTs} />
                ))
              )}
            </div>
          </section>

          {(loading || myUpcoming.length > 0) && (
            <section>
              <SectionHeading title="Upcoming Approved Leave" count={myUpcoming.length} colorClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" />
              <div className="mt-3 space-y-2">
                {loading ? <LoadingRow /> : myUpcoming.map(req => (
                  <LeaveRequestRow key={req.id} req={req} isMyLeave canReview={false}
                    expanded={!!expandedHistory[req.id]} onToggleExpand={() => toggleHistory(req.id)}
                    fmtTs={fmtTs} />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeading title="Leave History" />
            <div className="mt-3 space-y-2">
              {loading ? <LoadingRow /> : myHistory.length === 0 ? (
                <EmptyState
                  title="No leave history yet"
                  description="Approved, rejected, cancelled, and completed leave requests will appear here."
                />
              ) : (
                myHistory.map(req => (
                  <LeaveRequestRow key={req.id} req={req} isMyLeave canReview={false}
                    expanded={!!expandedHistory[req.id]} onToggleExpand={() => toggleHistory(req.id)}
                    fmtTs={fmtTs} />
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* TEAM LEAVE TAB */}
      {activeTab === 'team-leave' && canViewTeam && (
        <div className="space-y-5">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
            {canApproveRequests && (
              <Button
                variant={teamViewMode === 'my_queue' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTeamViewMode(p => p === 'my_queue' ? 'all' : 'my_queue')}
                className={teamViewMode !== 'my_queue' ? 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400' : ''}
              >
                <Clock className="mr-1 h-3.5 w-3.5" />
                My Queue ({requests.filter(r => canReviewRequest(r)).length})
              </Button>
            )}
            {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map(s => (
              <Button key={s} variant={teamFilterStatus === s ? 'default' : 'outline'} size="sm"
                onClick={() => setTeamFilterStatus(s)} className="capitalize">
                {s === 'all' ? 'All' : s}
              </Button>
            ))}
            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Search employee…" value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                className="h-8 w-44 rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <span className="ml-1 text-xs tabular-nums text-muted-foreground">
              {filteredTeamRequests.length} result{filteredTeamRequests.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Upcoming approved team leave */}
          <section>
            <SectionHeading
              title="Upcoming Team Leave"
              count={requests.filter(r => r.status === 'approved' && r.startDate > today && r.employeeId !== selfServiceEmployeeId).length}
              colorClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            />
            <div className="mt-3 space-y-2">
              {loading ? <LoadingRow /> : (() => {
                const upcoming = requests.filter(r => r.status === 'approved' && r.startDate > today && r.employeeId !== selfServiceEmployeeId);
                return upcoming.length === 0 ? (
                  <EmptyState title="No upcoming team leave" description="No approved leave is scheduled for the team in the coming days." />
                ) : upcoming.map(req => (
                  <LeaveRequestRow key={req.id} req={req} isMyLeave={false} canReview={false}
                    expanded={!!expandedHistory[req.id]} onToggleExpand={() => toggleHistory(req.id)}
                    fmtTs={fmtTs} />
                ));
              })()}
            </div>
          </section>

          {/* All / filtered requests */}
          <section>
            <SectionHeading title="All Team Leave Records" count={filteredTeamRequests.length} />
            <div className="mt-3 space-y-2">
              {loading ? (
                <div className="flex h-40 items-center justify-center rounded-xl border bg-card">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : filteredTeamRequests.length === 0 ? (
                <EmptyState
                  title="No team leave records"
                  description={teamViewMode === 'my_queue' ? 'No requests are assigned to your review queue.' : 'No records match the current filters.'}
                />
              ) : (
                filteredTeamRequests.map(req => (
                  <LeaveRequestRow key={req.id} req={req} isMyLeave={false} canReview={canApproveRequests && canReviewRequest(req)}
                    expanded={!!expandedHistory[req.id]} onToggleExpand={() => toggleHistory(req.id)}
                    fmtTs={fmtTs} />
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* APPLY LEAVE DIALOG */}
      <Dialog open={showApply} onOpenChange={setShowApply}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply for Leave</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleApply} className="space-y-4">
            <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Branch</p>
                <p className="mt-0.5 truncate text-sm font-medium">{employeeInfo?.branch ?? 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Department</p>
                <p className="mt-0.5 truncate text-sm font-medium">{employeeInfo?.department ?? 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Position</p>
                <p className="mt-0.5 truncate text-sm font-medium">{employeeInfo?.position ?? 'Not assigned'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={applyForm.leaveTypeId ?? ''} onValueChange={v => setApplyForm(f => ({ ...f, leaveTypeId: v }))}>
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

            {selectedLeaveType?.requiresBalance && selectedBalance && (
              <div className="grid gap-2 rounded-xl border p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Entitled</p>
                  <p className="font-semibold">{formatDays(selectedBalance.entitledDays)} days</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Used</p>
                  <p className="font-semibold">{formatDays(selectedBalance.usedDays)} days</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className={`font-semibold ${balanceInsufficient ? 'text-destructive' : ''}`}>{formatDays(selectedBalance.remainingDays)} days</p>
                </div>
              </div>
            )}
            {selectedLeaveType && !selectedLeaveType.requiresBalance && (
              <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">Unpaid leave — no balance required.</p>
            )}
            {applyForm.leaveTypeId && selectedLeaveType?.requiresBalance && !selectedBalance && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">No balance record found for {selectedLeaveYear}. Contact HR.</p>
            )}

            <div className="space-y-2">
              <Label>Leave Duration</Label>
              <ToggleGroup type="single" value={applyForm.dayPart}
                onValueChange={value => {
                  if (!value) return;
                  const dayPart = value as LeaveDayPart;
                  setApplyForm(f => ({ ...f, dayPart, endDate: dayPart === 'full_day' ? f.endDate : f.startDate }));
                }}
                className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {DAY_PART_OPTIONS.map(opt => (
                  <ToggleGroupItem key={opt.value} value={opt.value}
                    className="h-auto justify-start rounded-xl border px-3 py-2 text-left data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    <span>
                      <span className="block text-sm font-medium">{opt.label}</span>
                      <span className="block text-xs opacity-80">{opt.days} day</span>
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={applyForm.startDate ?? ''}
                  onChange={e => setApplyForm(f => ({ ...f, startDate: e.target.value, endDate: f.dayPart === 'full_day' ? f.endDate : e.target.value }))}
                  required />
                {advanceNoticeDays && (
                  <p className="text-xs text-muted-foreground">{advanceNoticeDays} day{advanceNoticeDays === 1 ? '' : 's'} advance notice required</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date"
                  value={applyForm.dayPart === 'full_day' ? applyForm.endDate ?? '' : applyForm.startDate ?? ''}
                  onChange={e => setApplyForm(f => ({ ...f, endDate: e.target.value }))}
                  disabled={applyForm.dayPart !== 'full_day'} required />
              </div>
            </div>

            <div className="space-y-1.5 rounded-xl border bg-muted/20 px-3 py-2.5">
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
                  <p className="text-xs text-muted-foreground">Checking quota availability…</p>
                ) : quotaAvailability?.hasRule ? (
                  <p className={`flex items-center gap-1 text-xs ${quotaAvailability.isQuotaFull ? 'font-medium text-destructive' : quotaAvailability.isQuotaNearlyFull ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {quotaAvailability.isQuotaFull
                      ? <><XCircle className="h-3.5 w-3.5 shrink-0" />{quotaAvailability.message ?? 'Quota full for this period.'}</>
                      : <><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{quotaAvailability.message ?? `${Math.floor(quotaAvailability.available)} of ${quotaAvailability.max} slot(s) remaining`}</>
                    }
                  </p>
                ) : null
              )}
            </div>

            <div className="space-y-2">
              <Label>Reason <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea value={applyForm.reason ?? ''} onChange={e => setApplyForm(f => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Reason for leave…" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="leave-attachment">
                Supporting Document <span className="text-xs font-normal text-muted-foreground">(PDF/JPG/PNG, max 3 MB)</span>
              </Label>
              <input id="leave-attachment" ref={fileInputRef} type="file" aria-label="Upload supporting document"
                accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={handleAttachmentChange} />
              {!attachmentFile ? (
                <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-4 w-4" /> Attach document
                </Button>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{attachmentFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(attachmentFile.size)}</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={removeAttachment}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {attachmentError && <p className="text-xs text-destructive">{attachmentError}</p>}
            </div>

            {approvalPreview && (
              <div className="rounded-xl border bg-blue-50/50 px-3 py-2 text-xs text-muted-foreground dark:bg-blue-950/20">
                <p className="font-medium">Approval: {approvalPreview.flowName ?? 'Direct review'}</p>
                {approvalPreview.fullFlow && approvalPreview.fullFlow.length > 1 && (
                  <p className="mt-0.5">{approvalPreview.fullFlow.join(' → ')}</p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowApply(false)}>Cancel</Button>
              <Button type="submit"
                disabled={calculatedDays <= 0 || balanceInsufficient || !!advanceNoticeViolation || !!attachmentError || quotaAvailability?.isQuotaFull === true}>
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
