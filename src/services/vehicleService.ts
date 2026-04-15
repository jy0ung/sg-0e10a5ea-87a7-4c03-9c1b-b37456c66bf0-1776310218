import { supabase } from "@/integrations/supabase/client";
import type { VehicleCanonical } from "@/types";
import { logVehicleEdit } from "./auditService";
import { performanceService } from "./performanceService";
import { loggingService } from "./loggingService";

export async function getVehicleById(id: string): Promise<{
  data: VehicleCanonical | null;
  error: Error | null;
}> {
  const queryId = `vehicle-get-${id}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .single();

  performanceService.endQueryTimer(queryId, "get_vehicle_by_id");

  if (error) {
    loggingService.error("Failed to get vehicle", { id, error }, "VehicleService");
  }

  return { data, error: error || null };
}

export async function getVehicleByChassis(chassisNo: string): Promise<{
  data: VehicleCanonical | null;
  error: Error | null;
}> {
  const queryId = `vehicle-chassis-${chassisNo}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("chassis_no", chassisNo)
    .maybeSingle();

  performanceService.endQueryTimer(queryId, "get_vehicle_by_chassis");

  if (error) {
    loggingService.error("Failed to get vehicle by chassis", { chassisNo, error }, "VehicleService");
  }

  return { data, error: error || null };
}

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
    .from("vehicles")
    .select("*", { count: "exact" });

  if (filters?.branchCode) {
    query = query.eq("branch_code", filters.branchCode);
  }

  if (filters?.model) {
    query = query.eq("model", filters.model);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
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