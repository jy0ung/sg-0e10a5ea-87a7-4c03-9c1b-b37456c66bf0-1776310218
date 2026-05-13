import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from './auditService';
import { loggingService } from './loggingService';

// -----------------------------------------------------------------------------
// Vehicle Transfers
// -----------------------------------------------------------------------------

export type TransferStatus = 'pending' | 'in_transit' | 'arrived' | 'cancelled';

export interface VehicleTransferRecord {
  id: string;
  runningNo: string;
  fromBranch: string;
  toBranch: string;
  chassisNo: string;
  model: string;
  colour?: string;
  status: TransferStatus;
  createdAt: string;
  arrivedAt?: string;
  remark?: string;
}

export interface CreateVehicleTransferInput {
  companyId: string;
  actorId?: string;
  runningNo: string;
  fromBranch: string;
  toBranch: string;
  chassisNo: string;
  model: string;
  colour?: string | null;
  remark?: string | null;
}

function rowToTransfer(row: Record<string, unknown>): VehicleTransferRecord {
  return {
    id: String(row.id ?? ''),
    runningNo: String(row.running_no ?? ''),
    fromBranch: String(row.from_branch ?? ''),
    toBranch: String(row.to_branch ?? ''),
    chassisNo: String(row.chassis_no ?? ''),
    model: String(row.model ?? ''),
    colour: row.colour ? String(row.colour) : undefined,
    status: (row.status as TransferStatus) ?? 'pending',
    createdAt: row.created_at ? String(row.created_at).split('T')[0] : '',
    arrivedAt: row.arrived_at ? String(row.arrived_at) : undefined,
    remark: row.remark ? String(row.remark) : undefined,
  };
}

export async function listVehicleTransfers(companyId: string): Promise<VehicleTransferRecord[]> {
  const { data, error } = await supabase
    .from('vehicle_transfers')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) {
    loggingService.error('listVehicleTransfers failed', { companyId, error }, 'InventoryService');
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => rowToTransfer(row as Record<string, unknown>));
}

export async function createVehicleTransfer(
  input: CreateVehicleTransferInput,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('vehicle_transfers').insert({
    company_id: input.companyId,
    running_no: input.runningNo,
    from_branch: input.fromBranch,
    to_branch: input.toBranch,
    chassis_no: input.chassisNo.toUpperCase(),
    model: input.model,
    colour: input.colour ?? null,
    status: 'pending',
    remark: input.remark ?? null,
  });
  if (error) {
    loggingService.error('createVehicleTransfer failed', { error }, 'InventoryService');
    return { error: new Error(error.message) };
  }
  if (input.actorId) void logUserAction(input.actorId, 'create', 'vehicle_transfer', undefined, { component: 'InventoryService' });
  return { error: null };
}

function missingCompanyError(): Error {
  return new Error('Company context is required for vehicle transfer mutations');
}

/**
 * Update transfer status. When status becomes `arrived` and a destination
 * branch is provided, the associated vehicle's branch is also updated.
 */
export async function updateVehicleTransferStatus(
  id: string,
  status: TransferStatus,
  options: {
    companyId?: string;
    actorId?: string;
    chassisNo?: string;
    toBranch?: string;
    previousArrivedAt?: string | null;
  } = {},
): Promise<{ error: Error | null }> {
  if (!options.companyId) return { error: missingCompanyError() };

  const arrivedAt =
    status === 'arrived'
      ? new Date().toISOString().split('T')[0]
      : (options.previousArrivedAt ?? null);

  const { error } = await supabase
    .from('vehicle_transfers')
    .update({ status, arrived_at: arrivedAt })
    .eq('company_id', options.companyId)
    .eq('id', id);
  if (error) {
    loggingService.error('updateVehicleTransferStatus failed', { id, error }, 'InventoryService');
    return { error: new Error(error.message) };
  }

  if (status === 'arrived' && options.chassisNo && options.toBranch) {
    const { error: vehicleError } = await supabase
      .from('vehicles')
      .update({ branch_code: options.toBranch })
      .eq('chassis_no', options.chassisNo)
      .eq('company_id', options.companyId)
      .eq('is_deleted', false);
    if (vehicleError) {
      loggingService.error(
        'Failed to update vehicle branch after transfer arrival',
        { id, chassis: options.chassisNo, error: vehicleError },
        'InventoryService',
      );
      return { error: new Error(vehicleError.message) };
    }
  }

  if (options.actorId) void logUserAction(options.actorId, 'update', 'vehicle_transfer', id, { component: 'InventoryService' });

  return { error: null };
}

// -----------------------------------------------------------------------------
// Chassis lookup + audit (ChassisMovement)
// -----------------------------------------------------------------------------

export interface VehicleLookupRow {
  id: string;
  chassisNo: string;
  model: string;
  branchCode: string;
  bgDate: string;
}

export interface AuditEventRecord {
  id: string;
  action: string;
  entityType: string;
  changes: Record<string, unknown>;
  createdAt: string;
  userName?: string;
}

export async function findVehicleByChassis(
  chassis: string,
  companyId: string,
): Promise<{ data: VehicleLookupRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, chassis_no, model, branch_code, bg_date')
    .ilike('chassis_no', chassis)
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle();

  if (error) {
    loggingService.error('findVehicleByChassis failed', { chassis, error }, 'InventoryService');
    return { data: null, error: new Error(error.message) };
  }
  if (!data) return { data: null, error: null };

  const row = data as Record<string, unknown>;
  return {
    data: {
      id: String(row.id ?? ''),
      chassisNo: String(row.chassis_no ?? ''),
      model: String(row.model ?? ''),
      branchCode: String(row.branch_code ?? ''),
      bgDate: String(row.bg_date ?? ''),
    },
    error: null,
  };
}

export async function fetchVehicleAuditPage(
  vehicleId: string,
  page: number,
  pageSize: number,
): Promise<{ events: AuditEventRecord[]; total: number; error: Error | null }> {
  const { data, error, count } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, changes, created_at, profiles(full_name, email)', { count: 'exact' })
    .eq('entity_id', vehicleId)
    .order('created_at', { ascending: true })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (error) {
    loggingService.error('fetchVehicleAuditPage failed', { vehicleId, error }, 'InventoryService');
    return { events: [], total: 0, error: new Error(error.message) };
  }

  const events: AuditEventRecord[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const profile = r.profiles as Record<string, unknown> | null;
    return {
      id: r.id as string,
      action: r.action as string,
      entityType: r.entity_type as string,
      changes: r.changes as Record<string, unknown>,
      createdAt: r.created_at as string,
      userName: (profile?.full_name ?? profile?.email ?? 'System') as string,
    };
  });

  return { events, total: count ?? 0, error: null };
}

// -----------------------------------------------------------------------------
// Chassis filter search (ChassisFilter)
// -----------------------------------------------------------------------------

export interface ChassisFilterParams {
  companyId: string;
  chassisNo?: string;
  plateNo?: string;
  model?: string;
  engineNo?: string;
  colour?: string;
  ownerName?: string;
  page: number;
  pageSize: number;
}

export interface ChassisFilterRow {
  id: string;
  chassis_no: string | null;
  plate_no: string | null;
  model: string | null;
  engine_no: string | null;
  colour: string | null;
  status: string | null;
  branch_id: string | null;
  owner_name: string | null;
}

export async function searchChassisFilter(
  params: ChassisFilterParams,
): Promise<{ rows: ChassisFilterRow[]; total: number; error: Error | null }> {
  let q = supabase
    .from('vehicles')
    .select('id,chassis_no,plate_no,model,engine_no,colour,status,branch_id,owner_name', { count: 'exact' })
    .eq('company_id', params.companyId);

  const ilike = (col: string, value?: string) => {
    const v = value?.trim();
    if (v) q = q.ilike(col, `%${v}%`);
  };
  ilike('chassis_no', params.chassisNo);
  ilike('plate_no', params.plateNo);
  ilike('model', params.model);
  ilike('engine_no', params.engineNo);
  ilike('colour', params.colour);
  ilike('owner_name', params.ownerName);

  const { data, count, error } = await q
    .order('chassis_no')
    .range(params.page * params.pageSize, (params.page + 1) * params.pageSize - 1);

  if (error) {
    loggingService.error('searchChassisFilter failed', { params, error }, 'InventoryService');
    return { rows: [], total: 0, error: new Error(error.message) };
  }

  return { rows: (data ?? []) as ChassisFilterRow[], total: count ?? 0, error: null };
}
