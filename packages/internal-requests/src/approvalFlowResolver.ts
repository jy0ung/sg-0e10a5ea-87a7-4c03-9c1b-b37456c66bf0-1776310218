import { supabase } from '@flc/supabase';
import type { FlowConditions, FlowEntityType } from '@flc/types';

export interface ApprovalFlowResolutionContext {
  departmentId?: string | null;
  branchId?: string | null;
  requesterRole?: string | null;
  categoryKey?: string | null;
  subcategoryKey?: string | null;
  priority?: string | null;
  amount?: number | null;
}

export interface InternalRequestApprovalPlanOptions {
  categoryKey?: string | null;
  subcategoryKey?: string | null;
  priority?: string | null;
}

interface ApprovalFlowCandidate {
  id: string;
  department_id: string | null;
  is_default: boolean;
  conditions: unknown;
  match_priority: number;
  created_at: string;
}

interface CandidateScore {
  id: string;
  specificity: number;
  matchPriority: number;
  isDefault: boolean;
}

const SUPPORTED_CONDITION_KEYS = new Set([
  'requesterRole',
  'departmentId',
  'branchId',
  'categoryKey',
  'subcategoryKey',
  'amountMin',
  'amountMax',
  'priority',
]);

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseConditions(raw: unknown, flowId: string): FlowConditions {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Approval Flow ${flowId} has invalid conditions configuration.`);
  }

  const record = raw as Record<string, unknown>;
  const unsupported = Object.keys(record).filter(key => !SUPPORTED_CONDITION_KEYS.has(key));
  if (unsupported.length > 0) {
    throw new Error(
      `Approval Flow ${flowId} uses unsupported condition key(s): ${unsupported.join(', ')}.`,
    );
  }

  const parsed: FlowConditions = {};
  for (const key of ['requesterRole', 'departmentId', 'branchId', 'categoryKey', 'subcategoryKey'] as const) {
    const value = record[key];
    if (value == null || value === '') continue;
    if (typeof value !== 'string') {
      throw new Error(`Approval Flow ${flowId} condition ${key} must be text.`);
    }
    parsed[key] = value;
  }

  if (record.priority != null && record.priority !== '') {
    if (
      typeof record.priority !== 'string'
      || !['low', 'medium', 'high', 'critical'].includes(record.priority)
    ) {
      throw new Error(`Approval Flow ${flowId} condition priority is invalid.`);
    }
    parsed.priority = record.priority as FlowConditions['priority'];
  }

  for (const key of ['amountMin', 'amountMax'] as const) {
    const value = record[key];
    if (value == null || value === '') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Approval Flow ${flowId} condition ${key} must be numeric.`);
    }
    parsed[key] = value;
  }

  if (
    parsed.amountMin !== undefined
    && parsed.amountMax !== undefined
    && parsed.amountMin > parsed.amountMax
  ) {
    throw new Error(`Approval Flow ${flowId} has amountMin greater than amountMax.`);
  }

  return parsed;
}

function scoreCandidate(
  flow: ApprovalFlowCandidate,
  context: ApprovalFlowResolutionContext,
): CandidateScore | null {
  const conditions = parseConditions(flow.conditions, flow.id);
  const conditionDepartmentId = normalizeString(conditions.departmentId);
  const legacyDepartmentId = normalizeString(flow.department_id);

  if (
    conditionDepartmentId
    && legacyDepartmentId
    && conditionDepartmentId !== legacyDepartmentId
  ) {
    throw new Error(
      `Approval Flow ${flow.id} has conflicting Department routing configuration.`,
    );
  }

  const departmentId = conditionDepartmentId ?? legacyDepartmentId;
  let specificity = 0;

  if (departmentId) {
    specificity += 1;
    if (normalizeString(context.departmentId) !== departmentId) return null;
  }

  const exactConditions: Array<
    [keyof Pick<FlowConditions, 'branchId' | 'requesterRole' | 'categoryKey' | 'subcategoryKey' | 'priority'>, string | null]
  > = [
    ['branchId', normalizeString(context.branchId)],
    ['requesterRole', normalizeString(context.requesterRole)],
    ['categoryKey', normalizeString(context.categoryKey)],
    ['subcategoryKey', normalizeString(context.subcategoryKey)],
    ['priority', normalizeString(context.priority)],
  ];

  for (const [key, actual] of exactConditions) {
    const expected = normalizeString(conditions[key]);
    if (!expected) continue;
    specificity += 1;
    if (actual !== expected) return null;
  }

  if (conditions.amountMin !== undefined) {
    specificity += 1;
    if (context.amount == null || context.amount < conditions.amountMin) return null;
  }

  if (conditions.amountMax !== undefined) {
    specificity += 1;
    if (context.amount == null || context.amount > conditions.amountMax) return null;
  }

  return {
    id: flow.id,
    specificity,
    matchPriority: Number(flow.match_priority ?? 0),
    isDefault: Boolean(flow.is_default),
  };
}

/**
 * Pure scorer for Approval Flow candidates.
 *
 * Highest specificity wins, then match_priority. An explicit default breaks an
 * otherwise-equal unconditional legacy fallback tie. Any remaining top tie is
 * treated as a configuration error instead of picking arbitrarily.
 */
export function selectApprovalFlowCandidate(
  flows: ApprovalFlowCandidate[],
  context: ApprovalFlowResolutionContext,
): string | null {
  const matches = flows
    .map(flow => scoreCandidate(flow, context))
    .filter((score): score is CandidateScore => score !== null);

  if (matches.length === 0) return null;

  const bestSpecificity = Math.max(...matches.map(match => match.specificity));
  const specificityPeers = matches.filter(
    match => match.specificity === bestSpecificity,
  );

  const bestPriority = Math.max(...specificityPeers.map(match => match.matchPriority));
  let top = specificityPeers.filter(match => match.matchPriority === bestPriority);

  if (top.length === 1) return top[0].id;

  if (bestSpecificity === 0) {
    const explicitDefaults = top.filter(match => match.isDefault);
    if (explicitDefaults.length === 1) return explicitDefaults[0].id;
    if (explicitDefaults.length > 1) top = explicitDefaults;
  }

  throw new Error(
    `Approval Flow configuration is ambiguous: ${top.length} active Flows have equal specificity and priority.`,
  );
}

export async function resolveApprovalFlowId(
  companyId: string,
  entityType: FlowEntityType,
  context: ApprovalFlowResolutionContext,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('approval_flows')
    .select('id, department_id, is_default, conditions, match_priority, created_at')
    .eq('company_id', companyId)
    .eq('entity_type', entityType)
    .eq('is_active', true);

  if (error) throw new Error(error.message);

  return selectApprovalFlowCandidate(
    (data ?? []) as ApprovalFlowCandidate[],
    context,
  );
}

interface RequesterProfileContext {
  department_id: string | null;
  branch_id: string | null;
  role: string;
}

interface RequesterEmployeeContext {
  department_id: string | null;
  branch_id: string | null;
  primary_role: string;
}

export function buildRequesterResolutionContext(
  profile: RequesterProfileContext,
  employee: RequesterEmployeeContext | null,
  options: InternalRequestApprovalPlanOptions,
): ApprovalFlowResolutionContext {
  return {
    departmentId: employee ? employee.department_id : profile.department_id,
    branchId: employee ? employee.branch_id : profile.branch_id,
    requesterRole: employee ? employee.primary_role : profile.role,
    categoryKey: options.categoryKey ?? null,
    subcategoryKey: options.subcategoryKey ?? null,
    priority: options.priority ?? null,
    amount: null,
  };
}

async function loadRequesterResolutionContext(
  companyId: string,
  requesterId: string,
  options: InternalRequestApprovalPlanOptions,
): Promise<ApprovalFlowResolutionContext> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_id, access_scope, employee_id, department_id, branch_id, role')
    .eq('id', requesterId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error('Requester Profile could not be resolved.');

  if (
    profile.company_id !== companyId
    && profile.access_scope !== 'global'
  ) {
    throw new Error('Requester Profile does not belong to the request company.');
  }

  if (profile.employee_id) {
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('company_id, department_id, branch_id, primary_role')
      .eq('company_id', companyId)
      .eq('id', profile.employee_id)
      .maybeSingle();

    if (employeeError) throw new Error(employeeError.message);
    if (!employee) {
      throw new Error(
        'Requester Profile is linked to an Employee that does not belong to the request company.',
      );
    }

    return buildRequesterResolutionContext(profile, employee, options);
  }

  return buildRequesterResolutionContext(profile, null, options);
}

async function validatePinnedInternalRequestFlow(
  companyId: string,
  flowId: string,
  sourceLabel: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('approval_flows')
    .select('id, entity_type, is_active')
    .eq('company_id', companyId)
    .eq('id', flowId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      `${sourceLabel} is pinned to an Approval Flow that does not belong to this company.`,
    );
  }
  if (data.entity_type !== 'internal_request') {
    throw new Error(
      `${sourceLabel} is pinned to a non-Internal-Request Approval Flow.`,
    );
  }
  if (!data.is_active) {
    throw new Error(
      `${sourceLabel} is pinned to an inactive Approval Flow. Activate it or update Request Setup.`,
    );
  }

  return String(data.id);
}

async function getCategoryPinnedFlowId(
  companyId: string,
  categoryKey: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('request_categories')
    .select('approval_flow_id')
    .eq('company_id', companyId)
    .eq('category_key', categoryKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.approval_flow_id ?? null;
}

async function getSubcategoryPinnedFlowId(
  companyId: string,
  categoryKey: string,
  subcategoryKey: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('request_subcategories')
    .select('approval_flow_id')
    .eq('company_id', companyId)
    .eq('category_key', categoryKey)
    .eq('subcategory_key', subcategoryKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.approval_flow_id ?? null;
}

/**
 * Resolve the Internal Request Approval Flow.
 *
 * Resolution order:
 * 1. valid active subcategory pin;
 * 2. valid active category pin;
 * 3. condition scorer using canonical requester context.
 */
export async function resolveInternalRequestApprovalFlowId(
  companyId: string,
  requesterId: string,
  options: InternalRequestApprovalPlanOptions = {},
): Promise<string | null> {
  if (options.categoryKey && options.subcategoryKey) {
    const subcategoryPin = await getSubcategoryPinnedFlowId(
      companyId,
      options.categoryKey,
      options.subcategoryKey,
    );
    if (subcategoryPin) {
      return validatePinnedInternalRequestFlow(
        companyId,
        subcategoryPin,
        'Request Subcategory',
      );
    }
  }

  if (options.categoryKey) {
    const categoryPin = await getCategoryPinnedFlowId(
      companyId,
      options.categoryKey,
    );
    if (categoryPin) {
      return validatePinnedInternalRequestFlow(
        companyId,
        categoryPin,
        'Request Category',
      );
    }
  }

  const context = await loadRequesterResolutionContext(
    companyId,
    requesterId,
    options,
  );

  return resolveApprovalFlowId(companyId, 'internal_request', context);
}
