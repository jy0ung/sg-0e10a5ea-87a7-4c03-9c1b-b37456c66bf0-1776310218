import { format, parseISO } from 'date-fns';
import type { LeaveRequest, LeaveDayPart } from '@/types';
import type { LeaveHoliday } from '@/services/hrmsService';

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isWeekend(date: string): boolean {
  const day = parseDate(date).getDay();
  return day === 0 || day === 6;
}

export function fmtTimestamp(value?: string): string {
  if (!value) return '—';
  try { return format(parseISO(value), 'dd MMM yyyy, h:mm a'); } catch { return value; }
}

export function fmtDateRange(startDate: string, endDate: string): string {
  try {
    const s = format(parseISO(startDate), 'dd MMM yyyy');
    const e = format(parseISO(endDate), 'dd MMM yyyy');
    return s === e ? s : `${s} – ${e}`;
  } catch { return `${startDate} – ${endDate}`; }
}

export function getHolidayDates(
  holidays: Array<{ date: string; isRecurring: boolean }>,
  startDate: string,
  endDate: string,
): Set<string> {
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

export function calculateLeaveDays(
  startDate: string | undefined,
  endDate: string | undefined,
  dayPart: LeaveDayPart,
  holidays: LeaveHoliday[] = [],
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

export function formatDays(days: number): string {
  return days.toLocaleString(undefined, {
    minimumFractionDigits: days % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Status config ────────────────────────────────────────────────────────────

export type StatusConfig = {
  label: string;
  stage: string | null;
  className: string;
  stageClassName: string;
};

export function getStatusConfig(req: LeaveRequest): StatusConfig {
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
    default:
      return {
        label: 'Pending Approval',
        stage: req.currentApprovalStepName ?? 'Awaiting Review',
        className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
        stageClassName: 'text-amber-600/80 dark:text-amber-500/80',
      };
  }
}
