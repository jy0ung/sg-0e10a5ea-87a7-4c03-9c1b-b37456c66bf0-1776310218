/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Canonical Approval Flow administration.
 *
 * Owns configuration reads/writes only. Runtime flow resolution for Internal
 * Requests remains package-owned by @flc/internal-requests.
 */
import type {
  ApprovalFlow,
  ApprovalStep,
  CreateApprovalFlowInput,
  FlowConditions,
  UpdateApprovalFlowInput,
} from '@flc/types';
import { supabase } from '../shared/supabaseClient';

const db = supabase as any;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SelectOption = { id: string; name: string };

function mapConditions(raw: unknown): FlowConditions | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as FlowConditions;
}

function mapStep(
  row: Record<string, any>,
  roleNames: Map<string, string>,
): ApprovalStep {
  const approverRole = row.approver_role ? String(row.approver_role) : undefined;
  return {
    id: String(row.id ?? ''),
    flowId: String(row.flow_id ?? ''),
    stepOrder: Number(row.step_order ?? 0),
    name: String(row.name ?? ''),
    approverType: row.approver_type ?? 'role',
    approverRole,
    approverRoleName: approverRole ? roleNames.get(approverRole) : undefined,
    approverUserId: row.approver_user_id ? String(row.approver_user_id) : undefined,
    approverUserName: row.approver_user?.name
      ? String(row.approver_user.name)
      : undefined,
    fallbackApproverUserId: row.fallback_approver_user_id
      ? String(row.fallback_approver_user_id)
      : undefined,
    fallbackApproverUserName: row.fallback_approver_user?.name
      ? String(row.fallback_approver_user.name)
      : undefined,
    escalationRule: row.escalation_rule ? String(row.escalation_rule) : undefined,
    conditionRule: row.condition_rule ? String(row.condition_rule) : undefined,
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    allowSelfApproval: Boolean(row.allow_self_approval),
  };
}

function mapFlow(
  row: Record<string, any>,
  steps: ApprovalStep[],
): ApprovalFlow {
  return {
    id: String(row.id ?? ''),
    companyId: String(row.company_id ?? ''),
    name: String(row.name ?? ''),
    description: row.description ? String(row.description) : undefined,
    entityType: row.entity_type,
    isActive: Boolean(row.is_active),
    createdBy: row.created_by ? String(row.created_by) : undefined,
    departmentId: row.department_id ? String(row.department_id) : null,
    departmentName: row.department?.name ? String(row.department.name) : undefined,
    isDefault: Boolean(row.is_default),
    conditions: mapConditions(row.conditions),
    matchPriority: Number(row.match_priority ?? 0),
    updatedBy: row.updated_by ? String(row.updated_by) : undefined,
    steps,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function serializeSteps(input: CreateApprovalFlowInput): Record<string, unknown>[] {
  return input.steps.map(step => ({
    name: step.name,
    approverType: step.approverType,
    approverRole: step.approverRole ?? null,
    approverUserId: step.approverUserId ?? null,
    fallbackApproverUserId: step.fallbackApproverUserId ?? null,
    escalationRule: step.escalationRule ?? null,
    conditionRule: step.conditionRule ?? null,
    isActive: step.isActive ?? true,
    allowSelfApproval: step.allowSelfApproval ?? false,
  }));
}

export async function listApprovalFlows(companyId: string): Promise<ApprovalFlow[]> {
  const { data: flowRows, error: flowError } = await db
    .from('approval_flows')
    .select('*, department:departments!approval_flows_department_id_fkey(name)')
    .eq('company_id', companyId)
    .order('name');
  if (flowError) throw new Error(flowError.message);

  const rows = (flowRows ?? []) as Record<string, any>[];
  const flowIds = rows.map(row => String(row.id));
  if (flowIds.length === 0) return [];

  const { data: stepRows, error: stepError } = await db
    .from('approval_steps')
    .select(
      '*, approver_user:profiles!approval_steps_approver_user_id_fkey(name), fallback_approver_user:profiles!approval_steps_fallback_approver_user_id_fkey(name)',
    )
    .in('flow_id', flowIds)
    .order('step_order');
  if (stepError) throw new Error(stepError.message);

  const roleIds = [
    ...new Set(
      ((stepRows ?? []) as Record<string, any>[])
        .map(step => String(step.approver_role ?? ''))
        .filter(roleId => UUID_PATTERN.test(roleId)),
    ),
  ];

  const roleNames = new Map<string, string>();
  if (roleIds.length > 0) {
    const { data: roleRows, error: roleError } = await db
      .from('hrms_roles')
      .select('id, name')
      .eq('company_id', companyId)
      .in('id', roleIds);
    if (roleError) throw new Error(roleError.message);

    for (const role of roleRows ?? []) {
      roleNames.set(String(role.id), String(role.name ?? ''));
    }
  }

  const stepsByFlow = new Map<string, ApprovalStep[]>();
  for (const rawStep of (stepRows ?? []) as Record<string, any>[]) {
    const flowId = String(rawStep.flow_id);
    const mapped = mapStep(rawStep, roleNames);
    const current = stepsByFlow.get(flowId) ?? [];
    current.push(mapped);
    stepsByFlow.set(flowId, current);
  }

  return rows.map(row =>
    mapFlow(row, stepsByFlow.get(String(row.id)) ?? []),
  );
}

async function saveApprovalFlow(
  companyId: string,
  flowId: string | null,
  input: CreateApprovalFlowInput | UpdateApprovalFlowInput,
): Promise<string> {
  const preserveConditions = flowId !== null && input.conditions === undefined;
  const preserveMatchPriority = flowId !== null && input.matchPriority === undefined;

  const { data, error } = await db.rpc('save_approval_flow_with_steps', {
    p_company_id: companyId,
    p_flow_id: flowId,
    p_name: input.name,
    p_description: input.description ?? null,
    p_entity_type: input.entityType,
    p_is_active: input.isActive,
    p_department_id: input.departmentId ?? null,
    p_is_default: input.isDefault ?? false,
    p_conditions: input.conditions ?? null,
    p_match_priority: input.matchPriority ?? null,
    p_preserve_conditions: preserveConditions,
    p_preserve_match_priority: preserveMatchPriority,
    p_steps: serializeSteps(input),
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function createApprovalFlow(
  companyId: string,
  input: CreateApprovalFlowInput,
): Promise<ApprovalFlow> {
  const flowId = await saveApprovalFlow(companyId, null, input);
  const flows = await listApprovalFlows(companyId);
  const flow = flows.find(candidate => candidate.id === flowId);
  if (!flow) throw new Error('Approval Flow was created but could not be reloaded.');
  return flow;
}

export async function updateApprovalFlow(
  companyId: string,
  flowId: string,
  input: UpdateApprovalFlowInput,
): Promise<void> {
  await saveApprovalFlow(companyId, flowId, input);
}

export async function toggleApprovalFlowActive(
  companyId: string,
  flowId: string,
  isActive: boolean,
  actorProfileId: string,
): Promise<void> {
  const { error } = await db
    .from('approval_flows')
    .update({
      is_active: isActive,
      updated_by: actorProfileId,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', flowId);
  if (error) throw new Error(error.message);
}

export async function deleteApprovalFlow(
  companyId: string,
  flowId: string,
): Promise<void> {
  const { error } = await db
    .from('approval_flows')
    .delete()
    .eq('company_id', companyId)
    .eq('id', flowId);
  if (error) throw new Error(error.message);
}

export async function listApprovalApproverProfiles(
  companyId: string,
): Promise<SelectOption[]> {
  const { data, error } = await db
    .from('profiles')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .order('name');
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: Record<string, any>) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
  }));
}

export async function listApprovalDepartments(
  companyId: string,
): Promise<SelectOption[]> {
  const { data, error } = await db
    .from('departments')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: Record<string, any>) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
  }));
}
