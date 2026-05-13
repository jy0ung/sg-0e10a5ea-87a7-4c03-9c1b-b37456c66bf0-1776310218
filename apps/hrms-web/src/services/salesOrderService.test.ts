import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  createVehicleFromSalesOrder,
  deleteSalesOrder,
  getLinkedSalesOrderForVehicle,
  getSalesDashboardSummary,
  getSalesPipelineSummary,
  linkExistingVehicle,
  moveSalesOrderStage,
  transitionOrderStage,
  updateSalesOrder,
  unlinkExistingVehicle,
} from './salesOrderService';
import { logUserAction, logVehicleEdit } from './auditService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
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

  it('links an existing vehicle through the controlled RPC and audits the order update', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        sales_order_id: 'order-1',
        vehicle_id: 'vehicle-1',
        chassis_no: 'CHASSIS-1',
        order_no: 'SO-001',
      },
      error: null,
    } as never);

    const result = await linkExistingVehicle('company-1', {
      orderId: 'order-1',
      chassisNo: 'CHASSIS-1',
      vehicleId: 'vehicle-1',
    }, 'actor-1');

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      salesOrderId: 'order-1',
      vehicleId: 'vehicle-1',
      chassisNo: 'CHASSIS-1',
      orderNo: 'SO-001',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('link_vehicle_to_sales_order', {
      p_sales_order_id: 'order-1',
      p_chassis_no: 'CHASSIS-1',
      p_vehicle_id: 'vehicle-1',
    });
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'update', 'sales_order', 'order-1', expect.objectContaining({
      action: 'link_existing_vehicle',
      vehicleId: 'vehicle-1',
      chassisNo: 'CHASSIS-1',
    }));
  });

  it('loads a linked sales order by vehicle id', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { ...orderRow, vehicle_id: 'vehicle-1', chassis_no: 'CHASSIS-1' }, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(builder as never);

    const result = await getLinkedSalesOrderForVehicle('company-1', 'vehicle-1', 'CHASSIS-1');

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('order-1');
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'company_id', 'company-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'is_deleted', false);
    expect(builder.eq).toHaveBeenNthCalledWith(3, 'vehicle_id', 'vehicle-1');
  });

  it('unlinks an existing vehicle through the controlled RPC and audits the order update', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        sales_order_id: 'order-1',
        previous_vehicle_id: 'vehicle-1',
        previous_chassis_no: 'CHASSIS-1',
        order_no: 'SO-001',
      },
      error: null,
    } as never);

    const result = await unlinkExistingVehicle('company-1', 'order-1', 'actor-1');

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      salesOrderId: 'order-1',
      previousVehicleId: 'vehicle-1',
      previousChassisNo: 'CHASSIS-1',
      orderNo: 'SO-001',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('unlink_vehicle_from_sales_order', {
      p_sales_order_id: 'order-1',
    });
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'update', 'sales_order', 'order-1', expect.objectContaining({
      action: 'unlink_existing_vehicle',
      vehicleId: 'vehicle-1',
      chassisNo: 'CHASSIS-1',
    }));
  });

  // -------------------------------------------------------------------------
  // transitionOrderStage() — calls transition_sales_order_stage RPC
  // -------------------------------------------------------------------------
  it('calls transition_sales_order_stage RPC and maps result to TransitionOrderStageResult', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { action: 'transitioned', order_id: 'order-1', previous_stage_id: null, new_stage_id: 'stage-2' },
      error: null,
    } as never);

    const result = await transitionOrderStage('company-1', 'order-1', 'stage-2', 'actor-1');

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      action: 'transitioned',
      orderId: 'order-1',
      previousStageId: null,
      newStageId: 'stage-2',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('transition_sales_order_stage', {
      p_order_id:   'order-1',
      p_stage_id:   'stage-2',
      p_company_id: 'company-1',
      p_actor_id:   'actor-1',
    });
  });

  it('transitionOrderStage passes null stage_id to un-assign from pipeline', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { action: 'transitioned', order_id: 'order-1', previous_stage_id: 'stage-1', new_stage_id: null },
      error: null,
    } as never);

    const result = await transitionOrderStage('company-1', 'order-1', null, undefined);

    expect(result.error).toBeNull();
    expect(result.data?.newStageId).toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith('transition_sales_order_stage', {
      p_order_id:   'order-1',
      p_stage_id:   null,
      p_company_id: 'company-1',
      p_actor_id:   null,
    });
  });

  // -------------------------------------------------------------------------
  // getSalesPipelineSummary() — calls get_sales_pipeline_summary RPC
  // -------------------------------------------------------------------------
  it('calls get_sales_pipeline_summary RPC and maps jsonb to PipelineSummary', async () => {
    const rawJson = {
      by_stage: [
        { deal_stage_id: 'ds-1', stage_name: 'Enquiry', stage_order: 1, stage_color: '#fff', order_count: 5, total_value: 250000 },
      ],
      unassigned: { order_count: 2, total_value: 80000 },
      totals: { order_count: 7, total_value: 330000 },
    };
    vi.mocked(supabase.rpc).mockResolvedValue({ data: rawJson, error: null } as never);

    const result = await getSalesPipelineSummary('company-1', { branchCode: 'KK' });

    expect(result.error).toBeNull();
    expect(result.data?.byStage).toHaveLength(1);
    expect(result.data?.byStage[0]).toEqual({
      dealStageId: 'ds-1',
      stageName: 'Enquiry',
      stageOrder: 1,
      stageColor: '#fff',
      orderCount: 5,
      totalValue: 250000,
    });
    expect(result.data?.totals.orderCount).toBe(7);
    expect(supabase.rpc).toHaveBeenCalledWith('get_sales_pipeline_summary', expect.objectContaining({
      p_company_id:  'company-1',
      p_branch_code: 'KK',
    }));
  });

  // -------------------------------------------------------------------------
  // getSalesDashboardSummary() — calls get_sales_dashboard_summary RPC
  // -------------------------------------------------------------------------
  it('calls get_sales_dashboard_summary RPC and maps jsonb to SalesDashboardSummary', async () => {
    const rawJson = {
      mtd: { order_count: 12, total_value: 600000 },
      vehicles_linked: 8,
      branch_breakdown: [{ branch_code: 'KK', order_count: 10 }],
      monthly_trend: [{ month_key: '2026-05', order_count: 12 }],
      outstanding_ar: 150000,
    };
    vi.mocked(supabase.rpc).mockResolvedValue({ data: rawJson, error: null } as never);

    const result = await getSalesDashboardSummary('company-1', 'KK');

    expect(result.error).toBeNull();
    expect(result.data?.mtd.orderCount).toBe(12);
    expect(result.data?.mtd.totalValue).toBe(600000);
    expect(result.data?.vehiclesLinked).toBe(8);
    expect(result.data?.branchBreakdown[0].branchCode).toBe('KK');
    expect(result.data?.monthlyTrend[0].monthKey).toBe('2026-05');
    expect(result.data?.outstandingAr).toBe(150000);
    expect(supabase.rpc).toHaveBeenCalledWith('get_sales_dashboard_summary', {
      p_company_id:  'company-1',
      p_branch_code: 'KK',
    });
  });
});
