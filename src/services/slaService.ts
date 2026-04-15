<![CDATA[
import { supabase } from "@/integrations/supabase/client";
import { loggingService } from "./loggingService";
import { performanceService } from "./performanceService";
import { logVehicleEdit } from "./auditService";

export interface SlaPolicy {
  id: string;
  kpiId: string;
  label: string;
  slaDays: number;
  companyId: string;
}

/**
 * Update an SLA policy with audit logging
 */
export async function updateSlaPolicy(
  id: string,
  updates: Partial<SlaPolicy>,
  userId: string
): Promise<{ data: SlaPolicy | null; error: Error | null }> {
  const queryId = `sla-update-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  try {
    // Fetch current values
    const { data: current, error: fetchError } = await supabase
      .from("sla_policies")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      loggingService.error("Failed to fetch current SLA", { id, error: fetchError }, "SlaService");
      return { data: null, error: fetchError };
    }

    // Update SLA
    const { data, error } = await supabase
      .from("sla_policies")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    performanceService.endQueryTimer(queryId, "update_sla_policy");

    if (error) {
      loggingService.error("Failed to update SLA", { id, error }, "SlaService");
      return { data: null, error };
    }

    // Log audit if changes exist
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    Object.keys(updates).forEach((key) => {
      const currentVal = current[key as keyof SlaPolicy];
      const newVal = updates[key as keyof SlaPolicy];
      if (currentVal !== newVal) {
        changes[key] = { before: currentVal, after: newVal };
      }
    });

    if (Object.keys(changes).length > 0) {
      await logVehicleEdit(userId, id, changes);
      loggingService.info("SLA policy updated", { id, changes }, "SlaService");
    }

    return { data, error: null };
  } catch (error) {
    performanceService.endQueryTimer(queryId, "update_sla_policy");
    loggingService.error("Unexpected error updating SLA", { id, error }, "SlaService");
    return { data: null, error: error as Error };
  }
}

/**
 * Create a new SLA policy with audit logging
 */
export async function createSlaPolicy(
  policy: Omit<SlaPolicy, "id">,
  userId: string
): Promise<{ data: SlaPolicy | null; error: Error | null }> {
  const queryId = `sla-create-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  try {
    const { data, error } = await supabase
      .from("sla_policies")
      .insert({
        kpi_id: policy.kpiId,
        label: policy.label,
        sla_days: policy.slaDays,
        company_id: policy.companyId,
      })
      .select()
      .single();

    performanceService.endQueryTimer(queryId, "create_sla_policy");

    if (error) {
      loggingService.error("Failed to create SLA", { policy, error }, "SlaService");
      return { data: null, error };
    }

    loggingService.info("SLA policy created", { id: data.id, policy }, "SlaService");

    return { data, error: null };
  } catch (error) {
    performanceService.endQueryTimer(queryId, "create_sla_policy");
    loggingService.error("Unexpected error creating SLA", { policy, error }, "SlaService");
    return { data: null, error: error as Error };
  }
}
]]>

[Tool result trimmed: kept first 100 chars and last 100 chars of 4896 chars.]