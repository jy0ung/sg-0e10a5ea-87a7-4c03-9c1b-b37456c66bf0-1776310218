/**
 * Unified HRMS status registry.
 *
 * Single source of truth for human labels and tones across every HRMS domain
 * (leave, attendance, payroll, appraisals, employees). Retires the colour maps
 * that were previously hand-written inside individual pages and badges.
 *
 * Usage:
 *   const meta = statusMeta(status, 'leave');
 *   <span className={toneClass(meta.tone)}>{meta.label}</span>
 */
import type { Tone } from './statusTones';

export type StatusDomain =
  | 'leave'
  | 'attendance'
  | 'payroll'
  | 'appraisalCycle'
  | 'appraisalItem'
  | 'employee'
  | 'generic';

export interface StatusMeta {
  label: string;
  tone: Tone;
}

const LEAVE_STATUS: Record<string, StatusMeta> = {
  pending: { label: 'Pending Approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'emerald' },
  rejected: { label: 'Rejected', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

const ATTENDANCE_STATUS: Record<string, StatusMeta> = {
  present: { label: 'Present', tone: 'emerald' },
  absent: { label: 'Absent', tone: 'red' },
  half_day: { label: 'Half Day', tone: 'amber' },
  on_leave: { label: 'On Leave', tone: 'blue' },
  public_holiday: { label: 'Public Holiday', tone: 'violet' },
};

const PAYROLL_STATUS: Record<string, StatusMeta> = {
  draft: { label: 'Draft', tone: 'slate' },
  finalised: { label: 'Finalised', tone: 'blue' },
  finalized: { label: 'Finalised', tone: 'blue' },
  paid: { label: 'Paid', tone: 'emerald' },
  rejected: { label: 'Rejected', tone: 'red' },
};

const APPRAISAL_CYCLE_STATUS: Record<string, StatusMeta> = {
  open: { label: 'Open', tone: 'blue' },
  in_progress: { label: 'In Progress', tone: 'amber' },
  completed: { label: 'Completed', tone: 'emerald' },
  archived: { label: 'Archived', tone: 'slate' },
  rejected: { label: 'Rejected', tone: 'red' },
};

const APPRAISAL_ITEM_STATUS: Record<string, StatusMeta> = {
  pending: { label: 'Pending', tone: 'amber' },
  self_reviewed: { label: 'Self Reviewed', tone: 'blue' },
  reviewed: { label: 'Manager Reviewed', tone: 'violet' },
  acknowledged: { label: 'Acknowledged', tone: 'emerald' },
};

const EMPLOYEE_STATUS: Record<string, StatusMeta> = {
  active: { label: 'Active', tone: 'emerald' },
  inactive: { label: 'Inactive', tone: 'slate' },
  resigned: { label: 'Resigned', tone: 'slate' },
  portal_only: { label: 'Portal Only', tone: 'violet' },
  pending: { label: 'Pending', tone: 'amber' },
};

/** Legacy / cross-module statuses still referenced by carried-over components. */
const GENERIC_STATUS: Record<string, StatusMeta> = {
  published: { label: 'Published', tone: 'emerald' },
  published_with_review: { label: 'Published (review)', tone: 'amber' },
  validated: { label: 'Validated', tone: 'blue' },
  validating: { label: 'Validating', tone: 'blue' },
  review_pending: { label: 'Review Pending', tone: 'amber' },
  review_in_progress: { label: 'Review In Progress', tone: 'violet' },
  review_complete: { label: 'Review Complete', tone: 'emerald' },
  uploaded: { label: 'Uploaded', tone: 'slate' },
  failed: { label: 'Failed', tone: 'red' },
  error: { label: 'Error', tone: 'red' },
  warning: { label: 'Warning', tone: 'amber' },
  coming_soon: { label: 'Coming Soon', tone: 'violet' },
  planned: { label: 'Planned', tone: 'slate' },
  missing: { label: 'Missing', tone: 'amber' },
  negative: { label: 'Negative', tone: 'red' },
  duplicate: { label: 'Duplicate', tone: 'slate' },
  invalid: { label: 'Invalid', tone: 'red' },
};

const DOMAIN_MAPS: Record<StatusDomain, Record<string, StatusMeta>> = {
  leave: LEAVE_STATUS,
  attendance: ATTENDANCE_STATUS,
  payroll: PAYROLL_STATUS,
  appraisalCycle: APPRAISAL_CYCLE_STATUS,
  appraisalItem: APPRAISAL_ITEM_STATUS,
  employee: EMPLOYEE_STATUS,
  generic: GENERIC_STATUS,
};

/** Merged lookup for callers that do not know the domain (kept backward-safe). */
const MERGED_STATUS: Record<string, StatusMeta> = {
  ...GENERIC_STATUS,
  ...EMPLOYEE_STATUS,
  ...APPRAISAL_CYCLE_STATUS,
  ...APPRAISAL_ITEM_STATUS,
  ...PAYROLL_STATUS,
  ...ATTENDANCE_STATUS,
  ...LEAVE_STATUS,
};

function humanize(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Resolve a status string to its label + tone. Pass a domain to disambiguate
 * statuses that exist in several domains (e.g. `pending`, `rejected`).
 */
export function statusMeta(status: string, domain?: StatusDomain): StatusMeta {
  const key = status?.toLowerCase?.() ?? '';
  const source = domain ? DOMAIN_MAPS[domain] : MERGED_STATUS;
  return source[key] ?? MERGED_STATUS[key] ?? { label: humanize(status ?? ''), tone: 'muted' };
}
