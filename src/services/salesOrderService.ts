import { supabase } from '@/integrations/supabase/client';
import { SalesOrder, SalesOrderStatus } from '@/types';
import { loggingService } from './loggingService';
import { performanceService } from './performanceService';
import { logVehicleEdit } from './auditService';

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

export async function getSalesOrders(companyId: string): Promise<{ data: SalesOrder[]; error: Error | null }> {
  const timerId = performanceService.startQueryTimer('getSalesOrders');
  const { data, error } = await supabase
    .from('sales_orders')
    .select('*')
    .eq('company_id', companyId)
    .order('booking_date', { ascending: false });
  performanceService.endQueryTimer(timerId);
  if (error) { loggingService.error('getSalesOrders failed', { error }); return { data: [], error: new Error(error.message) }; }
  return { data: (data ?? []).map(r => mapOrder(r as Record<string, unknown>)), error: null };
}

export async function createSalesOrder(companyId: string, fields: Omit<SalesOrder, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>): Promise<{ data: SalesOrder | null; error: Error | null }> {
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
  return { data: mapOrder(data as Record<string, unknown>), error: null };
}

export async function updateSalesOrder(id: string, fields: Partial<Omit<SalesOrder, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>): Promise<{ data: SalesOrder | null; error: Error | null }> {
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

  const { data, error } = await supabase.from('sales_orders').update(updates).eq('id', id).select().single();
  if (error) { loggingService.error('updateSalesOrder failed', { error }); return { data: null, error: new Error(error.message) }; }
  return { data: mapOrder(data as Record<string, unknown>), error: null };
}

export async function moveSalesOrderStage(id: string, dealStageId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('sales_orders')
    .update({ deal_stage_id: dealStageId, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Creates a vehicle (BG entry) in Auto Aging from a confirmed Sales Order.
 * Sets bg_date = bookingDate, links the vehicle back to the sales order.
 */
export async function createVehicleFromSalesOrder(
  orderId: string,
  chassisNo: string,
  userId: string,
  companyId: string,
): Promise<{ vehicleId: string | null; error: Error | null }> {
  // 1. Fetch the order
  const { data: orderRow, error: orderErr } = await supabase
    .from('sales_orders')
    .select('*')
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
  await supabase
    .from('sales_orders')
    .update({ vehicle_id: vehicleId, chassis_no: chassisNo, status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', orderId);

  // 4. Audit log
  await logVehicleEdit(vehicleId, userId, { source: null, remark: null }, {
    source: `Sales Order ${order.orderNo}`,
    remark: `BG entry created from Sales Order ${order.orderNo}`,
  });

  return { vehicleId, error: null };
}

export async function deleteSalesOrder(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('sales_orders').delete().eq('id', id);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
