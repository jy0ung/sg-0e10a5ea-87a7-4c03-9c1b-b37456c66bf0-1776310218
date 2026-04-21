import type { KpiSummary, SalesOrder, VehicleCanonical, Customer, QualityIssue } from '@/types';

export type DashboardSystemWidgetId =
  | 'snapshot'
  | 'scorecards'
  | 'kpi-analytics'
  | 'branch-comparison';

export type CustomInsightMetricId =
  | 'slowest_delivery_branch'
  | 'fastest_delivery_branch'
  | 'highest_booking_branch'
  | 'highest_booking_model'
  | 'largest_booking_value_branch'
  | 'average_bg_to_delivery'
  | 'average_delivery_to_disbursement'
  | 'worst_kpi_compliance';

export interface PersonalDashboardSectionWidget {
  id: DashboardSystemWidgetId;
  type: 'section';
  enabled: boolean;
}

export interface PersonalDashboardCustomMetric {
  id: string;
  type: 'custom-metric';
  enabled: boolean;
  title: string;
  metricId: CustomInsightMetricId;
}

export type PersonalDashboardWidget = PersonalDashboardSectionWidget | PersonalDashboardCustomMetric;

export interface PersonalDashboardPreferences {
  widgets: PersonalDashboardWidget[];
}

export interface CustomInsightDefinition {
  id: CustomInsightMetricId;
  label: string;
  description: string;
  emptyLabel: string;
  accentClassName: string;
}

export interface DashboardMetricResult {
  value: string;
  detail: string;
  helperText: string;
}

export interface PersonalDashboardMetricContext {
  vehicles: VehicleCanonical[];
  salesOrders: SalesOrder[];
  kpiSummaries: KpiSummary[];
  customers: Customer[];
  qualityIssues: QualityIssue[];
}

const PERSONAL_DASHBOARD_STORAGE_PREFIX = 'flc-bi:personal-dashboard';

export const DASHBOARD_SECTION_LABELS: Record<DashboardSystemWidgetId, { title: string; description: string }> = {
  snapshot: {
    title: 'Operational Snapshot',
    description: 'Bookings, deliveries, customers, and scoped vehicle count.',
  },
  scorecards: {
    title: 'Performance Scorecards',
    description: 'High-level operational KPIs and SLA health.',
  },
  'kpi-analytics': {
    title: 'KPI Analytics',
    description: 'Detailed KPI distributions, compliance, and trends.',
  },
  'branch-comparison': {
    title: 'Branch Comparison',
    description: 'Compare average BG to Delivery by branch.',
  },
};

export const CUSTOM_INSIGHT_DEFINITIONS: CustomInsightDefinition[] = [
  {
    id: 'slowest_delivery_branch',
    label: 'Slowest Delivery Branch',
    description: 'Identify the branch with the highest average BG to Delivery time.',
    emptyLabel: 'No branch delivery data',
    accentClassName: 'bg-destructive/10 text-destructive',
  },
  {
    id: 'fastest_delivery_branch',
    label: 'Fastest Delivery Branch',
    description: 'Highlight the branch with the fastest average BG to Delivery time.',
    emptyLabel: 'No branch delivery data',
    accentClassName: 'bg-success/10 text-success',
  },
  {
    id: 'highest_booking_branch',
    label: 'Highest Booking Branch',
    description: 'Show which branch is booking the most units in the current scope.',
    emptyLabel: 'No booking data',
    accentClassName: 'bg-primary/10 text-primary',
  },
  {
    id: 'highest_booking_model',
    label: 'Highest Booking Model',
    description: 'Track the best-performing model by booking volume.',
    emptyLabel: 'No booking data',
    accentClassName: 'bg-info/10 text-info',
  },
  {
    id: 'largest_booking_value_branch',
    label: 'Largest Booking Value Branch',
    description: 'Find the branch driving the most booking value.',
    emptyLabel: 'No booking value data',
    accentClassName: 'bg-warning/10 text-warning',
  },
  {
    id: 'average_bg_to_delivery',
    label: 'Average BG to Delivery',
    description: 'Average cycle time from BG to Delivery in the scoped dataset.',
    emptyLabel: 'No BG to Delivery data',
    accentClassName: 'bg-primary/10 text-primary',
  },
  {
    id: 'average_delivery_to_disbursement',
    label: 'Average Delivery to Disbursement',
    description: 'Average cycle time from Delivery to Disbursement in the scoped dataset.',
    emptyLabel: 'No Delivery to Disbursement data',
    accentClassName: 'bg-info/10 text-info',
  },
  {
    id: 'worst_kpi_compliance',
    label: 'Weakest KPI Compliance',
    description: 'Surface the KPI with the lowest current compliance rate.',
    emptyLabel: 'No KPI compliance data',
    accentClassName: 'bg-destructive/10 text-destructive',
  },
];

const DEFAULT_CUSTOM_WIDGETS: PersonalDashboardCustomMetric[] = [
  {
    id: 'custom-slowest-delivery-branch',
    type: 'custom-metric',
    enabled: true,
    title: 'Slowest Delivery Branch',
    metricId: 'slowest_delivery_branch',
  },
  {
    id: 'custom-highest-booking-branch',
    type: 'custom-metric',
    enabled: true,
    title: 'Highest Booking Branch',
    metricId: 'highest_booking_branch',
  },
];

export const DEFAULT_PERSONAL_DASHBOARD: PersonalDashboardPreferences = {
  widgets: [
    { id: 'snapshot', type: 'section', enabled: true },
    { id: 'scorecards', type: 'section', enabled: true },
    ...DEFAULT_CUSTOM_WIDGETS,
    { id: 'kpi-analytics', type: 'section', enabled: true },
    { id: 'branch-comparison', type: 'section', enabled: true },
  ],
};

function getPersonalDashboardStorageKey(scope: string) {
  return `${PERSONAL_DASHBOARD_STORAGE_PREFIX}:${scope}`;
}

function roundAverage(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function formatCurrencyCompact(value: number): string {
  if (value >= 1_000_000) {
    return `RM ${(value / 1_000_000).toFixed(1)}m`;
  }
  if (value >= 1_000) {
    return `RM ${(value / 1_000).toFixed(0)}k`;
  }
  return `RM ${value.toFixed(0)}`;
}

function getBranchAverages(vehicles: VehicleCanonical[]): Array<{ label: string; value: number; count: number }> {
  const groups = new Map<string, number[]>();
  vehicles.forEach(vehicle => {
    if (vehicle.bg_to_delivery == null || vehicle.bg_to_delivery < 0) return;
    const values = groups.get(vehicle.branch_code) ?? [];
    values.push(vehicle.bg_to_delivery);
    groups.set(vehicle.branch_code, values);
  });

  return Array.from(groups.entries()).map(([label, values]) => ({
    label,
    value: roundAverage(values),
    count: values.length,
  }));
}

function getSalesOrderCounts<T extends string>(salesOrders: SalesOrder[], selector: (order: SalesOrder) => T | null | undefined) {
  const counts = new Map<T, { count: number; totalValue: number }>();
  salesOrders.forEach(order => {
    const label = selector(order);
    if (!label) return;
    const existing = counts.get(label) ?? { count: 0, totalValue: 0 };
    existing.count += 1;
    existing.totalValue += order.totalPrice ?? 0;
    counts.set(label, existing);
  });
  return counts;
}

export function sanitizeDashboardPreferences(input: unknown): PersonalDashboardPreferences {
  if (!input || typeof input !== 'object') return DEFAULT_PERSONAL_DASHBOARD;

  const rawWidgets = Array.isArray((input as { widgets?: unknown[] }).widgets)
    ? (input as { widgets: unknown[] }).widgets
    : DEFAULT_PERSONAL_DASHBOARD.widgets;

  const widgets = rawWidgets
    .map((rawWidget): PersonalDashboardWidget | null => {
      if (!rawWidget || typeof rawWidget !== 'object') return null;
      const widget = rawWidget as Partial<PersonalDashboardWidget> & Record<string, unknown>;
      if (widget.type === 'section' && typeof widget.id === 'string') {
        if (!(widget.id in DASHBOARD_SECTION_LABELS)) return null;
        return {
          id: widget.id as DashboardSystemWidgetId,
          type: 'section',
          enabled: widget.enabled !== false,
        };
      }
      if (
        widget.type === 'custom-metric'
        && typeof widget.id === 'string'
        && typeof widget.title === 'string'
        && typeof widget.metricId === 'string'
        && CUSTOM_INSIGHT_DEFINITIONS.some(definition => definition.id === widget.metricId)
      ) {
        return {
          id: widget.id,
          type: 'custom-metric',
          enabled: widget.enabled !== false,
          title: widget.title,
          metricId: widget.metricId as CustomInsightMetricId,
        };
      }
      return null;
    })
    .filter((widget): widget is PersonalDashboardWidget => Boolean(widget));

  if (widgets.length === 0) return DEFAULT_PERSONAL_DASHBOARD;
  return { widgets };
}

export function isSameDashboardPreferences(
  left: PersonalDashboardPreferences,
  right: PersonalDashboardPreferences,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function loadPersonalDashboardState(scope: string): PersonalDashboardPreferences {
  if (typeof window === 'undefined') return sanitizeDashboardPreferences(DEFAULT_PERSONAL_DASHBOARD);

  try {
    const rawValue = window.localStorage.getItem(getPersonalDashboardStorageKey(scope));
    if (!rawValue) return sanitizeDashboardPreferences(DEFAULT_PERSONAL_DASHBOARD);
    return sanitizeDashboardPreferences(JSON.parse(rawValue));
  } catch {
    return sanitizeDashboardPreferences(DEFAULT_PERSONAL_DASHBOARD);
  }
}

export function savePersonalDashboardState(scope: string, preferences: PersonalDashboardPreferences) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getPersonalDashboardStorageKey(scope), JSON.stringify(preferences));
  } catch {
    // Ignore storage failures and rely on the remote preference save path.
  }
}

export function moveWidget(widgets: PersonalDashboardWidget[], widgetId: string, direction: 'up' | 'down') {
  const currentIndex = widgets.findIndex(widget => widget.id === widgetId);
  if (currentIndex < 0) return widgets;

  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= widgets.length) return widgets;

  const nextWidgets = [...widgets];
  const [widget] = nextWidgets.splice(currentIndex, 1);
  nextWidgets.splice(nextIndex, 0, widget);
  return nextWidgets;
}

export function createCustomMetricWidget(metricId: CustomInsightMetricId, title?: string): PersonalDashboardCustomMetric {
  const definition = CUSTOM_INSIGHT_DEFINITIONS.find(item => item.id === metricId);
  return {
    id: `custom-${metricId}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'custom-metric',
    enabled: true,
    title: title?.trim() || definition?.label || 'Custom Insight',
    metricId,
  };
}

export function evaluateCustomInsight(metricId: CustomInsightMetricId, context: PersonalDashboardMetricContext): DashboardMetricResult {
  switch (metricId) {
    case 'slowest_delivery_branch': {
      const branches = getBranchAverages(context.vehicles).sort((left, right) => right.value - left.value);
      const top = branches[0];
      if (!top) return { value: '—', detail: 'No branch data', helperText: CUSTOM_INSIGHT_DEFINITIONS.find(def => def.id === metricId)?.emptyLabel ?? '' };
      return {
        value: `${top.value}d`,
        detail: top.label,
        helperText: `${top.count} vehicles averaged`,
      };
    }
    case 'fastest_delivery_branch': {
      const branches = getBranchAverages(context.vehicles).sort((left, right) => left.value - right.value);
      const top = branches[0];
      if (!top) return { value: '—', detail: 'No branch data', helperText: CUSTOM_INSIGHT_DEFINITIONS.find(def => def.id === metricId)?.emptyLabel ?? '' };
      return {
        value: `${top.value}d`,
        detail: top.label,
        helperText: `${top.count} vehicles averaged`,
      };
    }
    case 'highest_booking_branch': {
      const counts = Array.from(getSalesOrderCounts(context.salesOrders, order => order.branchCode).entries())
        .sort((left, right) => right[1].count - left[1].count);
      const top = counts[0];
      if (!top) return { value: '—', detail: 'No booking data', helperText: CUSTOM_INSIGHT_DEFINITIONS.find(def => def.id === metricId)?.emptyLabel ?? '' };
      return {
        value: `${top[1].count}`,
        detail: top[0],
        helperText: `${formatCurrencyCompact(top[1].totalValue)} booked`,
      };
    }
    case 'highest_booking_model': {
      const counts = Array.from(getSalesOrderCounts(context.salesOrders, order => order.model).entries())
        .sort((left, right) => right[1].count - left[1].count);
      const top = counts[0];
      if (!top) return { value: '—', detail: 'No model data', helperText: CUSTOM_INSIGHT_DEFINITIONS.find(def => def.id === metricId)?.emptyLabel ?? '' };
      return {
        value: `${top[1].count}`,
        detail: top[0],
        helperText: `${formatCurrencyCompact(top[1].totalValue)} booked`,
      };
    }
    case 'largest_booking_value_branch': {
      const counts = Array.from(getSalesOrderCounts(context.salesOrders, order => order.branchCode).entries())
        .sort((left, right) => right[1].totalValue - left[1].totalValue);
      const top = counts[0];
      if (!top) return { value: '—', detail: 'No branch revenue data', helperText: CUSTOM_INSIGHT_DEFINITIONS.find(def => def.id === metricId)?.emptyLabel ?? '' };
      return {
        value: formatCurrencyCompact(top[1].totalValue),
        detail: top[0],
        helperText: `${top[1].count} orders`,
      };
    }
    case 'average_bg_to_delivery': {
      const values = context.vehicles
        .map(vehicle => vehicle.bg_to_delivery)
        .filter((value): value is number => value != null && value >= 0);
      if (values.length === 0) return { value: '—', detail: 'No cycle data', helperText: CUSTOM_INSIGHT_DEFINITIONS.find(def => def.id === metricId)?.emptyLabel ?? '' };
      return {
        value: `${roundAverage(values)}d`,
        detail: 'BG → Delivery',
        helperText: `${values.length} vehicles averaged`,
      };
    }
    case 'average_delivery_to_disbursement': {
      const values = context.vehicles
        .map(vehicle => vehicle.delivery_to_disb)
        .filter((value): value is number => value != null && value >= 0);
      if (values.length === 0) return { value: '—', detail: 'No cycle data', helperText: CUSTOM_INSIGHT_DEFINITIONS.find(def => def.id === metricId)?.emptyLabel ?? '' };
      return {
        value: `${roundAverage(values)}d`,
        detail: 'Delivery → Disbursement',
        helperText: `${values.length} vehicles averaged`,
      };
    }
    case 'worst_kpi_compliance': {
      const kpis = context.kpiSummaries
        .map(summary => ({
          summary,
          compliance: summary.validCount > 0
            ? Math.round(((summary.validCount - summary.overdueCount) / summary.validCount) * 100)
            : 100,
        }))
        .sort((left, right) => left.compliance - right.compliance);
      const worst = kpis[0];
      if (!worst) return { value: '—', detail: 'No KPI data', helperText: CUSTOM_INSIGHT_DEFINITIONS.find(def => def.id === metricId)?.emptyLabel ?? '' };
      return {
        value: `${worst.compliance}%`,
        detail: worst.summary.shortLabel,
        helperText: `${worst.summary.overdueCount} overdue / ${worst.summary.validCount} valid`,
      };
    }
    default:
      return { value: '—', detail: 'Unsupported', helperText: 'This metric is not configured.' };
  }
}