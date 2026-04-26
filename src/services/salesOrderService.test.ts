import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  createVehicleFromSalesOrder,
  deleteSalesOrder,
  moveSalesOrderStage,
  updateSalesOrder,
} from './salesOrderService';
import { logUserAction, logVehicleEdit } from './auditService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('./auditService', () => ({
  logUserAction: vi.fn().mockResolvedValue({ error: null }),
  logVehicleEdit: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    error: vi.fn(),
  },
}));

vi.mock('./performanceService', () => ({
  performanceService: {
    startQueryTimer: vi.fn(() => 'timer'),
    endQueryTimer: vi.fn(),
  },
}));

function createMutationBuilder(result: { data?: unknown; error?: Error | null } = {}) {
  const builder = {
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
    then: (resolve: (value: { data?: unknown; error: Error | null }) => unknown) =>
      Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve),
  };
  return builder;
}

const orderRow = {
  id: 'order-1',
  company_id: 'company-1',
  order_no: 'SO-001',
  customer_id: 'cust-1',
  customer_name: 'Customer',
  branch_code: 'KK',
  model: 'Model X',
  booking_date: '2026-04-25',
  status: 'enquiry',
  created_at: '2026-04-25T00:00:00Z',
  updated_at: '2026-04-25T00:00:00Z',
};

describe('salesOrderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes sales order updates by company before id and audits the change', async () => {
    const builder = createMutationBuilder({ data: { ...orderRow, status: 'quoted' } });
    vi.mocked(supabase.from).mockReturnValue(builder as never);

    const result = await updateSalesOrder('company-1', 'order-1', { status: 'quoted' }, 'actor-1');

    expect(result.error).toBeNull();
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'company_id', 'company-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'id', 'order-1');
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'update', 'sales_order', 'order-1', {
      component: 'SalesOrderService',
      itemCount: expect.any(Number),
    });
  });

  it('scopes stage moves by company before id', async () => {
    const builder = createMutationBuilder();
    vi.mocked(supabase.from).mockReturnValue(builder as never);

    const result = await moveSalesOrderStage('company-1', 'order-1', 'stage-2', 'actor-1');

    expect(result.error).toBeNull();
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'company_id', 'company-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'id', 'order-1');
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'update', 'sales_order', 'order-1', { component: 'SalesOrderService' });
  });

  it('soft-deletes sales orders within company scope', async () => {
    const builder = createMutationBuilder();
    vi.mocked(supabase.from).mockReturnValue(builder as never);

    const result = await deleteSalesOrder('company-1', 'order-1', 'actor-1');

    expect(result.error).toBeNull();
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ is_deleted: true }));
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'company_id', 'company-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'id', 'order-1');
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'delete', 'sales_order', 'order-1', { component: 'SalesOrderService' });
  });

  it('creates a vehicle from a sales order using company-scoped lookups and correct audit argument order', async () => {
    const orderBuilder = createMutationBuilder({ data: orderRow });
    const vehicleBuilder = createMutationBuilder({ data: { id: 'vehicle-1' } });
    const linkBuilder = createMutationBuilder();
    vi.mocked(supabase.from)
      .mockReturnValueOnce(orderBuilder as never)
      .mockReturnValueOnce(vehicleBuilder as never)
      .mockReturnValueOnce(linkBuilder as never);

    const result = await createVehicleFromSalesOrder('order-1', 'CHASSIS-1', 'actor-1', 'company-1');

    expect(result).toEqual({ vehicleId: 'vehicle-1', error: null });
    expect(orderBuilder.eq).toHaveBeenNthCalledWith(1, 'company_id', 'company-1');
    expect(orderBuilder.eq).toHaveBeenNthCalledWith(2, 'id', 'order-1');
    expect(linkBuilder.eq).toHaveBeenNthCalledWith(1, 'company_id', 'company-1');
    expect(linkBuilder.eq).toHaveBeenNthCalledWith(2, 'id', 'order-1');
    expect(logVehicleEdit).toHaveBeenCalledWith('actor-1', 'vehicle-1', expect.objectContaining({
      source: { before: null, after: 'Sales Order SO-001' },
    }));
  });
});
