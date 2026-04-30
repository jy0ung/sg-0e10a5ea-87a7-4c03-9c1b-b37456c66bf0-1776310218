import { supabase } from '@/integrations/supabase/client';
import { SalesOrder, SalesOrderStatus } from '@/types';
import { loggingService } from './loggingService';
import { performanceService } from './performanceService';
import { logUserAction, logVehicleEdit } from './auditService';

type SalesOrderEditableFields = Omit<SalesOrder, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>;

function missingCompanyError(): Error {
  return new Error('Company context is required for sales order mutations');
}

function mapOrder(row: Record<string, unknown>): SalesOrder {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    orderNo: row.order_no as string,
    customerId: row.customer_id as string,
    customerName: row.customer_name as string | undefined,
    branchCode: row.branch_code as string,
    salesmanId: row.salesman_id as string | undefined,
    salesmanName: row.salesman_name as string | undefined,
    model: row.model as string,
    variant: row.variant as string | undefined,
    colour: row.colour as string | undefined,
    bookingDate: row.booking_date as string,
    deliveryDate: row.delivery_date as string | undefined,
    bookingAmount: row.booking_amount as number | undefined,
    totalPrice: row.total_price as number | undefined,
    status: row.status as SalesOrderStatus,
    dealStageId: row.deal_stage_id as string | undefined,
    chassisNo: row.chassis_no as string | undefined,
    vehicleId: row.vehicle_id as string | undefined,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    // VSO / financing fields
    vsoNo: row.vso_no as string | undefined,
    depositAmount: row.deposit_amount as number | undefined,
    bankLoanAmount: row.bank_loan_amount as number | undefined,
    outstandingAmount: row.outstanding_amount as number | undefined,
    financeCompany: row.finance_company as string | undefined,
    insuranceCompany: row.insurance_company as string | undefined,
    plateNo: row.plate_no as string | undefined,
  };
}

export async function getSalesOrders(companyId: string, branchCode?: string | null): Promise<{ data: SalesOrder[]; error: Error | null }> {
  const timerId = performanceService.startQueryTimer('getSalesOrders');
  let q = supabase
    .from('sales_orders')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_deleted', false);
  if (branchCode) q = q.eq('branch_code', branchCode);
  const { data, error } = await q.order('booking_date', { ascending: false });
  performanceService.endQueryTimer(timerId);
  if (error) { loggingService.error('getSalesOrders failed', { error }); return { data: [], error: new Error(error.message) }; }
  return { data: (data ?? []).map(r => mapOrder(r as Record<string, unknown>)), error: null };
}

export async function createSalesOrder(companyId: string, fields: SalesOrderEditableFields, actorId?: string): Promise<{ data: SalesOrder | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const { data, error } = await supabase
    .from('sales_orders')
    .insert({
      company_id: companyId,
      order_no: fields.orderNo,
      customer_id: fields.customerId,
      customer_name: fields.customerName,
      branch_code: fields.branchCode,
      salesman_id: fields.salesmanId,
      salesman_name: fields.salesmanName,
      model: fields.model,
      variant: fields.variant,
      colour: fields.colour,
      booking_date: fields.bookingDate,
      delivery_date: fields.deliveryDate,
      booking_amount: fields.bookingAmount,
      total_price: fields.totalPrice,
      status: fields.status,
      deal_stage_id: fields.dealStageId,
      chassis_no: fields.chassisNo,
      vehicle_id: fields.vehicleId,
      notes: fields.notes,
      vso_no: fields.vsoNo,
      deposit_amount: fields.depositAmount,
      bank_loan_amount: fields.bankLoanAmount,
      outstanding_amount: fields.outstandingAmount,
      finance_company: fields.financeCompany,
      insurance_company: fields.insuranceCompany,
      plate_no: fields.plateNo,
    })
    .select()
    .single();
  if (error) { loggingService.error('createSalesOrder failed', { error }); return { data: null, error: new Error(error.message) }; }
  if (actorId) void logUserAction(actorId, 'create', 'sales_order', String(data.id), { component: 'SalesOrderService' });
  return { data: mapOrder(data as Record<string, unknown>), error: null };
}

export async function updateSalesOrder(companyId: string, id: string, fields: Partial<SalesOrderEditableFields>, actorId?: string): Promise<{ data: SalesOrder | null; error: Error | null }> {
  if (!companyId) return { data: null, error: missingCompanyError() };
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.orderNo !== undefined) updates.order_no = fields.orderNo;
  if (fields.customerId !== undefined) updates.customer_id = fields.customerId;
  if (fields.customerName !== undefined) updates.customer_name = fields.customerName;
  if (fields.branchCode !== undefined) updates.branch_code = fields.branchCode;
  if (fields.salesmanId !== undefined) updates.salesman_id = fields.salesmanId;
  if (fields.salesmanName !== undefined) updates.salesman_name = fields.salesmanName;
  if (fields.model !== undefined) updates.model = fields.model;
  if (fields.variant !== undefined) updates.variant = fields.variant;
  if (fields.colour !== undefined) updates.colour = fields.colour;
  if (fields.bookingDate !== undefined) updates.booking_date = fields.bookingDate;
  if (fields.deliveryDate !== undefined) updates.delivery_date = fields.deliveryDate;
  if (fields.bookingAmount !== undefined) updates.booking_amount = fields.bookingAmount;
  if (fields.totalPrice !== undefined) updates.total_price = fields.totalPrice;
  if (fields.status !== undefined) updates.status = fields.status;
  if (fields.dealStageId !== undefined) updates.deal_stage_id = fields.dealStageId;
  if (fields.chassisNo !== undefined) updates.chassis_no = fields.chassisNo;
  if (fields.vehicleId !== undefined) updates.vehicle_id = fields.vehicleId;
  if (fields.notes !== undefined) updates.notes = fields.notes;
  if (fields.vsoNo !== undefined) updates.vso_no = fields.vsoNo;
  if (fields.depositAmount !== undefined) updates.deposit_amount = fields.depositAmount;
  if (fields.bankLoanAmount !== undefined) updates.bank_loan_amount = fields.bankLoanAmount;
  if (fields.outstandingAmount !== undefined) updates.outstanding_amount = fields.outstandingAmount;
  if (fields.financeCompany !== undefined) updates.finance_company = fields.financeCompany;
  if (fields.insuranceCompany !== undefined) updates.insurance_company = fields.insuranceCompany;
  if (fields.plateNo !== undefined) updates.plate_no = fields.plateNo;

  const { data, error } = await supabase
    .from('sales_orders')
    .update(updates)
    .eq('company_id', companyId)
    .eq('id', id)
    .select()
    .single();
  if (error) { loggingService.error('updateSalesOrder failed', { error }); return { data: null, error: new Error(error.message) }; }
  if (actorId) void logUserAction(actorId, 'update', 'sales_order', id, { component: 'SalesOrderService', itemCount: Object.keys(updates).length });
  return { data: mapOrder(data as Record<string, unknown>), error: null };
}

export async function moveSalesOrderStage(companyId: string, id: string, dealStageId: string, actorId?: string): Promise<{ error: Error | null }> {
  if (!companyId) return { error: missingCompanyError() };
  const { error } = await supabase
    .from('sales_orders')
    .update({ deal_stage_id: dealStageId, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) return { error: new Error(error.message) };
  if (actorId) void logUserAction(actorId, 'update', 'sales_order', id, { component: 'SalesOrderService' });
  return { error: null };
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

  // 1. Fetch the order
  const { data: orderRow, error: orderErr } = await supabase
    .from('sales_orders')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', orderId)
    .single();
  if (orderErr || !orderRow) return { vehicleId: null, error: new Error(orderErr?.message ?? 'Order not found') };

  const order = mapOrder(orderRow as Record<string, unknown>);

  // 2. Insert vehicle
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
    })
    .select('id')
    .single();
  if (vehicleErr || !vehicleRow) return { vehicleId: null, error: new Error(vehicleErr?.message ?? 'Vehicle insert failed') };

  const vehicleId = (vehicleRow as Record<string, unknown>).id as string;

  // 3. Link vehicle back to order + chassis_no
  const { error: linkErr } = await supabase
    .from('sales_orders')
    .update({ vehicle_id: vehicleId, chassis_no: chassisNo, status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', orderId);
  if (linkErr) return { vehicleId: null, error: new Error(linkErr.message) };

  // 4. Audit log
  await logVehicleEdit(userId, vehicleId, {
    source: { before: null, after: `Sales Order ${order.orderNo}` },
    remark: { before: null, after: `Inventory entry created from Sales Order ${order.orderNo}` },
  });
  if (userId) void logUserAction(userId, 'update', 'sales_order', orderId, { component: 'SalesOrderService' });

  return { vehicleId, error: null };
}

export async function deleteSalesOrder(companyId: string, id: string, actorId?: string): Promise<{ error: Error | null }> {
  if (!companyId) return { error: missingCompanyError() };
  const { error } = await supabase
    .from('sales_orders')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) return { error: new Error(error.message) };
  if (actorId) void logUserAction(actorId, 'delete', 'sales_order', id, { component: 'SalesOrderService' });
  return { error: null };
}
