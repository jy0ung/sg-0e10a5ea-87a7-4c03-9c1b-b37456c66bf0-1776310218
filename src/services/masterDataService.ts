import { supabase } from '@/integrations/supabase/client';
import {
  BranchRecord, FinanceCompany, InsuranceCompany, VehicleModel, VehicleColour,
  TinType, RegistrationFee, RoadTaxFee, InspectionFee, HandlingFee, AdditionalItem,
  PaymentType, BankRecord, Supplier, Dealer, UserGroup, DealerInvoice, OfficialReceipt,
} from '@/types';

// ===== Branches =====

function mapBranch(r: Record<string, unknown>): BranchRecord {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    orSeries: r.or_series as string | undefined,
    vdoSeries: r.vdo_series as string | undefined,
    companyId: r.company_id as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function getBranches(companyId: string): Promise<{ data: BranchRecord[]; error: Error | null }> {
  const { data, error } = await supabase.from('branches').select('*').eq('company_id', companyId).order('code');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => mapBranch(r as Record<string, unknown>)), error: null };
}

export async function upsertBranch(companyId: string, fields: Omit<BranchRecord, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<{ error: Error | null }> {
  const row = {
    company_id: companyId,
    code: fields.code,
    name: fields.name,
    or_series: fields.orSeries ?? null,
    vdo_series: fields.vdoSeries ?? null,
    updated_at: new Date().toISOString(),
  };
  const q = fields.id
    ? supabase.from('branches').update(row).eq('id', fields.id)
    : supabase.from('branches').insert({ ...row, id: crypto.randomUUID() });
  const { error } = await q;
  return { error: error ? new Error(error.message) : null };
}

export async function deleteBranch(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('branches').delete().eq('id', id);
  return { error: error ? new Error(error.message) : null };
}

// ===== Finance Companies =====

function mapFC(r: Record<string, unknown>): FinanceCompany {
  return { id: r.id as string, code: r.code as string, name: r.name as string, companyId: r.company_id as string, createdAt: r.created_at as string };
}

export async function getFinanceCompanies(companyId: string): Promise<{ data: FinanceCompany[]; error: Error | null }> {
  const { data, error } = await supabase.from('finance_companies').select('*').eq('company_id', companyId).order('code');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => mapFC(r as Record<string, unknown>)), error: null };
}

export async function upsertFinanceCompany(companyId: string, fields: { id?: string; code: string; name: string }): Promise<{ error: Error | null }> {
  const row = { company_id: companyId, code: fields.code, name: fields.name };
  const { error } = fields.id
    ? await supabase.from('finance_companies').update(row).eq('id', fields.id)
    : await supabase.from('finance_companies').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
}

export async function deleteFinanceCompany(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('finance_companies').delete().eq('id', id);
  return { error: error ? new Error(error.message) : null };
}

// ===== Insurance Companies =====

function mapIC(r: Record<string, unknown>): InsuranceCompany {
  return { id: r.id as string, code: r.code as string, name: r.name as string, companyId: r.company_id as string, createdAt: r.created_at as string };
}

export async function getInsuranceCompanies(companyId: string): Promise<{ data: InsuranceCompany[]; error: Error | null }> {
  const { data, error } = await supabase.from('insurance_companies').select('*').eq('company_id', companyId).order('code');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => mapIC(r as Record<string, unknown>)), error: null };
}

export async function upsertInsuranceCompany(companyId: string, fields: { id?: string; code: string; name: string }): Promise<{ error: Error | null }> {
  const row = { company_id: companyId, code: fields.code, name: fields.name };
  const { error } = fields.id
    ? await supabase.from('insurance_companies').update(row).eq('id', fields.id)
    : await supabase.from('insurance_companies').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
}

export async function deleteInsuranceCompany(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('insurance_companies').delete().eq('id', id);
  return { error: error ? new Error(error.message) : null };
}

// ===== Vehicle Models =====

function mapModel(r: Record<string, unknown>): VehicleModel {
  return { id: r.id as string, code: r.code as string, name: r.name as string, basePrice: r.base_price as number | undefined, companyId: r.company_id as string, createdAt: r.created_at as string };
}

export async function getVehicleModels(companyId: string): Promise<{ data: VehicleModel[]; error: Error | null }> {
  const { data, error } = await supabase.from('vehicle_models').select('*').eq('company_id', companyId).order('code');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => mapModel(r as Record<string, unknown>)), error: null };
}

export async function upsertVehicleModel(companyId: string, fields: { id?: string; code: string; name: string; basePrice?: number }): Promise<{ error: Error | null }> {
  const row = { company_id: companyId, code: fields.code, name: fields.name, base_price: fields.basePrice ?? null };
  const { error } = fields.id
    ? await supabase.from('vehicle_models').update(row).eq('id', fields.id)
    : await supabase.from('vehicle_models').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
}

export async function deleteVehicleModel(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('vehicle_models').delete().eq('id', id);
  return { error: error ? new Error(error.message) : null };
}

// ===== Vehicle Colours =====

function mapColour(r: Record<string, unknown>): VehicleColour {
  return { id: r.id as string, code: r.code as string, name: r.name as string, hex: r.hex as string | undefined, companyId: r.company_id as string, createdAt: r.created_at as string };
}

export async function getVehicleColours(companyId: string): Promise<{ data: VehicleColour[]; error: Error | null }> {
  const { data, error } = await supabase.from('vehicle_colours').select('*').eq('company_id', companyId).order('code');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => mapColour(r as Record<string, unknown>)), error: null };
}

export async function upsertVehicleColour(companyId: string, fields: { id?: string; code: string; name: string; hex?: string }): Promise<{ error: Error | null }> {
  const row = { company_id: companyId, code: fields.code, name: fields.name, hex: fields.hex ?? null };
  const { error } = fields.id
    ? await supabase.from('vehicle_colours').update(row).eq('id', fields.id)
    : await supabase.from('vehicle_colours').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
}

export async function deleteVehicleColour(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('vehicle_colours').delete().eq('id', id);
  return { error: error ? new Error(error.message) : null };
}

// ===== Generic helpers =====
type SimpleStatus = { id: string; status: string; [k: string]: unknown };

function mkSimple<T>(tbl: string, map: (r: Record<string,unknown>) => T) {
  return {
    getAll: async (cid: string): Promise<{ data: T[]; error: Error|null }> => {
      const { data, error } = await supabase.from(tbl).select('*').eq('company_id', cid).order('created_at');
      if (error) return { data: [], error: new Error(error.message) };
      return { data: (data ?? []).map(r => map(r as Record<string,unknown>)), error: null };
    },
    upsert: async (cid: string, fields: Partial<T> & { id?: string }): Promise<{ error: Error|null }> => {
      const { id, ...rest } = fields as Record<string,unknown> & { id?: string };
      const row: Record<string,unknown> = { company_id: cid, ...Object.fromEntries(Object.entries(rest).map(([k,v]) => [k.replace(/([A-Z])/g,'_$1').toLowerCase(), v])), updated_at: new Date().toISOString() };
      const { error } = id ? await (supabase.from(tbl) as ReturnType<typeof supabase.from>).update(row).eq('id', id) : await (supabase.from(tbl) as ReturnType<typeof supabase.from>).insert({ ...row, id: crypto.randomUUID() });
      return { error: error ? new Error(error.message) : null };
    },
    del: async (id: string): Promise<{ error: Error|null }> => {
      const { error } = await supabase.from(tbl).delete().eq('id', id);
      return { error: error ? new Error(error.message) : null };
    },
  };
}

// ===== TIN Types =====
const _tt = mkSimple<TinType>('tin_types', r => ({ id: r.id as string, code: r.code as string, name: r.name as string, status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string }));
export const getTinTypes = (cid: string) => _tt.getAll(cid);
export const upsertTinType = (cid: string, f: Partial<TinType> & { id?: string }) =>
  f.id ? supabase.from('tin_types').update({ code: f.code, name: f.name, status: f.status, updated_at: new Date().toISOString() }).eq('id', f.id).then(({ error }) => ({ error: error ? new Error(error.message) : null }))
       : supabase.from('tin_types').insert({ id: crypto.randomUUID(), company_id: cid, code: f.code, name: f.name, status: f.status ?? 'Active' }).then(({ error }) => ({ error: error ? new Error(error.message) : null }));
export const deleteTinType = (id: string) => _tt.del(id);

// ===== Registration Fees =====
export const getRegistrationFees = async (cid: string): Promise<{ data: RegistrationFee[]; error: Error|null }> => {
  const { data, error } = await supabase.from('registration_fees').select('*').eq('company_id', cid).order('created_at');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, description: r.description as string, price: Number(r.price), status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertRegistrationFee = async (cid: string, f: Partial<RegistrationFee> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, description: f.description, price: f.price ?? 0, status: f.status ?? 'Active', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('registration_fees').update(row).eq('id', f.id) : await supabase.from('registration_fees').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deleteRegistrationFee = async (id: string) => { const { error } = await supabase.from('registration_fees').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };

// ===== Road Tax Fees =====
export const getRoadTaxFees = async (cid: string): Promise<{ data: RoadTaxFee[]; error: Error|null }> => {
  const { data, error } = await supabase.from('road_tax_fees').select('*').eq('company_id', cid).order('created_at');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, description: r.description as string, price: Number(r.price), status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertRoadTaxFee = async (cid: string, f: Partial<RoadTaxFee> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, description: f.description, price: f.price ?? 0, status: f.status ?? 'Active', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('road_tax_fees').update(row).eq('id', f.id) : await supabase.from('road_tax_fees').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deleteRoadTaxFee = async (id: string) => { const { error } = await supabase.from('road_tax_fees').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };

// ===== Inspection Fees =====
export const getInspectionFees = async (cid: string): Promise<{ data: InspectionFee[]; error: Error|null }> => {
  const { data, error } = await supabase.from('inspection_fees').select('*').eq('company_id', cid).order('created_at');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, itemCode: r.item_code as string|undefined, description: r.description as string, price: Number(r.price), status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertInspectionFee = async (cid: string, f: Partial<InspectionFee> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, item_code: f.itemCode ?? null, description: f.description, price: f.price ?? 0, status: f.status ?? 'Active', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('inspection_fees').update(row).eq('id', f.id) : await supabase.from('inspection_fees').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deleteInspectionFee = async (id: string) => { const { error } = await supabase.from('inspection_fees').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };

// ===== Handling Fees =====
export const getHandlingFees = async (cid: string): Promise<{ data: HandlingFee[]; error: Error|null }> => {
  const { data, error } = await supabase.from('handling_fees').select('*').eq('company_id', cid).order('created_at');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, itemCode: r.item_code as string|undefined, description: r.description as string, price: Number(r.price), billing: r.billing as string|undefined, status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertHandlingFee = async (cid: string, f: Partial<HandlingFee> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, item_code: f.itemCode ?? null, description: f.description, price: f.price ?? 0, billing: f.billing ?? null, status: f.status ?? 'Active', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('handling_fees').update(row).eq('id', f.id) : await supabase.from('handling_fees').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deleteHandlingFee = async (id: string) => { const { error } = await supabase.from('handling_fees').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };

// ===== Additional Items =====
export const getAdditionalItems = async (cid: string): Promise<{ data: AdditionalItem[]; error: Error|null }> => {
  const { data, error } = await supabase.from('additional_items').select('*').eq('company_id', cid).order('created_at');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, itemCode: r.item_code as string|undefined, description: r.description as string, unitPrice: Number(r.unit_price), status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertAdditionalItem = async (cid: string, f: Partial<AdditionalItem> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, item_code: f.itemCode ?? null, description: f.description, unit_price: f.unitPrice ?? 0, status: f.status ?? 'Active', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('additional_items').update(row).eq('id', f.id) : await supabase.from('additional_items').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deleteAdditionalItem = async (id: string) => { const { error } = await supabase.from('additional_items').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };

// ===== Payment Types =====
export const getPaymentTypes = async (cid: string): Promise<{ data: PaymentType[]; error: Error|null }> => {
  const { data, error } = await supabase.from('payment_types').select('*').eq('company_id', cid).order('name');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, name: r.name as string, billing: r.billing as string|undefined, status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertPaymentType = async (cid: string, f: Partial<PaymentType> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, name: f.name, billing: f.billing ?? null, status: f.status ?? 'Active', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('payment_types').update(row).eq('id', f.id) : await supabase.from('payment_types').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deletePaymentType = async (id: string) => { const { error } = await supabase.from('payment_types').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };

// ===== Banks =====
export const getBanks = async (cid: string): Promise<{ data: BankRecord[]; error: Error|null }> => {
  const { data, error } = await supabase.from('banks').select('*').eq('company_id', cid).order('name');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, name: r.name as string, accountNo: r.account_no as string|undefined, status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertBank = async (cid: string, f: Partial<BankRecord> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, name: f.name, account_no: f.accountNo ?? null, status: f.status ?? 'Active', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('banks').update(row).eq('id', f.id) : await supabase.from('banks').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deleteBank = async (id: string) => { const { error } = await supabase.from('banks').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };

// ===== Suppliers =====
export const getSuppliers = async (cid: string): Promise<{ data: Supplier[]; error: Error|null }> => {
  const { data, error } = await supabase.from('suppliers').select('*').eq('company_id', cid).order('name');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, name: r.name as string, code: r.code as string|undefined, companyRegNo: r.company_reg_no as string|undefined, companyAddress: r.company_address as string|undefined, mailingAddress: r.mailing_address as string|undefined, attn: r.attn as string|undefined, contactNo: r.contact_no as string|undefined, email: r.email as string|undefined, status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertSupplier = async (cid: string, f: Partial<Supplier> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, name: f.name, code: f.code ?? null, company_reg_no: f.companyRegNo ?? null, company_address: f.companyAddress ?? null, mailing_address: f.mailingAddress ?? null, attn: f.attn ?? null, contact_no: f.contactNo ?? null, email: f.email ?? null, status: f.status ?? 'Active', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('suppliers').update(row).eq('id', f.id) : await supabase.from('suppliers').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deleteSupplier = async (id: string) => { const { error } = await supabase.from('suppliers').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };

// ===== Dealers =====
export const getDealers = async (cid: string): Promise<{ data: Dealer[]; error: Error|null }> => {
  const { data, error } = await supabase.from('dealers').select('*').eq('company_id', cid).order('name');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, name: r.name as string, accCode: r.acc_code as string|undefined, companyRegNo: r.company_reg_no as string|undefined, companyAddress: r.company_address as string|undefined, mailingAddress: r.mailing_address as string|undefined, attn: r.attn as string|undefined, contactNo: r.contact_no as string|undefined, email: r.email as string|undefined, status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertDealer = async (cid: string, f: Partial<Dealer> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, name: f.name, acc_code: f.accCode ?? null, company_reg_no: f.companyRegNo ?? null, company_address: f.companyAddress ?? null, mailing_address: f.mailingAddress ?? null, attn: f.attn ?? null, contact_no: f.contactNo ?? null, email: f.email ?? null, status: f.status ?? 'Active', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('dealers').update(row).eq('id', f.id) : await supabase.from('dealers').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deleteDealer = async (id: string) => { const { error } = await supabase.from('dealers').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };

// ===== User Groups =====
export const getUserGroups = async (cid: string): Promise<{ data: UserGroup[]; error: Error|null }> => {
  const { data, error } = await supabase.from('user_groups').select('*').eq('company_id', cid).order('name');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, name: r.name as string, status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertUserGroup = async (cid: string, f: Partial<UserGroup> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, name: f.name, status: f.status ?? 'Active', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('user_groups').update(row).eq('id', f.id) : await supabase.from('user_groups').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deleteUserGroup = async (id: string) => { const { error } = await supabase.from('user_groups').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };

// ===== Dealer Invoices =====
export const getDealerInvoices = async (cid: string): Promise<{ data: DealerInvoice[]; error: Error|null }> => {
  const { data, error } = await supabase.from('dealer_invoices').select('*').eq('company_id', cid).order('invoice_date', { ascending: false });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, invoiceNo: r.invoice_no as string, branch: r.branch as string|undefined, dealerName: r.dealer_name as string|undefined, carModel: r.car_model as string|undefined, carColour: r.car_colour as string|undefined, chassisNo: r.chassis_no as string|undefined, salesPrice: r.sales_price ? Number(r.sales_price) : undefined, invoiceDate: r.invoice_date as string|undefined, status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertDealerInvoice = async (cid: string, f: Partial<DealerInvoice> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, invoice_no: f.invoiceNo, branch: f.branch ?? null, dealer_name: f.dealerName ?? null, car_model: f.carModel ?? null, car_colour: f.carColour ?? null, chassis_no: f.chassisNo ?? null, sales_price: f.salesPrice ?? null, invoice_date: f.invoiceDate ?? null, status: f.status ?? 'Active', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('dealer_invoices').update(row).eq('id', f.id) : await supabase.from('dealer_invoices').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deleteDealerInvoice = async (id: string) => { const { error } = await supabase.from('dealer_invoices').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };

// ===== Official Receipts =====
export const getOfficialReceipts = async (cid: string): Promise<{ data: OfficialReceipt[]; error: Error|null }> => {
  const { data, error } = await supabase.from('official_receipts').select('*').eq('company_id', cid).order('receipt_date', { ascending: false });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []).map(r => ({ id: r.id as string, receiptDate: r.receipt_date as string|undefined, branch: r.branch as string|undefined, receiptNo: r.receipt_no as string, amount: r.amount ? Number(r.amount) : undefined, attachmentUrl: r.attachment_url as string|undefined, verifiedBy: r.verified_by as string|undefined, status: r.status as string, companyId: r.company_id as string, createdAt: r.created_at as string })), error: null };
};
export const upsertOfficialReceipt = async (cid: string, f: Partial<OfficialReceipt> & { id?: string }): Promise<{ error: Error|null }> => {
  const row = { company_id: cid, receipt_no: f.receiptNo, receipt_date: f.receiptDate ?? null, branch: f.branch ?? null, amount: f.amount ?? null, attachment_url: f.attachmentUrl ?? null, verified_by: f.verifiedBy ?? null, status: f.status ?? 'Pending', updated_at: new Date().toISOString() };
  const { error } = f.id ? await supabase.from('official_receipts').update(row).eq('id', f.id) : await supabase.from('official_receipts').insert({ ...row, id: crypto.randomUUID() });
  return { error: error ? new Error(error.message) : null };
};
export const deleteOfficialReceipt = async (id: string) => { const { error } = await supabase.from('official_receipts').delete().eq('id', id); return { error: error ? new Error(error.message) : null }; };
