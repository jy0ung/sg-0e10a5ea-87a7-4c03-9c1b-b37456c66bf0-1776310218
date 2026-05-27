import { format } from 'date-fns';
import type { Appraisal, ApprovalDecision, LeaveRequest, PayrollRun } from '@/types';
import { matchesHrmsApproverRole, type HrmsApproverIdentity } from '@/lib/hrms/access';

export const HRMS_APPROVAL_INBOX_CHANGED_EVENT = 'hrms-approval-inbox-changed';

export type ApprovalInboxApproverIdentity = HrmsApproverIdentity;

export type ApprovalInboxEntityType = 'leave_request' | 'payroll_run' | 'appraisal';
export type ApprovalInboxFilter = 'all' | ApprovalInboxEntityType;

type ApprovalInboxSourcePathOptions = {
  dedicatedHrmsApp?: boolean;
};

const sourcePaths: Record<ApprovalInboxEntityType, string> = {
  leave_request: 'leave',
  payroll_run: 'payroll',
  appraisal: 'appraisals',
};

type ApprovalInboxBaseItem = {
  entityType: ApprovalInboxEntityType;
  entityId: string;
  title: string;
  subtitle: string;
  summary?: string;
  updatedAt: string;
  currentApprovalStepName?: string;
  currentApproverRole?: string;
  currentApproverUserId?: string;
  approvalInstanceStatus?: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approvalHistory?: ApprovalDecision[];
};

export type ApprovalInboxItem = ApprovalInboxBaseItem & (
  | { entityType: 'leave_request'; entity: LeaveRequest }
  | { entityType: 'payroll_run'; entity: PayrollRun }
  | { entityType: 'appraisal'; entity: Appraisal }
);

export function isApprovalAssignedToApprover(
  item: Pick<ApprovalInboxBaseItem, 'approvalInstanceStatus' | 'currentApproverUserId' | 'currentApproverRole'>,
  approver: ApprovalInboxApproverIdentity,
): boolean {
  if (!approver || item.approvalInstanceStatus !== 'pending') return false;
  if (item.currentApproverUserId) return item.currentApproverUserId === approver.id;
  if (item.currentApproverRole) return matchesHrmsApproverRole(item.currentApproverRole, approver);
  return false;
}

export function buildApprovalInboxItems(
  leaveRequests: LeaveRequest[],
  payrollRuns: PayrollRun[],
  appraisals: Appraisal[],
  approver: ApprovalInboxApproverIdentity,
): ApprovalInboxItem[] {
  const leaveItems: ApprovalInboxItem[] = leaveRequests.map(request => ({
    entityType: 'leave_request',
    entity: request,
    entityId: safeText(request.id, 'unknown-leave-request'),
    title: `${optionalText(request.employeeName) ?? 'Employee'} · ${optionalText(request.leaveTypeName) ?? 'Leave request'}`,
    subtitle: `${safeText(request.startDate, 'Unknown start')} -> ${safeText(request.endDate, 'Unknown end')} · ${formatDayCount(request.days)}`,
    summary: optionalText(request.reason),
    updatedAt: safeText(request.updatedAt, request.startDate ?? new Date(0).toISOString()),
    currentApprovalStepName: optionalText(request.currentApprovalStepName),
    currentApproverRole: optionalText(request.currentApproverRole),
    currentApproverUserId: optionalText(request.currentApproverUserId),
    approvalInstanceStatus: request.approvalInstanceStatus,
    approvalHistory: Array.isArray(request.approvalHistory) ? request.approvalHistory : undefined,
  }));

  const payrollItems: ApprovalInboxItem[] = payrollRuns.map(run => ({
    entityType: 'payroll_run',
    entity: run,
    entityId: safeText(run.id, 'unknown-payroll-run'),
    title: `Payroll Finalisation · ${formatPayrollPeriod(run.periodMonth, run.periodYear)}`,
    subtitle: `${formatCount(run.totalHeadcount)} employees · RM ${formatMoney(run.totalGross)} gross · RM ${formatMoney(run.totalNet)} net`,
    summary: optionalText(run.notes),
    updatedAt: safeText(run.updatedAt, new Date(0).toISOString()),
    currentApprovalStepName: optionalText(run.currentApprovalStepName),
    currentApproverRole: optionalText(run.currentApproverRole),
    currentApproverUserId: optionalText(run.currentApproverUserId),
    approvalInstanceStatus: run.approvalInstanceStatus,
    approvalHistory: Array.isArray(run.approvalHistory) ? run.approvalHistory : undefined,
  }));

  const appraisalItems: ApprovalInboxItem[] = appraisals.map(appraisal => ({
    entityType: 'appraisal',
    entity: appraisal,
    entityId: safeText(appraisal.id, 'unknown-appraisal'),
    title: `Appraisal Activation · ${safeText(appraisal.title, 'Untitled appraisal')}`,
    subtitle: `${safeText(appraisal.cycle, 'annual').replace(/_/g, ' ')} · ${safeText(appraisal.periodStart, 'Unknown start')} -> ${safeText(appraisal.periodEnd, 'Unknown end')}`,
    updatedAt: safeText(appraisal.updatedAt, appraisal.periodStart ?? new Date(0).toISOString()),
    currentApprovalStepName: optionalText(appraisal.currentApprovalStepName),
    currentApproverRole: optionalText(appraisal.currentApproverRole),
    currentApproverUserId: optionalText(appraisal.currentApproverUserId),
    approvalInstanceStatus: appraisal.approvalInstanceStatus,
    approvalHistory: Array.isArray(appraisal.approvalHistory) ? appraisal.approvalHistory : undefined,
  }));

  return [...leaveItems, ...payrollItems, ...appraisalItems]
    .filter(item => {
      if (isApprovalAssignedToApprover(item, approver)) return true;
      return item.entityType === 'leave_request'
        && item.entity.status === 'pending'
        && !item.currentApproverUserId
        && !item.currentApproverRole
        && Boolean(approver?.canApproveRequests);
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function filterApprovalInboxItems(
  items: ApprovalInboxItem[],
  filter: ApprovalInboxFilter,
): ApprovalInboxItem[] {
  return filter === 'all'
    ? items
    : items.filter(item => item.entityType === filter);
}

export function getApprovalInboxSourcePath(
  entityType: ApprovalInboxEntityType,
  options: ApprovalInboxSourcePathOptions = {},
): string {
  const dedicatedHrmsApp = options.dedicatedHrmsApp ?? import.meta.env.VITE_HRMS_WEB_APP === 'true';
  const prefix = dedicatedHrmsApp ? '' : '/hrms';
  return `${prefix}/${sourcePaths[entityType]}`;
}

export function getApprovalInboxReviewPath(
  entityType?: ApprovalInboxFilter,
  targetId?: string,
  options: ApprovalInboxSourcePathOptions = {},
): string {
  const dedicatedHrmsApp = options.dedicatedHrmsApp ?? import.meta.env.VITE_HRMS_WEB_APP === 'true';
  const prefix = dedicatedHrmsApp ? '' : '/hrms';
  const params = new URLSearchParams();
  if (entityType && entityType !== 'all') params.set('type', entityType);
  if (targetId) params.set('target', targetId);
  const query = params.toString();
  return `${prefix}/approvals${query ? `?${query}` : ''}`;
}

export function notifyApprovalInboxChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(HRMS_APPROVAL_INBOX_CHANGED_EVENT));
}

function formatMoney(value: number) {
  const numericValue = finiteNumber(value);
  return (Number.isFinite(numericValue) ? numericValue : 0)
    .toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPayrollPeriod(periodMonth: number, periodYear: number) {
  const month = finiteNumber(periodMonth);
  const year = finiteNumber(periodYear);
  if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) {
    return 'Unknown period';
  }
  try {
    return format(new Date(year, month - 1, 1), 'MMM yyyy');
  } catch {
    return `${month}/${year}`;
  }
}

function safeText(value: unknown, fallback: string): string {
  return optionalText(value) ?? fallback;
}

function optionalText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value.trim() ? value : undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function formatCount(value: number): string {
  const numericValue = finiteNumber(value);
  return Number.isFinite(numericValue) ? String(numericValue) : '0';
}

function formatDayCount(value: number): string {
  const numericValue = finiteNumber(value);
  const days = Number.isFinite(numericValue) ? numericValue : 0;
  return `${days} day${days === 1 ? '' : 's'}`;
}

function finiteNumber(value: unknown): number {
  if (value == null || value === '') return Number.NaN;
  return Number(value);
}
