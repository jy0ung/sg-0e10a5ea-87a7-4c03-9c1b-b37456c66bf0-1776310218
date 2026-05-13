import { format } from 'date-fns';
import type { Appraisal, ApprovalDecision, LeaveRequest, PayrollRun } from '@/types';

export const HRMS_APPROVAL_INBOX_CHANGED_EVENT = 'hrms-approval-inbox-changed';

export type ApprovalInboxApproverIdentity = {
  id?: string;
  role?: string;
} | null | undefined;

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
  if (item.currentApproverRole) return item.currentApproverRole === approver.role;
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
    entityId: request.id,
    title: `${request.employeeName ?? 'Employee'} · ${request.leaveTypeName ?? 'Leave request'}`,
    subtitle: `${request.startDate} -> ${request.endDate} · ${request.days} day${request.days === 1 ? '' : 's'}`,
    summary: request.reason,
    updatedAt: request.updatedAt,
    currentApprovalStepName: request.currentApprovalStepName,
    currentApproverRole: request.currentApproverRole,
    currentApproverUserId: request.currentApproverUserId,
    approvalInstanceStatus: request.approvalInstanceStatus,
    approvalHistory: request.approvalHistory,
  }));

  const payrollItems: ApprovalInboxItem[] = payrollRuns.map(run => ({
    entityType: 'payroll_run',
    entity: run,
    entityId: run.id,
    title: `Payroll Finalisation · ${formatPayrollPeriod(run.periodMonth, run.periodYear)}`,
    subtitle: `${run.totalHeadcount} employees · RM ${formatMoney(run.totalGross)} gross · RM ${formatMoney(run.totalNet)} net`,
    summary: run.notes,
    updatedAt: run.updatedAt,
    currentApprovalStepName: run.currentApprovalStepName,
    currentApproverRole: run.currentApproverRole,
    currentApproverUserId: run.currentApproverUserId,
    approvalInstanceStatus: run.approvalInstanceStatus,
    approvalHistory: run.approvalHistory,
  }));

  const appraisalItems: ApprovalInboxItem[] = appraisals.map(appraisal => ({
    entityType: 'appraisal',
    entity: appraisal,
    entityId: appraisal.id,
    title: `Appraisal Activation · ${appraisal.title}`,
    subtitle: `${appraisal.cycle.replace(/_/g, ' ')} · ${appraisal.periodStart} -> ${appraisal.periodEnd}`,
    updatedAt: appraisal.updatedAt,
    currentApprovalStepName: appraisal.currentApprovalStepName,
    currentApproverRole: appraisal.currentApproverRole,
    currentApproverUserId: appraisal.currentApproverUserId,
    approvalInstanceStatus: appraisal.approvalInstanceStatus,
    approvalHistory: appraisal.approvalHistory,
  }));

  return [...leaveItems, ...payrollItems, ...appraisalItems]
    .filter(item => isApprovalAssignedToApprover(item, approver))
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

export function notifyApprovalInboxChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(HRMS_APPROVAL_INBOX_CHANGED_EVENT));
}

function formatMoney(value: number) {
  return value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPayrollPeriod(periodMonth: number, periodYear: number) {
  try {
    return format(new Date(periodYear, periodMonth - 1, 1), 'MMM yyyy');
  } catch {
    return `${periodMonth}/${periodYear}`;
  }
}