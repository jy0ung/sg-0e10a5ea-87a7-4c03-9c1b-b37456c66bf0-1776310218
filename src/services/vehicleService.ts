import { supabase } from '@/integrations/supabase/client';
import type { VehicleCanonical } from '@/types';
import { logVehicleEdit } from './auditService';
import { performanceService } from './performanceService';
import { loggingService } from './loggingService';

/**
 * Get a single vehicle by ID
 */
export async function getVehicleById(id: string): Promise<{
  data: VehicleCanonical | null;
  error: Error | null;
}> {
  const queryId = `vehicle-get-${id}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', id)
    .single();

  performanceService.endQueryTimer(queryId, "get_vehicle_by_id");

  if (error) {
    loggingService.error("Failed to get vehicle", { id, error }, "VehicleService");
  }

  return { data, error: error || null };
}

/**
 * Get a vehicle by chassis number
 */
export async function getVehicleByChassis(chassisNo: string): Promise<{
  data: VehicleCanonical | null;
  error: Error | null;
}> {
  const queryId = `vehicle-chassis-${chassisNo}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('chassis_no', chassisNo)
    .maybeSingle();

  performanceService.endQueryTimer(queryId, "get_vehicle_by_chassis");

  if (error) {
    loggingService.error("Failed to get vehicle by chassis", { chassisNo, error }, "VehicleService");
  }

  return { data, error: error || null };
}

/**
 * Update a vehicle with audit logging
 */
export async function updateVehicleWithAudit(
  vehicleId: string,
  updates: Partial<VehicleCanonical>,
  userId: string
): Promise<{ data: VehicleCanonical | null; error: Error | null }> {
  // 1. Fetch current values
  const { data: current, error: fetchError } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .single();

  if (fetchError) {
    console.error('Error fetching current vehicle:', fetchError);
    return { data: null, error: fetchError };
  }

  // 2. Prepare changes object for audit
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  Object.keys(updates).forEach(key => {
    const currentVal = current[key as keyof VehicleCanonical];
    const newVal = updates[key as keyof VehicleCanonical];
    if (currentVal !== newVal) {
      changes[key] = { before: currentVal, after: newVal };
    }
  });

  // 3. Update vehicle
  const { data, error } = await supabase
    .from('vehicles')
    .update(updates)
    .eq('id', vehicleId)
    .select()
    .single();

  if (error) {
    console.error('Error updating vehicle:', error);
    return { data: null, error: error };
  }

  // 4. Log audit if changes exist
  if (Object.keys(changes).length > 0) {
    await logVehicleEdit(userId, vehicleId, changes);
  }

  return { data, error: error || null };
}

/**
 * Batch update vehicles with audit logging
 */
export async function batchUpdateVehicles(
  updates: Array<{ vehicleId: string; changes: Partial<VehicleCanonical> }>,
  userId: string
): Promise<{ success: number; failed: number; errors: Array<{ vehicleId: string; error: Error }> }> {
  let success = 0;
  let failed = 0;
  const errors: Array<{ vehicleId: string; error: Error }> = [];

  for (const update of updates) {
    const result = await updateVehicleWithAudit(update.vehicleId, update.changes, userId);
    if (result.error) {
      failed++;
      errors.push({ vehicleId: update.vehicleId, error: result.error });
    } else {
      success++;
    }
  }

  return { success, failed, errors };
}

/**
 * Delete a vehicle with audit logging
 */
export async function deleteVehicleWithAudit(
  vehicleId: string,
  userId: string
): Promise<{ error: Error | null }> {
  // Log the deletion before it happens
  const { data: vehicle } = await getVehicleById(vehicleId);
  if (vehicle) {
    await logVehicleEdit(userId, vehicleId, {
      _delete: { before: vehicle, after: null },
    });
  }

  const { error } = await supabase
    .from('vehicles')
    .delete()
    .eq('id', vehicleId);

  return { error: error || null };
}

/**
 * Get vehicles with filters
 */
export async function getVehicles(filters?: {
  branchCode?: string;
  model?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ 
  data: VehicleCanonical[] | null; 
  error: Error | null; 
  count?: number 
}> {
  const queryId = `vehicles-list-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  let query = supabase
    .from('vehicles')
    .select('*', { count: 'exact' });

  if (filters?.branchCode) {
    query = query.eq('branch_code', filters.branchCode);
  }

  if (filters?.model) {
    query = query.eq('model', filters.model);
  }

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
  }

  const { data, error, count } = await query;

  performanceService.endQueryTimer(queryId, "get_vehicles_filtered");

  if (error) {
    loggingService.error("Failed to get vehicles", { filters, error }, "VehicleService");
  }

  return { data, error: error || null, count };
}