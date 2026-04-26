import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import type { ApprovalFlow, ApprovalStep, CreateApprovalFlowInput, UpdateApprovalFlowInput } from '@/types';

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
    allowSelfApproval: Boolean(r.allow_self_approval),
  };
}

function rowToFlow(r: Record<string, unknown>, steps: ApprovalStep[]): ApprovalFlow {
  return {
    id:          String(r.id ?? ''),
    companyId:   String(r.company_id ?? ''),
    name:        String(r.name ?? ''),
    description: r.description ? String(r.description) : undefined,
    entityType:  (r.entity_type as ApprovalFlow['entityType']) ?? 'general',
    isActive:    Boolean(r.is_active),
    createdBy:   r.created_by ? String(r.created_by) : undefined,
    steps,
    createdAt:   String(r.created_at ?? ''),
    updatedAt:   String(r.updated_at ?? ''),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVAL FLOWS
// ═══════════════════════════════════════════════════════════════════════════════

export async function listApprovalFlows(companyId: string): Promise<{ data: ApprovalFlow[]; error: string | null }> {
  const { data: flows, error } = await supabase
    .from('approval_flows')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
  if (error) return { data: [], error: error.message };

  const flowIds = (flows ?? []).map(f => String(f.id));
  if (!flowIds.length) return { data: [], error: null };

  const { data: steps, error: stepsError } = await supabase
    .from('approval_steps')
    .select('*, approver_user:profiles!approval_steps_approver_user_id_fkey(name)')
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
      company_id:  companyId,
      name:        input.name,
      description: input.description ?? null,
      entity_type: input.entityType,
      is_active:   input.isActive,
      created_by:  actorId,
    })
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
      name:        input.name,
      description: input.description ?? null,
      entity_type: input.entityType,
      is_active:   input.isActive,
      updated_at:  new Date().toISOString(),
    })
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
