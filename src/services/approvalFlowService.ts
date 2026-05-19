import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import type { Json } from '@/integrations/supabase/types';
import type { ApprovalFlow, ApprovalStep, CreateApprovalFlowInput, FlowConditions, FlowEntityType, UpdateApprovalFlowInput } from '@/types';

// ─── Flow resolution context ─────────────────────────────────────────────────

export interface FlowResolutionContext {
  /** Requester's profile role (AppRole value). */
  requesterRole?: string | null;
  /** UUID of the requester's department. */
  departmentId?: string | null;
  /** UUID of the requester's branch. */
  branchId?: string | null;
  /** Ticket/request category key (internal_request flows). */
  categoryKey?: string | null;
  /** Ticket/request subcategory key (internal_request flows). */
  subcategoryKey?: string | null;
  /** Ticket/request numeric amount, if applicable. */
  amount?: number | null;
  /** Ticket/request priority string ('low' | 'medium' | 'high' | 'critical'). */
  priority?: string | null;
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

function rowToStep(r: Record<string, unknown>): ApprovalStep {
  return {
    id:               String(r.id ?? ''),
    flowId:           String(r.flow_id ?? ''),
    stepOrder:        Number(r.step_order ?? 0),
    name:             String(r.name ?? ''),
    approverType:     (r.approver_type as ApprovalStep['approverType']) ?? 'role',
    approverRole:     r.approver_role ? String(r.approver_role) : undefined,
    approverUserId:   r.approver_user_id ? String(r.approver_user_id) : undefined,
    approverUserName: r.approver_user
      ? String((r.approver_user as Record<string, unknown>)?.name ?? '')
      : undefined,
    fallbackApproverUserId: r.fallback_approver_user_id ? String(r.fallback_approver_user_id) : undefined,
    fallbackApproverUserName: r.fallback_approver_user
      ? String((r.fallback_approver_user as Record<string, unknown>)?.name ?? '')
      : undefined,
    escalationRule: r.escalation_rule ? String(r.escalation_rule) : undefined,
    conditionRule: r.condition_rule ? String(r.condition_rule) : undefined,
    isActive: r.is_active !== undefined ? Boolean(r.is_active) : true,
    allowSelfApproval: Boolean(r.allow_self_approval),
  };
}

function rowToFlow(r: Record<string, unknown>, steps: ApprovalStep[]): ApprovalFlow {
  return {
    id:             String(r.id ?? ''),
    companyId:      String(r.company_id ?? ''),
    name:           String(r.name ?? ''),
    description:    r.description ? String(r.description) : undefined,
    entityType:     (r.entity_type as ApprovalFlow['entityType']) ?? 'general',
    isActive:       Boolean(r.is_active),
    createdBy:      r.created_by ? String(r.created_by) : undefined,
    departmentId:   r.department_id ? String(r.department_id) : null,
    departmentName: r.department
      ? String((r.department as Record<string, unknown>)?.name ?? '')
      : undefined,
    isDefault:      Boolean(r.is_default),
    conditions:     (r.conditions as FlowConditions | null) ?? null,
    matchPriority:  Number(r.match_priority ?? 0),
    updatedBy:      r.updated_by ? String(r.updated_by) : undefined,
    steps,
    createdAt:      String(r.created_at ?? ''),
    updatedAt:      String(r.updated_at ?? ''),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVAL FLOWS
// ═══════════════════════════════════════════════════════════════════════════════

export async function listApprovalFlows(companyId: string): Promise<{ data: ApprovalFlow[]; error: string | null }> {
  const { data: flows, error } = await supabase
    .from('approval_flows')
    .select('*, department:departments!approval_flows_department_id_fkey(name)')
    .eq('company_id', companyId)
    .order('name');
  if (error) return { data: [], error: error.message };

  const flowIds = (flows ?? []).map(f => String(f.id));
  if (!flowIds.length) return { data: [], error: null };

  const { data: steps, error: stepsError } = await supabase
    .from('approval_steps')
    .select('*, approver_user:profiles!approval_steps_approver_user_id_fkey(name), fallback_approver_user:profiles!approval_steps_fallback_approver_user_id_fkey(name)')
    .in('flow_id', flowIds)
    .order('step_order');
  if (stepsError) return { data: [], error: stepsError.message };

  const stepsByFlow = new Map<string, ApprovalStep[]>();
  for (const s of steps ?? []) {
    const fid = String(s.flow_id);
    if (!stepsByFlow.has(fid)) stepsByFlow.set(fid, []);
    stepsByFlow.get(fid)!.push(rowToStep(s as Record<string, unknown>));
  }

  return {
    data: (flows ?? []).map(f =>
      rowToFlow(f as Record<string, unknown>, stepsByFlow.get(String(f.id)) ?? [])
    ),
    error: null,
  };
}

export async function createApprovalFlow(
  companyId: string,
  actorId: string,
  input: CreateApprovalFlowInput,
): Promise<{ data: ApprovalFlow | null; error: string | null }> {
  const { data: flow, error: flowError } = await supabase
    .from('approval_flows')
    .insert({
      company_id:     companyId,
      name:           input.name,
      description:    input.description ?? null,
      entity_type:    input.entityType,
      is_active:      input.isActive,
      created_by:     actorId,
      updated_by:     actorId,
      department_id:  input.departmentId ?? null,
      is_default:     input.isDefault ?? false,
      conditions:     (input.conditions ?? null) as unknown as Json,
      match_priority: input.matchPriority ?? 0,
    } as never)
    .select('*')
    .single();
  if (flowError) return { data: null, error: flowError.message };

  const flowId = String(flow.id);
  if (input.steps.length) {
    const { error: stepsError } = await supabase.from('approval_steps').insert(
      input.steps.map((s, idx) => ({
        flow_id:            flowId,
        step_order:         idx + 1,
        name:               s.name,
        approver_type:      s.approverType,
        approver_role:      s.approverRole ?? null,
        approver_user_id:   s.approverUserId ?? null,
        fallback_approver_user_id: s.fallbackApproverUserId ?? null,
        escalation_rule:    s.escalationRule ?? null,
        condition_rule:     s.conditionRule ?? null,
        is_active:          s.isActive,
        allow_self_approval: s.allowSelfApproval,
      })),
    );
    if (stepsError) return { data: null, error: stepsError.message };
  }

  void logUserAction(actorId, 'create', 'approval_flow', flowId, { name: input.name });
  const { data: result } = await listApprovalFlows(companyId);
  return { data: result.find(f => f.id === flowId) ?? null, error: null };
}

export async function updateApprovalFlow(
  flowId: string,
  companyId: string,
  actorId: string,
  input: UpdateApprovalFlowInput,
): Promise<{ error: string | null }> {
  const { error: flowError } = await supabase
    .from('approval_flows')
    .update({
      name:           input.name,
      description:    input.description ?? null,
      entity_type:    input.entityType,
      is_active:      input.isActive,
      updated_by:     actorId,
      department_id:  input.departmentId ?? null,
      is_default:     input.isDefault ?? false,
      conditions:     (input.conditions ?? null) as unknown as Json,
      match_priority: input.matchPriority ?? 0,
      updated_at:     new Date().toISOString(),
    } as never)
    .eq('company_id', companyId)
    .eq('id', flowId);
  if (flowError) return { error: flowError.message };

  // Delete all existing steps, then re-insert
  const { error: deleteError } = await supabase
    .from('approval_steps')
    .delete()
    .eq('flow_id', flowId);
  if (deleteError) return { error: deleteError.message };

  if (input.steps.length) {
    const { error: stepsError } = await supabase.from('approval_steps').insert(
      input.steps.map((s, idx) => ({
        flow_id:            flowId,
        step_order:         idx + 1,
        name:               s.name,
        approver_type:      s.approverType,
        approver_role:      s.approverRole ?? null,
        approver_user_id:   s.approverUserId ?? null,
        fallback_approver_user_id: s.fallbackApproverUserId ?? null,
        escalation_rule:    s.escalationRule ?? null,
        condition_rule:     s.conditionRule ?? null,
        is_active:          s.isActive,
        allow_self_approval: s.allowSelfApproval,
      })),
    );
    if (stepsError) return { error: stepsError.message };
  }

  void logUserAction(actorId, 'update', 'approval_flow', flowId, { name: input.name });
  return { error: null };
}

export async function toggleApprovalFlowActive(
  companyId: string,
  flowId: string,
  isActive: boolean,
  actorId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('approval_flows')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', flowId);
  if (!error) void logUserAction(actorId, 'update', 'approval_flow', flowId, { isActive });
  return { error: error?.message ?? null };
}

export async function deleteApprovalFlow(companyId: string, flowId: string, actorId: string): Promise<{ error: string | null }> {
  // Steps cascade-delete via FK
  const { error } = await supabase.from('approval_flows').delete().eq('company_id', companyId).eq('id', flowId);
  if (!error) void logUserAction(actorId, 'delete', 'approval_flow', flowId, {});
  return { error: error?.message ?? null };
}

/** Lightweight employee list for the "specific_user" approver picker. */
export async function listEmployeesForSelect(
  companyId: string,
): Promise<{ data: { id: string; name: string }[]; error: string | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .order('name');
  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map(r => ({ id: String(r.id), name: String(r.name) })),
    error: null,
  };
}

/** Lightweight department list for the department scope picker. */
export async function listDepartmentsForSelect(
  companyId: string,
): Promise<{ data: { id: string; name: string }[]; error: string | null }> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name');
  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map(r => ({ id: String(r.id), name: String(r.name) })),
    error: null,
  };
}

// ─── Internal condition scorer ───────────────────────────────────────────────

function scoreConditions(
  conditions: FlowConditions | null,
  ctx: FlowResolutionContext,
): { matches: boolean; specificity: number } {
  if (!conditions || Object.keys(conditions).length === 0) {
    return { matches: true, specificity: 0 };
  }

  let specificity = 0;

  if (conditions.requesterRole !== undefined) {
    if (!ctx.requesterRole || ctx.requesterRole !== conditions.requesterRole) return { matches: false, specificity: 0 };
    specificity++;
  }
  if (conditions.departmentId !== undefined) {
    if (!ctx.departmentId || ctx.departmentId !== conditions.departmentId) return { matches: false, specificity: 0 };
    specificity++;
  }
  if (conditions.branchId !== undefined) {
    if (!ctx.branchId || ctx.branchId !== conditions.branchId) return { matches: false, specificity: 0 };
    specificity++;
  }
  if (conditions.categoryKey !== undefined) {
    if (!ctx.categoryKey || ctx.categoryKey !== conditions.categoryKey) return { matches: false, specificity: 0 };
    specificity++;
  }
  if (conditions.subcategoryKey !== undefined) {
    if (!ctx.subcategoryKey || ctx.subcategoryKey !== conditions.subcategoryKey) return { matches: false, specificity: 0 };
    specificity++;
  }
  if (conditions.priority !== undefined) {
    if (!ctx.priority || ctx.priority !== conditions.priority) return { matches: false, specificity: 0 };
    specificity++;
  }
  if (conditions.amountMin !== undefined) {
    if (ctx.amount == null || ctx.amount < conditions.amountMin) return { matches: false, specificity: 0 };
    specificity++;
  }
  if (conditions.amountMax !== undefined) {
    if (ctx.amount == null || ctx.amount > conditions.amountMax) return { matches: false, specificity: 0 };
    specificity++;
  }

  return { matches: true, specificity };
}

/**
 * Resolve the best-matching active approval flow for a given workflow type
 * using condition-based scoring.
 *
 * Resolution algorithm:
 *   1. Load all active flows for (company_id, entity_type).
 *   2. Score each flow: a flow matches only if ALL of its set condition fields
 *      agree with the context. Unset condition fields are ignored.
 *   3. Among matching flows, pick the one(s) with the highest specificity score
 *      (= number of explicitly matched conditions).
 *   4. Tiebreak by match_priority DESC.
 *   5. If a single winner emerges → use it.
 *   6. If multiple flows tie on both specificity and priority → setup error.
 *   7. If no flows at all are configured → { flowId: null, error: null }
 *      (no-approval path; caller decides).
 *   8. If flows are configured but none match the context → setup error.
 */
export async function resolveFlowForContext(
  companyId: string,
  entityType: FlowEntityType,
  context: FlowResolutionContext = {},
): Promise<{ flowId: string | null; error: string | null }> {
  const { data: rows } = await supabase
    .from('approval_flows')
    .select('id, conditions, is_default, match_priority')
    .eq('company_id', companyId)
    .eq('entity_type', entityType)
    .eq('is_active', true);

  // No flows at all → unconfigured, proceed without approval
  if (!rows?.length) return { flowId: null, error: null };

  // Score each flow
  const scored = rows.map(r => {
    const { matches, specificity } = scoreConditions(r.conditions as FlowConditions | null, context);
    return {
      id:           String(r.id),
      matches,
      specificity,
      matchPriority: Number(r.match_priority ?? 0),
      isDefault:    Boolean(r.is_default),
    };
  });

  const matching = scored.filter(f => f.matches);
  if (!matching.length) {
    return {
      flowId: null,
      error: 'No approval flow matches this request. Please ask your administrator to configure a matching flow.',
    };
  }

  // Find highest specificity, then highest match_priority
  const maxSpec = Math.max(...matching.map(f => f.specificity));
  const topSpec = matching.filter(f => f.specificity === maxSpec);
  const maxPriority = Math.max(...topSpec.map(f => f.matchPriority));
  const winners = topSpec.filter(f => f.matchPriority === maxPriority);

  if (winners.length === 1) return { flowId: winners[0].id, error: null };

  // Multiple flows tie — if they're all zero-specificity defaults, prefer the
  // one explicitly marked is_default=true (DB constraint ensures at most one).
  if (maxSpec === 0) {
    const explicitDefault = winners.find(f => f.isDefault);
    if (explicitDefault) return { flowId: explicitDefault.id, error: null };
  }

  return {
    flowId: null,
    error: 'Multiple approval flows match this request equally. Please ask your administrator to resolve the conflict by adjusting conditions or match priority.',
  };
}

/**
 * @deprecated Use `resolveFlowForContext` instead.
 * Kept as a backward-compatible shim for callers that only have a departmentId.
 */
export async function resolveApprovalFlowId(
  companyId: string,
  entityType: FlowEntityType,
  departmentId?: string | null,
): Promise<string | null> {
  const { flowId } = await resolveFlowForContext(companyId, entityType, { departmentId });
  return flowId;
}
