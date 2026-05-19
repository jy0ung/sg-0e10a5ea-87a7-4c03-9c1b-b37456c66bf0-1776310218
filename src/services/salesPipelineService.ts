/**
 * salesPipelineService — stage transitions, vehicle linking, and pipeline summary.
 *
 * Depends on salesOrderCrudService for mapOrder / missingCompanyError.
 */

import { supabase } from '@/integrations/supabase/client';
import { SalesOrder } from '@/types';
import { loggingService } from './loggingService';
import { logUserAction, logVehicleEdit } from './auditService';
import { mapOrder, missingCompanyError } from './salesOrderCrudService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TransitionOrderStageResult {
  action: 'transitioned' | 'no_change';
  orderId: string;
  previousStageId: string | null;
  newStageId: string | null;
}

export interface PipelineStageSummary {
  dealStageId: string;
  stageName: string;
  stageOrder: number;
  stageColor: string;
  orderCount: number;
  totalValue: number;
}

export interface PipelineSummary {
  byStage: PipelineStageSummary[];
  unassigned: { orderCount: number; totalValue: number };
  totals: { orderCount: number; totalValue: number };
}

export interface LinkExistingVehicleParams {
  orderId: string;
  chassisNo?: string | null;
  vehicleId?: string | null;
}

export interface LinkExistingVehicleResult {
  salesOrderId: string;
  vehicleId: string;
  chassisNo: string;
  orderNo?: string;
}

export interface UnlinkExistingVehicleResult {
  salesOrderId: string;
  previousVehicleId: string | null;
  previousChassisNo: string | null;
  orderNo?: string;
}

// ── Functions ─────────────────────────────────────────────────────────────────

/** Audited pipeline-stage transition via server-side RPC (preferred over moveSalesOrderStage). */
export async function transitionOrderStage(
  companyId: string,
  orderId: string,
  stageId: string | null,
  actorId?: string,
): Promise<{ data: TransitionOrderStageResult | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const { data, error } = await supabase.rpc('transition_sales_order_stage', {
    p_order_id: orderId,
    p_stage_id: stageId ?? null,
    p_company_id: companyId,
    p_actor_id: actorId ?? null,
  });
  if (error) return { data: null, error: new Error(error.message) };
  const raw = data as Record<string, unknown>;
  return {
    data: {
      action: raw.action as 'transitioned' | 'no_change',
      orderId: raw.order_id as string,
      previousStageId: raw.previous_stage_id as string | null,
      newStageId: raw.new_stage_id as string | null,
    },
    error: null,
  };
}

export async function getSalesPipelineSummary(
  companyId: string,
  opts?: { branchCode?: string | null; fromDate?: string | null; toDate?: string | null },
): Promise<{ data: PipelineSummary | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const { data, error } = await supabase.rpc('get_sales_pipeline_summary', {
    p_company_id: companyId,
    p_branch_code: (opts?.branchCode ?? null) as unknown as string | undefined,
    p_from_date: (opts?.fromDate ?? null) as unknown as string | undefined,
    p_to_date: (opts?.toDate ?? null) as unknown as string | undefined,
  });
  if (error) return { data: null, error: new Error(error.message) };
  const raw = data as Record<string, unknown>;
  const mapStage = (s: Record<string, unknown>): PipelineStageSummary => ({
    dealStageId: s.deal_stage_id as string,
    stageName: s.stage_name as string,
    stageOrder: Number(s.stage_order),
    stageColor: s.stage_color as string,
    orderCount: Number(s.order_count),
    totalValue: Number(s.total_value),
  });
  const mapBucket = (b: Record<string, unknown>) => ({
    orderCount: Number(b.order_count),
    totalValue: Number(b.total_value),
  });
  return {
    data: {
      byStage: ((raw.by_stage as Record<string, unknown>[]) ?? []).map(mapStage),
      unassigned: mapBucket(raw.unassigned as Record<string, unknown>),
      totals: mapBucket(raw.totals as Record<string, unknown>),
    },
    error: null,
  };
}

export async function linkExistingVehicle(
  companyId: string,
  params: LinkExistingVehicleParams,
  actorId?: string,
): Promise<{ data: LinkExistingVehicleResult | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  if (!params.orderId) return { data: null, error: new Error('Sales order id is required') };
  if (!params.vehicleId && !params.chassisNo?.trim()) {
    return { data: null, error: new Error('Vehicle id or chassis number is required') };
  }

  const { data, error } = await supabase.rpc('link_vehicle_to_sales_order' as never, {
    p_sales_order_id: params.orderId,
    p_chassis_no: params.chassisNo?.trim() || null,
    p_vehicle_id: params.vehicleId ?? null,
  } as never);

  if (error) {
    loggingService.error('linkExistingVehicle failed', { error, params }, 'SalesPipelineService');
    return { data: null, error: new Error(error.message) };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const result: LinkExistingVehicleResult = {
    salesOrderId: String(raw.sales_order_id ?? params.orderId),
    vehicleId: String(raw.vehicle_id ?? params.vehicleId ?? ''),
    chassisNo: String(raw.chassis_no ?? params.chassisNo ?? ''),
    orderNo: raw.order_no ? String(raw.order_no) : undefined,
  };

  if (actorId) {
    void logUserAction(actorId, 'update', 'sales_order', result.salesOrderId, {
      component: 'SalesPipelineService',
      action: 'link_existing_vehicle',
      vehicleId: result.vehicleId,
      chassisNo: result.chassisNo,
    });
  }

  return { data: result, error: null };
}

export async function unlinkExistingVehicle(
  companyId: string,
  orderId: string,
  actorId?: string,
): Promise<{ data: UnlinkExistingVehicleResult | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  if (!orderId) return { data: null, error: new Error('Sales order id is required') };

  const { data, error } = await supabase.rpc('unlink_vehicle_from_sales_order' as never, {
    p_sales_order_id: orderId,
  } as never);

  if (error) {
    loggingService.error('unlinkExistingVehicle failed', { error, orderId }, 'SalesPipelineService');
    return { data: null, error: new Error(error.message) };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const result: UnlinkExistingVehicleResult = {
    salesOrderId: String(raw.sales_order_id ?? orderId),
    previousVehicleId: raw.previous_vehicle_id ? String(raw.previous_vehicle_id) : null,
    previousChassisNo: raw.previous_chassis_no ? String(raw.previous_chassis_no) : null,
    orderNo: raw.order_no ? String(raw.order_no) : undefined,
  };

  if (actorId) {
    void logUserAction(actorId, 'update', 'sales_order', result.salesOrderId, {
      component: 'SalesPipelineService',
      action: 'unlink_existing_vehicle',
      vehicleId: result.previousVehicleId,
      chassisNo: result.previousChassisNo,
    });
  }

  return { data: result, error: null };
}

export async function getLinkedSalesOrderForVehicle(
  companyId: string,
  vehicleId: string | null | undefined,
  chassisNo: string | null | undefined,
): Promise<{ data: SalesOrder | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  if (!vehicleId && !chassisNo) return { data: null, error: null };

  let query = supabase
    .from('sales_orders')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .limit(1);

  if (vehicleId) {
    query = query.eq('vehicle_id', vehicleId);
  } else if (chassisNo) {
    query = query.eq('chassis_no', chassisNo);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    loggingService.error('getLinkedSalesOrderForVehicle failed', { error, vehicleId, chassisNo }, 'SalesPipelineService');
    return { data: null, error: new Error(error.message) };
  }

  return { data: data ? mapOrder(data as Record<string, unknown>) : null, error: null };
}

/**
 * Creates an inventory-tracking vehicle row in Auto Aging from a confirmed Sales Order.
 * Sets bg_date = bookingDate, links the vehicle back to the sales order.
 */
export async function createVehicleFromSalesOrder(
  orderId: string,
  chassisNo: string,
  userId: string,
  companyId: string,
): Promise<{ vehicleId: string | null; error: Error | null }> {
  if (!companyId) return { vehicleId: null, error: missingCompanyError() };

  const { data: orderRow, error: orderErr } = await supabase
    .from('sales_orders')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', orderId)
    .single();
  if (orderErr || !orderRow) return { vehicleId: null, error: new Error(orderErr?.message ?? 'Order not found') };

  const order = mapOrder(orderRow as Record<string, unknown>);

  const { data: vehicleRow, error: vehicleErr } = await supabase
    .from('vehicles')
    .insert({
      company_id: companyId,
      chassis_no: chassisNo,
      model: order.model,
      variant: order.variant ?? null,
      colour: order.colour ?? null,
      branch_code: order.branchCode,
      salesman_name: order.salesmanName ?? null,
      customer_name: order.customerName ?? null,
      bg_date: order.bookingDate,
      is_deleted: false,
    } as never)
    .select('id')
    .single();
  if (vehicleErr || !vehicleRow) return { vehicleId: null, error: new Error(vehicleErr?.message ?? 'Vehicle insert failed') };

  const vehicleId = (vehicleRow as Record<string, unknown>).id as string;

  const { error: linkErr } = await supabase
    .from('sales_orders')
    .update({ vehicle_id: vehicleId, chassis_no: chassisNo, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', orderId);
  if (linkErr) return { vehicleId: null, error: new Error(linkErr.message) };

  await logVehicleEdit(userId, vehicleId, {
    source: { before: null, after: `Sales Order ${order.orderNo}` },
    remark: { before: null, after: `Inventory entry created from Sales Order ${order.orderNo}` },
  });
  if (userId) void logUserAction(userId, 'update', 'sales_order', orderId, { component: 'SalesPipelineService' });

  return { vehicleId, error: null };
}
