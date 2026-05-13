import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  isAfter,
  isBefore,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
} from 'date-fns';

export type DashboardPeriod =
  | 'all_time'
  | 'today'
  | 'last_7_days'
  | 'last_30_days'
  | 'month_to_date'
  | 'quarter_to_date'
  | 'year_to_date';

export interface DashboardAdvancedFilterState {
  branch: string;
  period: DashboardPeriod;
  model: string;
}

const DASHBOARD_FILTER_STORAGE_PREFIX = 'flc_dashboard_filter:';

export const DASHBOARD_PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'all_time', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'month_to_date', label: 'Month to date' },
  { value: 'quarter_to_date', label: 'Quarter to date' },
  { value: 'year_to_date', label: 'Year to date' },
];

export function getDashboardPeriodLabel(period: DashboardPeriod): string {
  return DASHBOARD_PERIOD_OPTIONS.find(option => option.value === period)?.label ?? 'All time';
}

export function getDashboardScopeSummary(
  filter: DashboardAdvancedFilterState,
  options: {
    allBranchLabel?: string;
    allModelLabel?: string;
  } = {},
): string {
  const allBranchLabel = options.allBranchLabel ?? 'All branches';
  const allModelLabel = options.allModelLabel ?? 'All models';
  const parts = [filter.branch === 'all' ? allBranchLabel : filter.branch, getDashboardPeriodLabel(filter.period)];

  if (filter.model !== 'all') {
    parts.push(filter.model);
  } else {
    parts.push(allModelLabel);
  }

  return parts.join(' • ');
}

function isDashboardPeriod(value: unknown): value is DashboardPeriod {
  return DASHBOARD_PERIOD_OPTIONS.some(option => option.value === value);
}

export function loadDashboardFilterState(
  storageKey: string,
  defaults: DashboardAdvancedFilterState = { branch: 'all', period: 'all_time', model: 'all' },
): DashboardAdvancedFilterState {
  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(`${DASHBOARD_FILTER_STORAGE_PREFIX}${storageKey}`);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Partial<DashboardAdvancedFilterState>;
    return {
      branch: typeof parsed.branch === 'string' ? parsed.branch : defaults.branch,
      period: isDashboardPeriod(parsed.period) ? parsed.period : defaults.period,
      model: typeof parsed.model === 'string' ? parsed.model : defaults.model,
    };
  } catch {
    return defaults;
  }
}

export function saveDashboardFilterState(storageKey: string, filter: DashboardAdvancedFilterState): void {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(`${DASHBOARD_FILTER_STORAGE_PREFIX}${storageKey}`, JSON.stringify(filter));
}

export function getDashboardPeriodRange(period: DashboardPeriod, now = new Date()): { from: Date | null; to: Date | null } {
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  switch (period) {
    case 'today':
      return { from: dayStart, to: dayEnd };
    case 'last_7_days':
      return { from: startOfDay(subDays(now, 6)), to: dayEnd };
    case 'last_30_days':
      return { from: startOfDay(subDays(now, 29)), to: dayEnd };
    case 'month_to_date':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'quarter_to_date':
      return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case 'year_to_date':
      return { from: startOfYear(now), to: endOfYear(now) };
    case 'all_time':
    default:
      return { from: null, to: null };
  }
}

export function parseDashboardDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const parsed = parseISO(value);
  if (!isValid(parsed)) return null;
  return parsed;
}

export function matchesDashboardPeriod(value: string | null | undefined, period: DashboardPeriod): boolean {
  if (period === 'all_time') return true;

  const parsed = parseDashboardDate(value);
  if (!parsed) return false;

  const { from, to } = getDashboardPeriodRange(period);
  if (!from || !to) return true;

  return !isBefore(parsed, from) && !isAfter(parsed, to);
}