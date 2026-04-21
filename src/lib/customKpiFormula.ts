import type { KpiSummary, SalesOrder, VehicleCanonical, Customer } from '@/types';

// ============================================================================
// Custom KPI Formula engine
// ----------------------------------------------------------------------------
// A user-defined KPI is a tuple of:
//   source       — which dataset to scan (vehicles, sales_orders, ...)
//   filters[]    — AND-joined predicates restricting the rows
//   aggregation  — how to reduce the rows (count, sum, avg, min, max, median)
//   field        — the field aggregated (ignored when aggregation = count)
//   groupBy      — optional field; when set we pick the top group (after sort)
//   sort         — 'desc' (highest) | 'asc' (lowest) — only with groupBy
//   target       — optional goal to drive a progress bar
//   format       — how to render the numeric value
//
// The engine is pure, deterministic, and never uses eval / Function so it is
// safe against prompt-injection through user-provided titles or filter values.
// ============================================================================

export type CustomKpiSource = 'vehicles' | 'sales_orders' | 'customers' | 'kpi_summaries';

export type CustomKpiAggregation = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'median';

export type CustomKpiOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'starts_with'
  | 'is_null'
  | 'is_not_null'
  | 'in'
  | 'not_in';

export type CustomKpiFormat = 'number' | 'currency' | 'percent' | 'days';

export interface CustomKpiFilter {
  field: string;
  operator: CustomKpiOperator;
  value?: string | number | boolean | Array<string | number>;
}

export interface CustomKpiTarget {
  value: number;
  comparison: 'gte' | 'lte'; // "value should be >= target" | "value should be <= target"
}

export interface CustomKpiFormula {
  source: CustomKpiSource;
  aggregation: CustomKpiAggregation;
  field?: string;
  filters: CustomKpiFilter[];
  groupBy?: string;
  sort?: 'asc' | 'desc';
  format: CustomKpiFormat;
  target?: CustomKpiTarget;
}

export interface CustomKpiEvaluation {
  value: string;
  rawValue: number | null;
  detail: string;
  helperText: string;
  progress?: number; // 0..100 relative to target
  meetsTarget?: boolean;
}

export interface CustomKpiContext {
  vehicles: VehicleCanonical[];
  salesOrders: SalesOrder[];
  customers: Customer[];
  kpiSummaries: KpiSummary[];
}

// ----------------------------------------------------------------------------
// Field catalog — the allow-list of fields per source. This is both the
// security boundary (users can only filter/aggregate on fields we surface)
// and the UX catalog driving the dropdowns in the builder.
// ----------------------------------------------------------------------------

export interface CustomKpiFieldDefinition {
  key: string;
  label: string;
  kind: 'string' | 'number' | 'boolean' | 'date';
}

export const CUSTOM_KPI_FIELD_CATALOG: Record<CustomKpiSource, CustomKpiFieldDefinition[]> = {
  vehicles: [
    { key: 'branch_code', label: 'Branch', kind: 'string' },
    { key: 'model', label: 'Model', kind: 'string' },
    { key: 'payment_method', label: 'Payment method', kind: 'string' },
    { key: 'salesman_name', label: 'Salesman', kind: 'string' },
    { key: 'is_d2d', label: 'Is D2D', kind: 'boolean' },
    { key: 'bg_date', label: 'BG date', kind: 'date' },
    { key: 'delivery_date', label: 'Delivery date', kind: 'date' },
    { key: 'reg_date', label: 'Registration date', kind: 'date' },
    { key: 'disb_date', label: 'Disbursement date', kind: 'date' },
    { key: 'bg_to_delivery', label: 'BG → Delivery (days)', kind: 'number' },
    { key: 'bg_to_shipment_etd', label: 'BG → Shipment ETD (days)', kind: 'number' },
    { key: 'etd_to_outlet', label: 'ETD → Outlet (days)', kind: 'number' },
    { key: 'outlet_to_reg', label: 'Outlet → Reg (days)', kind: 'number' },
    { key: 'reg_to_delivery', label: 'Reg → Delivery (days)', kind: 'number' },
    { key: 'bg_to_disb', label: 'BG → Disbursement (days)', kind: 'number' },
    { key: 'delivery_to_disb', label: 'Delivery → Disbursement (days)', kind: 'number' },
  ],
  sales_orders: [
    { key: 'branchCode', label: 'Branch', kind: 'string' },
    { key: 'model', label: 'Model', kind: 'string' },
    { key: 'variant', label: 'Variant', kind: 'string' },
    { key: 'colour', label: 'Colour', kind: 'string' },
    { key: 'salesmanName', label: 'Salesman', kind: 'string' },
    { key: 'status', label: 'Status', kind: 'string' },
    { key: 'financeCompany', label: 'Finance company', kind: 'string' },
    { key: 'bookingDate', label: 'Booking date', kind: 'date' },
    { key: 'deliveryDate', label: 'Delivery date', kind: 'date' },
    { key: 'bookingAmount', label: 'Booking amount', kind: 'number' },
    { key: 'totalPrice', label: 'Total price', kind: 'number' },
    { key: 'depositAmount', label: 'Deposit amount', kind: 'number' },
    { key: 'bankLoanAmount', label: 'Bank loan amount', kind: 'number' },
    { key: 'outstandingAmount', label: 'Outstanding amount', kind: 'number' },
  ],
  customers: [
    { key: 'name', label: 'Name', kind: 'string' },
    { key: 'email', label: 'Email', kind: 'string' },
    { key: 'phone', label: 'Phone', kind: 'string' },
    { key: 'createdAt', label: 'Created at', kind: 'date' },
  ],
  kpi_summaries: [
    { key: 'shortLabel', label: 'KPI label', kind: 'string' },
    { key: 'validCount', label: 'Valid count', kind: 'number' },
    { key: 'overdueCount', label: 'Overdue count', kind: 'number' },
    { key: 'average', label: 'Average (days)', kind: 'number' },
    { key: 'median', label: 'Median (days)', kind: 'number' },
    { key: 'p90', label: 'P90 (days)', kind: 'number' },
    { key: 'slaDays', label: 'SLA days', kind: 'number' },
  ],
};

export const CUSTOM_KPI_SOURCE_LABELS: Record<CustomKpiSource, string> = {
  vehicles: 'Vehicles',
  sales_orders: 'Sales orders',
  customers: 'Customers',
  kpi_summaries: 'KPI summaries',
};

export const CUSTOM_KPI_AGGREGATION_LABELS: Record<CustomKpiAggregation, string> = {
  count: 'Count',
  sum: 'Sum',
  avg: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  median: 'Median',
};

export const CUSTOM_KPI_OPERATOR_LABELS: Record<CustomKpiOperator, string> = {
  eq: 'equals',
  ne: 'not equals',
  gt: 'greater than',
  gte: 'greater or equal',
  lt: 'less than',
  lte: 'less or equal',
  contains: 'contains',
  starts_with: 'starts with',
  is_null: 'is empty',
  is_not_null: 'is not empty',
  in: 'in',
  not_in: 'not in',
};

// ----------------------------------------------------------------------------
// Runtime helpers
// ----------------------------------------------------------------------------

function getField(row: Record<string, unknown>, field: string): unknown {
  return row[field];
}

function toComparable(v: unknown): number | string | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  return String(v);
}

function coerceNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function applyOperator(cell: unknown, operator: CustomKpiOperator, value: CustomKpiFilter['value']): boolean {
  const cmp = toComparable(cell);
  switch (operator) {
    case 'is_null': return cmp === null || cmp === '';
    case 'is_not_null': return cmp !== null && cmp !== '';
    case 'eq': return String(cmp) === String(value);
    case 'ne': return String(cmp) !== String(value);
    case 'gt': {
      const n = coerceNumber(cell); const t = coerceNumber(value);
      return n !== null && t !== null && n > t;
    }
    case 'gte': {
      const n = coerceNumber(cell); const t = coerceNumber(value);
      return n !== null && t !== null && n >= t;
    }
    case 'lt': {
      const n = coerceNumber(cell); const t = coerceNumber(value);
      return n !== null && t !== null && n < t;
    }
    case 'lte': {
      const n = coerceNumber(cell); const t = coerceNumber(value);
      return n !== null && t !== null && n <= t;
    }
    case 'contains': return cmp !== null && String(cmp).toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'starts_with': return cmp !== null && String(cmp).toLowerCase().startsWith(String(value ?? '').toLowerCase());
    case 'in': {
      if (!Array.isArray(value)) return false;
      return value.map(String).includes(String(cmp));
    }
    case 'not_in': {
      if (!Array.isArray(value)) return true;
      return !value.map(String).includes(String(cmp));
    }
    default: return false;
  }
}

function passesAllFilters(row: Record<string, unknown>, filters: CustomKpiFilter[]): boolean {
  for (const filter of filters) {
    if (!applyOperator(getField(row, filter.field), filter.operator, filter.value)) return false;
  }
  return true;
}

function aggregate(values: number[], aggregation: CustomKpiAggregation): number | null {
  if (aggregation === 'count') return values.length;
  if (values.length === 0) return null;
  switch (aggregation) {
    case 'sum': return values.reduce((acc, v) => acc + v, 0);
    case 'avg': return values.reduce((acc, v) => acc + v, 0) / values.length;
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }
    default: return null;
  }
}

function selectSource(source: CustomKpiSource, ctx: CustomKpiContext): Array<Record<string, unknown>> {
  switch (source) {
    case 'vehicles': return ctx.vehicles as unknown as Array<Record<string, unknown>>;
    case 'sales_orders': return ctx.salesOrders as unknown as Array<Record<string, unknown>>;
    case 'customers': return ctx.customers as unknown as Array<Record<string, unknown>>;
    case 'kpi_summaries': return ctx.kpiSummaries as unknown as Array<Record<string, unknown>>;
  }
}

function formatValue(value: number, format: CustomKpiFormat): string {
  if (!Number.isFinite(value)) return '—';
  switch (format) {
    case 'currency':
      if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(2)}m`;
      if (value >= 1_000) return `RM ${(value / 1_000).toFixed(1)}k`;
      return `RM ${value.toFixed(0)}`;
    case 'percent':
      return `${Math.round(value)}%`;
    case 'days':
      return `${Math.round(value)}d`;
    case 'number':
    default:
      return Math.abs(value) >= 1000 ? value.toLocaleString() : String(Math.round(value * 100) / 100);
  }
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export function evaluateCustomKpiFormula(formula: CustomKpiFormula, ctx: CustomKpiContext): CustomKpiEvaluation {
  const rows = selectSource(formula.source, ctx).filter(row => passesAllFilters(row, formula.filters));

  // Grouped — pick the top-1 group.
  if (formula.groupBy) {
    const groupBy = formula.groupBy;
    const groups = new Map<string, number[]>();
    rows.forEach(row => {
      const key = String(getField(row, groupBy) ?? '—');
      const bucket = groups.get(key) ?? [];
      if (formula.aggregation === 'count') {
        bucket.push(1);
      } else if (formula.field) {
        const n = coerceNumber(getField(row, formula.field));
        if (n !== null) bucket.push(n);
      }
      groups.set(key, bucket);
    });

    const reduced = Array.from(groups.entries()).map(([key, vs]) => ({
      key,
      value: aggregate(vs, formula.aggregation),
      rowCount: vs.length,
    })).filter(entry => entry.value !== null) as Array<{ key: string; value: number; rowCount: number }>;

    const sortDirection: 'asc' | 'desc' = formula.sort ?? 'desc';
    reduced.sort((a, b) => sortDirection === 'desc' ? b.value - a.value : a.value - b.value);
    const top = reduced[0];
    if (!top) {
      return { value: '—', rawValue: null, detail: 'No matching rows', helperText: `0 of ${rows.length} rows grouped` };
    }
    const progressInfo = computeProgress(top.value, formula.target);
    return {
      value: formatValue(top.value, formula.format),
      rawValue: top.value,
      detail: top.key,
      helperText: `${top.rowCount} row${top.rowCount === 1 ? '' : 's'} • ${reduced.length} group${reduced.length === 1 ? '' : 's'}`,
      ...progressInfo,
    };
  }

  // Ungrouped single-value aggregation.
  let values: number[];
  if (formula.aggregation === 'count') {
    values = rows.map(() => 1);
  } else if (formula.field) {
    values = rows
      .map(row => coerceNumber(getField(row, formula.field!)))
      .filter((v): v is number => v !== null);
  } else {
    values = [];
  }

  const result = aggregate(values, formula.aggregation);
  if (result === null) {
    return { value: '—', rawValue: null, detail: 'No matching rows', helperText: `${rows.length} rows scanned` };
  }

  const progressInfo = computeProgress(result, formula.target);
  return {
    value: formatValue(result, formula.format),
    rawValue: result,
    detail: `${CUSTOM_KPI_AGGREGATION_LABELS[formula.aggregation]}${formula.field ? ` of ${formula.field}` : ''}`,
    helperText: `${rows.length} row${rows.length === 1 ? '' : 's'} matched`,
    ...progressInfo,
  };
}

function computeProgress(value: number, target: CustomKpiTarget | undefined) {
  if (!target || !Number.isFinite(target.value)) return {};
  if (target.comparison === 'gte') {
    if (target.value === 0) {
      return { progress: value >= 0 ? 100 : 0, meetsTarget: value >= 0 };
    }
    const pct = Math.max(0, Math.min(100, (value / target.value) * 100));
    return { progress: Math.round(pct), meetsTarget: value >= target.value };
  }
  // lte — progress is 100 when value is at or below target, decays as it exceeds.
  if (value <= target.value) return { progress: 100, meetsTarget: true };
  if (value <= 0) return { progress: 100, meetsTarget: true };
  const pct = Math.max(0, Math.min(100, (target.value / value) * 100));
  return { progress: Math.round(pct), meetsTarget: false };
}

// ----------------------------------------------------------------------------
// Defaults + starter presets for the UI
// ----------------------------------------------------------------------------

export const DEFAULT_CUSTOM_KPI_FORMULA: CustomKpiFormula = {
  source: 'sales_orders',
  aggregation: 'count',
  filters: [],
  format: 'number',
};

export interface CustomKpiPreset {
  id: string;
  title: string;
  description: string;
  formula: CustomKpiFormula;
}

export const CUSTOM_KPI_PRESETS: CustomKpiPreset[] = [
  {
    id: 'bookings-total',
    title: 'Total Bookings',
    description: 'Number of sales orders in the current scope.',
    formula: {
      source: 'sales_orders',
      aggregation: 'count',
      filters: [],
      format: 'number',
    },
  },
  {
    id: 'booking-value-total',
    title: 'Total Booking Value',
    description: 'Sum of total price across all sales orders.',
    formula: {
      source: 'sales_orders',
      aggregation: 'sum',
      field: 'totalPrice',
      filters: [],
      format: 'currency',
    },
  },
  {
    id: 'avg-bg-to-delivery',
    title: 'Average BG → Delivery',
    description: 'Average cycle time from BG to delivery across vehicles.',
    formula: {
      source: 'vehicles',
      aggregation: 'avg',
      field: 'bg_to_delivery',
      filters: [{ field: 'bg_to_delivery', operator: 'is_not_null' }],
      format: 'days',
      target: { value: 45, comparison: 'lte' },
    },
  },
  {
    id: 'overdue-vehicles',
    title: 'Overdue Vehicles (> 45 days)',
    description: 'Count of vehicles whose BG → Delivery exceeds 45 days.',
    formula: {
      source: 'vehicles',
      aggregation: 'count',
      filters: [{ field: 'bg_to_delivery', operator: 'gt', value: 45 }],
      format: 'number',
      target: { value: 0, comparison: 'lte' },
    },
  },
  {
    id: 'top-booking-branch',
    title: 'Top Branch by Bookings',
    description: 'Branch with the most sales orders in scope.',
    formula: {
      source: 'sales_orders',
      aggregation: 'count',
      groupBy: 'branchCode',
      sort: 'desc',
      filters: [],
      format: 'number',
    },
  },
  {
    id: 'top-model-revenue',
    title: 'Top Model by Revenue',
    description: 'Model with the highest total booking value.',
    formula: {
      source: 'sales_orders',
      aggregation: 'sum',
      field: 'totalPrice',
      groupBy: 'model',
      sort: 'desc',
      filters: [],
      format: 'currency',
    },
  },
];

// ----------------------------------------------------------------------------
// Sanitizer — defends against garbage / old-shape objects from storage/RLS.
// ----------------------------------------------------------------------------

const AGGREGATIONS: CustomKpiAggregation[] = ['count', 'sum', 'avg', 'min', 'max', 'median'];
const OPERATORS: CustomKpiOperator[] = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts_with',
  'is_null', 'is_not_null', 'in', 'not_in',
];
const FORMATS: CustomKpiFormat[] = ['number', 'currency', 'percent', 'days'];
const SOURCES: CustomKpiSource[] = ['vehicles', 'sales_orders', 'customers', 'kpi_summaries'];

export function sanitizeCustomKpiFormula(input: unknown): CustomKpiFormula | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const source = SOURCES.includes(raw.source as CustomKpiSource) ? raw.source as CustomKpiSource : null;
  const aggregation = AGGREGATIONS.includes(raw.aggregation as CustomKpiAggregation) ? raw.aggregation as CustomKpiAggregation : null;
  const format = FORMATS.includes(raw.format as CustomKpiFormat) ? raw.format as CustomKpiFormat : 'number';
  if (!source || !aggregation) return null;

  const validFields = new Set(CUSTOM_KPI_FIELD_CATALOG[source].map(f => f.key));

  const field = typeof raw.field === 'string' && validFields.has(raw.field) ? raw.field : undefined;
  if (aggregation !== 'count' && !field) return null;

  const groupBy = typeof raw.groupBy === 'string' && validFields.has(raw.groupBy) ? raw.groupBy : undefined;
  const sort: 'asc' | 'desc' | undefined = raw.sort === 'asc' || raw.sort === 'desc' ? raw.sort : undefined;

  const filtersRaw = Array.isArray(raw.filters) ? raw.filters : [];
  const filters: CustomKpiFilter[] = [];
  for (const entry of filtersRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const f = entry as Record<string, unknown>;
    if (typeof f.field !== 'string' || !validFields.has(f.field)) continue;
    if (!OPERATORS.includes(f.operator as CustomKpiOperator)) continue;
    const filter: CustomKpiFilter = {
      field: f.field,
      operator: f.operator as CustomKpiOperator,
    };
    if (Array.isArray(f.value)) {
      filter.value = f.value.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number');
    } else if (typeof f.value === 'string' || typeof f.value === 'number' || typeof f.value === 'boolean') {
      filter.value = f.value;
    }
    filters.push(filter);
  }

  let target: CustomKpiTarget | undefined;
  if (raw.target && typeof raw.target === 'object') {
    const t = raw.target as Record<string, unknown>;
    const value = coerceNumber(t.value);
    const comparison = t.comparison === 'gte' || t.comparison === 'lte' ? t.comparison : null;
    if (value !== null && comparison) target = { value, comparison };
  }

  return { source, aggregation, field, filters, groupBy, sort, format, target };
}
