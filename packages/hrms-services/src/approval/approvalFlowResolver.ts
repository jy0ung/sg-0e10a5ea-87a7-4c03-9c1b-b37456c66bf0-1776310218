import type { FlowEntityType } from '@flc/types';
import { supabase } from '../shared/supabaseClient';
import { resolveRequiredProfileId } from '../shared/identity';

export type ApprovalFlowCandidate = {
  id: string;
  departmentId: string | null;
  isDefault: boolean;
};

function singleCandidate(
  candidates: ApprovalFlowCandidate[],
  label: string,
  entityType: FlowEntityType,
): string | null {
  if (candidates.length > 1) {
    throw new Error(
      `Multiple ${label} approval flows found for ${entityType}. Resolve the duplicate configuration before continuing.`,
    );
  }
  return candidates[0]?.id ?? null;
}

/**
 * Selects one active approval flow using deterministic workforce-aware
 * precedence. This is pure so preview/bootstrap callers share identical rules.
 */
export function selectApprovalFlowCandidate(
  flows: ApprovalFlowCandidate[],
  departmentId: string | null,
  entityType: FlowEntityType,
): string | null {
  if (departmentId) {
    const exact = flows.filter(flow => flow.departmentId === departmentId);
    const exactId = singleCandidate(exact, 'department-scoped', entityType);
    if (exactId) return exactId;
  }

  const defaults = flows.filter(flow => flow.departmentId === null && flow.isDefault);
  const defaultId = singleCandidate(defaults, 'default', entityType);
  if (defaultId) return defaultId;

  const unscoped = flows.filter(flow => flow.departmentId === null && !flow.isDefault);
  return singleCandidate(unscoped, 'unscoped', entityType);
}

async function resolveRequesterDepartmentId(
  companyId: string,
  requesterId: string,
): Promise<string | null> {
  const profileId = await resolveRequiredProfileId(requesterId);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('employee_id, company_id, access_scope')
    .eq('id', profileId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) {
    throw new Error('The approval requester profile could not be resolved.');
  }

  const profileCompanyId = profile.company_id ? String(profile.company_id) : null;
  const isGlobal = String(profile.access_scope ?? '') === 'global';
  if (profileCompanyId !== companyId && !isGlobal) {
    throw new Error('The approval requester profile does not belong to the requested company.');
  }

  if (!profile.employee_id) return null;

  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('department_id')
    .eq('id', String(profile.employee_id))
    .eq('company_id', companyId)
    .maybeSingle();
  if (employeeError) throw new Error(employeeError.message);
  if (!employee) {
    throw new Error('The approval requester is linked to an Employee outside the requested company or to a missing Employee.');
  }

  return employee.department_id ? String(employee.department_id) : null;
}

/**
 * Resolves the active approval flow for a requester without reading duplicated
 * workforce fields from profiles.
 *
 * Workforce scope: Profile -> Employee -> department_id.
 * Authenticated actor identity remains the Profile/User ID.
 */
export async function resolveApprovalFlowForRequester(
  companyId: string,
  entityType: FlowEntityType,
  requesterId: string,
): Promise<string | null> {
  const departmentId = await resolveRequesterDepartmentId(companyId, requesterId);

  const { data: rows, error } = await supabase
    .from('approval_flows')
    .select('id, department_id, is_default')
    .eq('company_id', companyId)
    .eq('entity_type', entityType)
    .eq('is_active', true);
  if (error) throw new Error(error.message);

  const flows: ApprovalFlowCandidate[] = (rows ?? []).map(row => ({
    id: String(row.id),
    departmentId: row.department_id ? String(row.department_id) : null,
    isDefault: Boolean(row.is_default),
  }));

  return selectApprovalFlowCandidate(flows, departmentId, entityType);
}
