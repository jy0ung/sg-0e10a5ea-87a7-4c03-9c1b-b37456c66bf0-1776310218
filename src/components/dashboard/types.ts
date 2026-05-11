import type { LucideIcon } from 'lucide-react';

/** Shared metric card shape used by DashboardSnapshotSection and DashboardScorecards. */
export interface DashboardCardMetric {
  key: string;
  label: string;
  value: string | number;
  helperText?: string;
  icon: LucideIcon;
  iconClassName: string;
  valueClassName: string;
}
