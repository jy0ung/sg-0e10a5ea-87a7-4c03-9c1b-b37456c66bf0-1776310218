import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  getRoleHomeKpis,
  listKpiDefinitions,
  upsertRoleKpiDefaults,
} from './kpiHomeService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeFromChain(returnValue: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  ['select', 'or', 'eq', 'order'].forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(returnValue).then(resolve);
  return chain;
}

describe('listKpiDefinitions', () => {
  it('filters by company OR global and only active rows', async () => {
    const chain = makeFromChain({
      data: [
        { id: 'd1', company_id: null, code: 'vehicles.total_stock', label: 'Stock',
          description: 'desc', formula: { source: 'vehicles' }, landing_route: '/auto-aging/vehicles',
          version: 1, is_active: true,
          created_at: '2026-05-26T00:00:00Z', updated_at: '2026-05-26T00:00:00Z' },
      ],
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await listKpiDefinitions('co-1');

    expect(supabase.from).toHaveBeenCalledWith('kpi_definitions');
    expect(chain.or).toHaveBeenCalledWith('company_id.eq.co-1,company_id.is.null');
    expect(chain.eq).toHaveBeenCalledWith('is_active', true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'd1', code: 'vehicles.total_stock', companyId: null, isActive: true,
      landingRoute: '/auto-aging/vehicles',
    });
  });

  it('maps a missing landing_route to null without breaking', async () => {
    const chain = makeFromChain({
      data: [
        { id: 'd2', company_id: null, code: 'legacy.code', label: 'Legacy',
          description: null, formula: {}, /* no landing_route */
          version: 1, is_active: true,
          created_at: '2026-05-26T00:00:00Z', updated_at: '2026-05-26T00:00:00Z' },
      ],
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await listKpiDefinitions('co-1');

    expect(result.data[0].landingRoute).toBeNull();
  });

  it('surfaces supabase errors', async () => {
    const chain = makeFromChain({ data: null, error: { message: 'oops' } });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await listKpiDefinitions('co-1');

    expect(result.error).not.toBeNull();
    expect(result.data).toEqual([]);
  });
});

describe('getRoleHomeKpis', () => {
  it('calls get_role_home_kpis RPC with (company, role) and maps rows', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        { code: 'sales.weekly_revenue', label: 'Revenue', description: null,
          formula: { source: 'sales_orders' }, landing_route: '/sales', position: 1 },
        { code: 'sales.open_orders', label: 'Open SOs', description: 'open',
          formula: { source: 'sales_orders' }, landing_route: '/sales/orders', position: 2 },
      ],
      error: null,
    } as never);

    const result = await getRoleHomeKpis('co-1', 'manager');

    expect(supabase.rpc).toHaveBeenCalledWith('get_role_home_kpis', {
      p_company_id: 'co-1', p_role: 'manager',
    });
    expect(result.data.map(k => k.code)).toEqual(['sales.weekly_revenue', 'sales.open_orders']);
    expect(result.data[0].position).toBe(1);
    expect(result.data[0].landingRoute).toBe('/sales');
    expect(result.data[1].landingRoute).toBe('/sales/orders');
  });

  it('surfaces landingRoute as null when the RPC omits it (pre-5a row)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        { code: 'legacy.code', label: 'Legacy', description: null,
          formula: {}, position: 1 },
      ],
      error: null,
    } as never);

    const result = await getRoleHomeKpis('co-1', 'manager');

    expect(result.data[0].landingRoute).toBeNull();
  });

  it('returns an error envelope on RPC failure', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'denied' } } as never);
    const result = await getRoleHomeKpis('co-1', 'manager');
    expect(result.error?.message).toBe('denied');
  });
});

describe('upsertRoleKpiDefaults', () => {
  it('forwards companyId, role, and code array to the RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'kpi-row-1', error: null } as never);

    const result = await upsertRoleKpiDefaults('co-1', 'sales', ['sales.open_orders', 'customers.new_this_month']);

    expect(supabase.rpc).toHaveBeenCalledWith('upsert_role_kpi_defaults', {
      p_company_id: 'co-1',
      p_role:       'sales',
      p_kpi_codes:  ['sales.open_orders', 'customers.new_this_month'],
    });
    expect(result.id).toBe('kpi-row-1');
  });

  it('returns error when RPC rejects', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Unauthorized' } } as never);
    const result = await upsertRoleKpiDefaults('co-1', 'sales', []);
    expect(result.id).toBeNull();
    expect(result.error?.message).toBe('Unauthorized');
  });
});
