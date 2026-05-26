import { describe, expect, it } from 'vitest';
import { hrefForKpi } from './hrefForKpi';

describe('hrefForKpi (Phase 5a resolution order)', () => {
  it('prefers landingRoute from the KPI definition when present', () => {
    expect(hrefForKpi('vehicles.total_stock', '/custom/vehicles-board')).toBe('/custom/vehicles-board');
  });

  it('treats an all-whitespace landingRoute as missing', () => {
    expect(hrefForKpi('vehicles.total_stock', '   ')).toBe('/auto-aging/vehicles');
  });

  it('falls back to the legacy code-keyed map when landingRoute is null', () => {
    expect(hrefForKpi('sales.weekly_revenue', null)).toBe('/sales');
    expect(hrefForKpi('customers.new_this_month', undefined)).toBe('/sales/customers');
  });

  it('lands on /dashboard for KPIs not in the legacy map and without landingRoute', () => {
    expect(hrefForKpi('unknown.metric', null)).toBe('/dashboard');
  });
});
