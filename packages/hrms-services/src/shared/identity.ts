import { supabase } from './supabaseClient';

/**
 * Resolves the canonical `profiles.id` (UUID) for a given input that may be
 * either a profile UUID or an employee UUID.
 *
 * - If the input matches `profiles.id` directly, it is returned as-is.
 * - If not, the function looks up the profile linked to `employees.id`.
 *
 * Throws if no profile can be resolved.
 */
export async function resolveRequiredProfileId(employeeId: string): Promise<string> {
  if (!employeeId) return employeeId;

  const { data: directProfile, error: directError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', employeeId)
    .maybeSingle();
  if (directError) throw new Error(directError.message);
  if (directProfile?.id) return String(directProfile.id);

  const { data: linkedProfile, error: linkedError } = await supabase
    .from('profiles')
    .select('id')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (linkedError) throw new Error(linkedError.message);
  if (!linkedProfile?.id) throw new Error(`No profile linked to employee '${employeeId}'.`);

  return String(linkedProfile.id);
}

/**
 * Resolves the profile UUID of the direct reporting manager for a given
 * requester. Used by approval steps with `approver_type = 'direct_manager'`.
 *
 * Throws if the requester has no linked employee record or the employee
 * has no manager assigned.
 */
export async function resolveDirectManagerApproverUserId(requesterId: string): Promise<string> {
  const requesterProfileId = await resolveRequiredProfileId(requesterId);

  const requesterProfileResult = await supabase
    .from('profiles')
    .select('employee_id')
    .eq('id', requesterProfileId)
    .maybeSingle();

  if (requesterProfileResult.error) {
    throw new Error(requesterProfileResult.error.message);
  }

  const requesterProfile = requesterProfileResult.data as unknown as Record<string, unknown> | null;
  const requesterEmployeeId = requesterProfile?.employee_id ? String(requesterProfile.employee_id) : null;

  if (!requesterEmployeeId) {
    throw new Error('The requester must be linked to a workforce employee for direct-manager approval routing.');
  }

  const { data: requesterEmployee, error: requesterEmployeeError } = await supabase
    .from('employees')
    .select('manager_employee_id')
    .eq('id', requesterEmployeeId)
    .maybeSingle();
  if (requesterEmployeeError) {
    throw new Error(requesterEmployeeError.message);
  }

  const managerEmployeeId = (requesterEmployee as Record<string, unknown> | null)?.manager_employee_id;
  if (!managerEmployeeId) {
    throw new Error('The requester does not have a reporting manager assigned for the active approval flow.');
  }

  const managerEmployeeIdText = String(managerEmployeeId);
  const { data: managerProfile, error: managerProfileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('employee_id', managerEmployeeIdText)
    .maybeSingle();
  if (managerProfileError) throw new Error(managerProfileError.message);
  if (!managerProfile?.id) {
    throw new Error('The requester reporting manager does not have a linked user profile.');
  }

  return String(managerProfile.id);
}

// ─── Batch identity helpers ───────────────────────────────────────────────────

export type StoredEmployeeIdentity = { name?: string };

/**
 * Resolves employee display names for a batch of employee IDs.
 * Returns a Map from employee_id → identity (name).
 * Throws on database error. Missing employees are silently omitted.
 */
export async function resolveStoredEmployeeIdentities(
  storedEmployeeIds: string[],
): Promise<Map<string, StoredEmployeeIdentity>> {
  const uniqueIds = [...new Set(storedEmployeeIds.filter(Boolean))];
  const identities = new Map<string, StoredEmployeeIdentity>();
  if (!uniqueIds.length) return identities;

  const { data, error } = await supabase
    .from('employees')
    .select('id, name')
    .in('id', uniqueIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    identities.set(String(row.id), { name: row.name ? String(row.name) : undefined });
  }
  return identities;
}

/**
 * Resolves canonical profile IDs for a batch of candidate IDs (which may be
 * either profile UUIDs or employee UUIDs).
 * Returns a Map from inputId → profileId.
 * Throws on database error.
 */
export async function resolveStoredProfileIds(
  candidateIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(candidateIds.filter(Boolean))];
  const profileIds = new Map<string, string>();
  if (!uniqueIds.length) return profileIds;

  const { data: directRows, error: directError } = await supabase
    .from('profiles')
    .select('id, employee_id')
    .in('id', uniqueIds);
  if (directError) throw new Error(directError.message);
  for (const row of directRows ?? []) {
    profileIds.set(String(row.id), String(row.id));
    if (row.employee_id) profileIds.set(String(row.employee_id), String(row.id));
  }

  const unresolvedIds = uniqueIds.filter(id => !profileIds.has(id));
  if (!unresolvedIds.length) return profileIds;

  const { data: linkedRows, error: linkedError } = await supabase
    .from('profiles')
    .select('id, employee_id')
    .in('employee_id', unresolvedIds);
  if (linkedError) throw new Error(linkedError.message);
  for (const row of linkedRows ?? []) {
    if (row.employee_id) profileIds.set(String(row.employee_id), String(row.id));
    profileIds.set(String(row.id), String(row.id));
  }
  return profileIds;
}
