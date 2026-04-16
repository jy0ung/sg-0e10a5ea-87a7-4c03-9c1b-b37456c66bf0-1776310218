import { supabase } from '@/integrations/supabase/client';
import { BranchRecord, FinanceCompany, InsuranceCompany, VehicleModel, VehicleColour } from '@/types';

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
