import { supabase, untypedSupabase } from '../shared/supabaseClient';
import { resolveDirectManagerApproverUserId } from '../shared/identity';
import type { ApprovalStepRecord } from './approvalTypes';

/**
 * Resolves the assigned approver for a step at bootstrap or step-advance time.
 *
 * Returns `{ approverRole, approverUserId }` — exactly one will be non-null:
 * - `approverRole` — the HRMS role UUID (or legacy app-role string) that
 *   should receive the inbox item.
 * - `approverUserId` — the specific profile UUID that must action this step.
 *
 * Throws on any resolution error (no role configured, manager not found, etc.)
 */
export async function resolveStepRouting(
  step: ApprovalStepRecord,
  requesterId: string,
  companyId: string,
): Promise<{ approverRole: string | null; approverUserId: string | null }> {
  if (step.approverType === 'role') {
    if (!step.approverRole) {
      throw new Error(`Approval step '${step.name}' is missing an HRMS role.`);
    }
    // If no active assignees exist for this role, fall back to specific user.
    const { data: assignments, error } = await untypedSupabase
      .from('employee_hrms_role_assignments')
      .select('id')
      .eq('company_id', companyId)
      .eq('hrms_role_id', step.approverRole)
      .limit(1);
    if (error) throw new Error(error.message);
    if (!assignments?.length && step.fallbackApproverUserId) {
      return { approverRole: null, approverUserId: step.fallbackApproverUserId };
    }
    return { approverRole: step.approverRole, approverUserId: null };
  }

  if (step.approverType === 'specific_user') {
    if (!step.approverUserId) {
      throw new Error(`Approval step '${step.name}' is missing a specific approver.`);
    }
    return { approverRole: null, approverUserId: step.approverUserId };
  }

  // direct_manager
  const managerId = await resolveDirectManagerApproverUserId(requesterId);
  return { approverRole: null, approverUserId: managerId };
}

/**
 * Returns `true` if the given profile has an active assignment for the given
 * HRMS role in the company, either directly (profile_id) or via their linked
 * employee record (employee_id).
 *
 * Throws on database error.
 */
export async function userHasAssignedHrmsRole(
  companyId: string,
  profileId: string,
  hrmsRoleId: string,
): Promise<boolean> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('employee_id')
    .eq('id', profileId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const employeeId = (profile as Record<string, unknown> | null)?.employee_id
    ? String((profile as Record<string, unknown>).employee_id)
    : null;

  let query = untypedSupabase
    .from('employee_hrms_role_assignments')
    .select('id')
    .eq('company_id', companyId)
    .eq('hrms_role_id', hrmsRoleId)
    .limit(1);

  query = employeeId
    ? query.or(`profile_id.eq.${profileId},employee_id.eq.${employeeId}`)
    : query.eq('profile_id', profileId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
