import { describe, it, expect } from 'vitest';
import {
  CUSTOM_KPI_FIELD_CATALOG,
  evaluateCustomKpiFormula,
  sanitizeCustomKpiFormula,
  type CustomKpiContext,
  type CustomKpiFormula,
} from './customKpiFormula';
import type { SalesOrder, VehicleCanonical } from '@/types';

const vehicle = (partial: Partial<VehicleCanonical>): VehicleCanonical => ({
  id: partial.id ?? 'v',
  chassis_no: partial.chassis_no ?? 'CH',
  branch_code: partial.branch_code ?? 'KK',
  model: partial.model ?? 'Alpha',
  payment_method: partial.payment_method ?? 'Cash',
  salesman_name: partial.salesman_name ?? 'Ali',
  customer_name: partial.customer_name ?? 'Cust',
  is_d2d: partial.is_d2d ?? false,
  import_batch_id: partial.import_batch_id ?? 'b',
  source_row_id: partial.source_row_id ?? 'r',
  ...partial,
});

const order = (partial: Partial<SalesOrder>): SalesOrder => ({
  id: partial.id ?? 'o',
  companyId: partial.companyId ?? 'c',
  orderNo: partial.orderNo ?? 'SO-1',
  branchCode: partial.branchCode ?? 'KK',
  model: partial.model ?? 'Alpha',
  bookingDate: partial.bookingDate ?? '2026-01-01',
  status: partial.status ?? 'booked',
  createdAt: partial.createdAt ?? '2026-01-01',
  updatedAt: partial.updatedAt ?? '2026-01-01',
  ...partial,
});

const ctx = (overrides: Partial<CustomKpiContext> = {}): CustomKpiContext => ({
  vehicles: [],
  salesOrders: [],
  customers: [],
  kpiSummaries: [],
  ...overrides,
});

describe('evaluateCustomKpiFormula', () => {
  it('counts rows with no filter', () => {
    const formula: CustomKpiFormula = {
      source: 'sales_orders',
      aggregation: 'count',
      filters: [],
      format: 'number',
    };
    const result = evaluateCustomKpiFormula(formula, ctx({
      salesOrders: [order({ id: 'a' }), order({ id: 'b' }), order({ id: 'c' })],
    }));
    expect(result.rawValue).toBe(3);
    expect(result.value).toBe('3');
  });

  it('applies filters with AND semantics', () => {
    const formula: CustomKpiFormula = {
      source: 'sales_orders',
      aggregation: 'count',
      filters: [
        { field: 'branchCode', operator: 'eq', value: 'KK' },
        { field: 'totalPrice', operator: 'gte', value: 100_000 },
      ],
      format: 'number',
    };
    const result = evaluateCustomKpiFormula(formula, ctx({
      salesOrders: [
        order({ id: '1', branchCode: 'KK', totalPrice: 150_000 }),
        order({ id: '2', branchCode: 'KK', totalPrice: 50_000 }),
        order({ id: '3', branchCode: 'TWU', totalPrice: 200_000 }),
      ],
    }));
    expect(result.rawValue).toBe(1);
  });

  it('computes average of numeric field and rounds/formats as days', () => {
    const formula: CustomKpiFormula = {
      source: 'vehicles',
      aggregation: 'avg',
      field: 'bg_to_delivery',
      filters: [{ field: 'bg_to_delivery', operator: 'is_not_null' }],
      format: 'days',
    };
    const result = evaluateCustomKpiFormula(formula, ctx({
      vehicles: [
        vehicle({ id: '1', bg_to_delivery: 30 }),
        vehicle({ id: '2', bg_to_delivery: 60 }),
        vehicle({ id: '3', bg_to_delivery: null }),
      ],
    }));
    expect(result.rawValue).toBe(45);
    expect(result.value).toBe('45d');
  });

  it('ignores rows with null/missing field in aggregations other than count', () => {
    const formula: CustomKpiFormula = {
      source: 'sales_orders',
      aggregation: 'sum',
      field: 'totalPrice',
      filters: [],
      format: 'currency',
    };
    const result = evaluateCustomKpiFormula(formula, ctx({
      salesOrders: [
        order({ id: '1', totalPrice: 10_000 }),
        order({ id: '2', totalPrice: undefined }),
        order({ id: '3', totalPrice: 5_000 }),
      ],
    }));
    expect(result.rawValue).toBe(15_000);
    expect(result.value).toBe('RM 15.0k');
  });

  it('computes median correctly for even-length sets', () => {
    const formula: CustomKpiFormula = {
      source: 'vehicles',
      aggregation: 'median',
      field: 'bg_to_delivery',
      filters: [],
      format: 'days',
    };
    const result = evaluateCustomKpiFormula(formula, ctx({
      vehicles: [
        vehicle({ id: '1', bg_to_delivery: 10 }),
        vehicle({ id: '2', bg_to_delivery: 20 }),
        vehicle({ id: '3', bg_to_delivery: 30 }),
        vehicle({ id: '4', bg_to_delivery: 40 }),
      ],
    }));
    expect(result.rawValue).toBe(25);
  });

  it('picks the top-1 group when groupBy is set (sort desc)', () => {
    const formula: CustomKpiFormula = {
      source: 'sales_orders',
      aggregation: 'sum',
      field: 'totalPrice',
      groupBy: 'branchCode',
      sort: 'desc',
      filters: [],
      format: 'currency',
    };
    const result = evaluateCustomKpiFormula(formula, ctx({
      salesOrders: [
        order({ id: '1', branchCode: 'KK', totalPrice: 100_000 }),
        order({ id: '2', branchCode: 'KK', totalPrice: 200_000 }),
        order({ id: '3', branchCode: 'TWU', totalPrice: 250_000 }),
      ],
    }));
    expect(result.detail).toBe('KK');
    expect(result.rawValue).toBe(300_000);
  });

  it('picks the bottom-1 group when sort is asc', () => {
    const formula: CustomKpiFormula = {
      source: 'vehicles',
      aggregation: 'avg',
      field: 'bg_to_delivery',
      groupBy: 'branch_code',
      sort: 'asc',
      filters: [{ field: 'bg_to_delivery', operator: 'is_not_null' }],
      format: 'days',
    };
    const result = evaluateCustomKpiFormula(formula, ctx({
      vehicles: [
        vehicle({ id: '1', branch_code: 'KK', bg_to_delivery: 20 }),
        vehicle({ id: '2', branch_code: 'KK', bg_to_delivery: 40 }),
        vehicle({ id: '3', branch_code: 'TWU', bg_to_delivery: 90 }),
      ],
    }));
    expect(result.detail).toBe('KK');
    expect(result.rawValue).toBe(30);
  });

  it('emits progress info when a gte target is set', () => {
    const formula: CustomKpiFormula = {
      source: 'sales_orders',
      aggregation: 'count',
      filters: [],
      format: 'number',
      target: { value: 10, comparison: 'gte' },
    };
    const result = evaluateCustomKpiFormula(formula, ctx({
      salesOrders: [order({ id: '1' }), order({ id: '2' }), order({ id: '3' }), order({ id: '4' }), order({ id: '5' })],
    }));
    expect(result.progress).toBe(50);
    expect(result.meetsTarget).toBe(false);
  });

  it('emits progress info when an lte target is met', () => {
    const formula: CustomKpiFormula = {
      source: 'vehicles',
      aggregation: 'count',
      filters: [{ field: 'bg_to_delivery', operator: 'gt', value: 45 }],
      format: 'number',
      target: { value: 0, comparison: 'lte' },
    };
    const result = evaluateCustomKpiFormula(formula, ctx({
      vehicles: [vehicle({ id: '1', bg_to_delivery: 20 })],
    }));
    // 0 overdue, target says "should be <= 0", so meets.
    expect(result.rawValue).toBe(0);
    expect(result.meetsTarget).toBe(true);
  });

  it('returns a blank marker when no rows match', () => {
    const formula: CustomKpiFormula = {
      source: 'vehicles',
      aggregation: 'avg',
      field: 'bg_to_delivery',
      filters: [{ field: 'branch_code', operator: 'eq', value: 'XX' }],
      format: 'days',
    };
    const result = evaluateCustomKpiFormula(formula, ctx({
      vehicles: [vehicle({ id: '1', branch_code: 'KK', bg_to_delivery: 30 })],
    }));
    expect(result.value).toBe('—');
    expect(result.rawValue).toBeNull();
  });
});

describe('sanitizeCustomKpiFormula', () => {
  it('returns null for junk input', () => {
    expect(sanitizeCustomKpiFormula(null)).toBeNull();
    expect(sanitizeCustomKpiFormula('invalid')).toBeNull();
    expect(sanitizeCustomKpiFormula({})).toBeNull();
  });

  it('rejects unknown fields (allow-list enforcement)', () => {
    const result = sanitizeCustomKpiFormula({
      source: 'vehicles',
      aggregation: 'sum',
      field: 'hacker_field',
      filters: [],
      format: 'number',
    });
    expect(result).toBeNull();
  });

  it('strips out filters whose fields are not in the catalog', () => {
    const result = sanitizeCustomKpiFormula({
      source: 'sales_orders',
      aggregation: 'count',
      filters: [
        { field: 'branchCode', operator: 'eq', value: 'KK' },
        { field: '__proto__', operator: 'eq', value: 'x' },
      ],
      format: 'number',
    });
    expect(result?.filters.length).toBe(1);
    expect(result?.filters[0].field).toBe('branchCode');
  });

  it('requires a field for non-count aggregations', () => {
    const result = sanitizeCustomKpiFormula({
      source: 'sales_orders',
      aggregation: 'sum',
      filters: [],
      format: 'number',
    });
    expect(result).toBeNull();
  });

  it('round-trips a valid formula', () => {
    const input: CustomKpiFormula = {
      source: 'vehicles',
      aggregation: 'avg',
      field: 'bg_to_delivery',
      filters: [{ field: 'branch_code', operator: 'eq', value: 'KK' }],
      format: 'days',
      target: { value: 45, comparison: 'lte' },
    };
    expect(sanitizeCustomKpiFormula(input)).toEqual(input);
  });

  it('catalog covers every source', () => {
    const sources: Array<keyof typeof CUSTOM_KPI_FIELD_CATALOG> = ['vehicles', 'sales_orders', 'customers', 'kpi_summaries'];
    for (const s of sources) {
      expect(CUSTOM_KPI_FIELD_CATALOG[s].length).toBeGreaterThan(0);
    }
  });
});
