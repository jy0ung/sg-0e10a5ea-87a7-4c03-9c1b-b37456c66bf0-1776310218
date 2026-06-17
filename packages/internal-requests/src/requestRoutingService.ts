import { supabase, type Database } from '@flc/supabase';
import { canManagePortalQueue } from '@flc/auth';
import { logUserAction } from '@flc/platform-services';
import {
  OPTIMISTIC_CONFLICT_MESSAGE,
  buildAuditDiff,
  type ConfigDeleteResult,
  type ConfigMutationResult,
} from './mutationSupport';

type RoutingRuleUpdate = Database['public']['Tables']['request_routing_rules']['Update'];

export interface RequestRoutingRule {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  match_category: string | null;
  match_subcategory: string | null;
  match_submitter_role: string | null;
  match_priority: string | null;
  assign_to_user_id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

interface RoutingRuleRow {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  match_category: string | null;
  match_subcategory: string | null;
  match_submitter_role: string | null;
  match_priority: string | null;
  assign_to_user_id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CreateRoutingRuleInput {
  name: string;
  match_category?: string | null;
  match_subcategory?: string | null;
  match_submitter_role?: string | null;
  match_priority?: string | null;
  assign_to_user_id: string;
}

export interface UpdateRoutingRuleInput {
  name?: string;
  is_active?: boolean;
  match_category?: string | null;
  match_subcategory?: string | null;
  match_submitter_role?: string | null;
  match_priority?: string | null;
  assign_to_user_id?: string;
  /**
   * Optimistic-lock token: the `updated_at` the caller last read. When
   * provided, the update only applies if the row still has that timestamp;
   * otherwise it returns `{ conflict: true }`. Omit for last-write-wins.
   */
  expectedUpdatedAt?: string;
}

export interface RoutingRuleContext {
  actorId: string;
  companyId: string;
}

function mapRule(row: RoutingRuleRow): RequestRoutingRule {
  return {
    id: row.id,
    company_id: row.company_id,
    name: row.name,
    is_active: row.is_active,
    sort_order: row.sort_order,
    match_category: row.match_category,
    match_subcategory: row.match_subcategory,
    match_submitter_role: row.match_submitter_role,
    match_priority: row.match_priority,
    assign_to_user_id: row.assign_to_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
  };
}

/**
 * Confirms `userId` is an active profile in `companyId` whose role can
 * actually own tickets (i.e. holds a PORTAL_QUEUE_ROLES grant). Used to
 * guard rule mutations against accidentally pinning a stale or unprivileged
 * user as the assignee. A `null`/empty input returns `false`; a DB failure
 * also returns `false` so the caller fails closed.
 */
async function isValidAssignee(companyId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, status, portal_access_only')
    .eq('company_id', companyId)
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return false;
  const profile = data as { role: string; status: string; portal_access_only: boolean };
  if (profile.status !== 'active') return false;
  return canManagePortalQueue(profile);
}

/**
 * Bulk variant used by evaluateRoutingRules at ticket-creation time so we
 * pay a single round-trip even when many rules might match. Returns the set
 * of user ids in the company that are currently safe to auto-assign to.
 */
async function fetchValidAssigneeIds(companyId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, status, portal_access_only')
    .eq('company_id', companyId)
    .eq('status', 'active');
  if (error || !data) return new Set();
  const ids = (data as Array<{ id: string; role: string; status: string; portal_access_only: boolean }>)
    .filter((profile) => canManagePortalQueue(profile))
    .map((profile) => profile.id);
  return new Set(ids);
}

export async function listRoutingRules(
  companyId: string,
): Promise<{ data: RequestRoutingRule[]; error: string | null }> {
  const { data, error } = await supabase.from('request_routing_rules')
    .select('*')
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true });
  if (error) return { data: [], error: (error as { message: string }).message };
  return { data: ((data ?? []) as RoutingRuleRow[]).map(mapRule), error: null };
}

export async function createRoutingRule(
  input: CreateRoutingRuleInput,
  context: RoutingRuleContext,
): Promise<{ data: RequestRoutingRule | null; error: string | null }> {
  // Refuse to create a rule pinned to a user who can't actually own a ticket —
  // would otherwise produce silent routing failures at evaluation time.
  if (!(await isValidAssignee(context.companyId, input.assign_to_user_id))) {
    return {
      data: null,
      error: 'The selected assignee is no longer active or does not have queue access.',
    };
  }

  const { data: tail } = await supabase.from('request_routing_rules')
    .select('sort_order')
    .eq('company_id', context.companyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((tail as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await supabase.from('request_routing_rules')
    .insert({
      company_id: context.companyId,
      name: input.name.trim(),
      is_active: true,
      sort_order: nextOrder,
      match_category: input.match_category ?? null,
      match_subcategory: input.match_subcategory ?? null,
      match_submitter_role: input.match_submitter_role ?? null,
      match_priority: input.match_priority ?? null,
      assign_to_user_id: input.assign_to_user_id,
      created_by: context.actorId,
    })
    .select('*')
    .single();
  if (error) return { data: null, error: (error as { message: string }).message };

  const rule = mapRule(data as RoutingRuleRow);
  void logUserAction(context.actorId, 'create', 'request_routing_rule', rule.id, {
    component: 'RequestRoutingService',
    name: rule.name,
    match_category: rule.match_category,
    match_subcategory: rule.match_subcategory,
    match_submitter_role: rule.match_submitter_role,
    match_priority: rule.match_priority,
    assign_to_user_id: rule.assign_to_user_id,
  });

  return { data: rule, error: null };
}

export async function updateRoutingRule(
  ruleId: string,
  input: UpdateRoutingRuleInput,
  context: RoutingRuleContext,
): Promise<ConfigMutationResult<RequestRoutingRule>> {
  // Same guard as createRoutingRule, applied only when the caller is touching
  // the assignee field — leaves status/match-condition-only updates untouched.
  if (
    input.assign_to_user_id !== undefined
    && !(await isValidAssignee(context.companyId, input.assign_to_user_id))
  ) {
    return {
      data: null,
      error: 'The selected assignee is no longer active or does not have queue access.',
    };
  }

  const { expectedUpdatedAt } = input;

  const patch: RoutingRuleUpdate = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.match_category !== undefined) patch.match_category = input.match_category;
  if (input.match_subcategory !== undefined) patch.match_subcategory = input.match_subcategory;
  if (input.match_submitter_role !== undefined) patch.match_submitter_role = input.match_submitter_role;
  if (input.match_priority !== undefined) patch.match_priority = input.match_priority;
  if (input.assign_to_user_id !== undefined) patch.assign_to_user_id = input.assign_to_user_id;

  // Snapshot prior state for the audit trail.
  const { data: beforeRow } = await supabase.from('request_routing_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('company_id', context.companyId)
    .maybeSingle();
  const before = beforeRow ? mapRule(beforeRow as RoutingRuleRow) : null;

  let query = supabase.from('request_routing_rules')
    .update(patch)
    .eq('id', ruleId)
    .eq('company_id', context.companyId);
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);

  const { data, error } = await query.select('*').maybeSingle();
  if (error) return { data: null, error: (error as { message: string }).message };
  if (!data) {
    return expectedUpdatedAt
      ? { data: null, error: OPTIMISTIC_CONFLICT_MESSAGE, conflict: true }
      : { data: null, error: 'Rule not found.' };
  }

  const rule = mapRule(data as RoutingRuleRow);
  // Log the changed fields with their before/after so the audit trail records
  // intent and prior state rather than the full row.
  void logUserAction(context.actorId, 'update', 'request_routing_rule', ruleId, {
    component: 'RequestRoutingService',
    ...buildAuditDiff(before as unknown as Record<string, unknown>, patch as Record<string, unknown>),
  });

  return { data: rule, error: null };
}

export async function deleteRoutingRule(
  ruleId: string,
  context: RoutingRuleContext,
  expectedUpdatedAt?: string,
): Promise<ConfigDeleteResult> {
  const { data: beforeRow } = await supabase.from('request_routing_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('company_id', context.companyId)
    .maybeSingle();
  const before = beforeRow ? mapRule(beforeRow as RoutingRuleRow) : null;

  let query = supabase.from('request_routing_rules')
    .delete()
    .eq('id', ruleId)
    .eq('company_id', context.companyId);
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);

  const { data: deletedRows, error } = await query.select('id');
  if (error) return { error: (error as { message: string }).message };
  if (expectedUpdatedAt && (!deletedRows || (deletedRows as unknown[]).length === 0)) {
    return { error: OPTIMISTIC_CONFLICT_MESSAGE, conflict: true };
  }

  void logUserAction(context.actorId, 'delete', 'request_routing_rule', ruleId, {
    component: 'RequestRoutingService',
    before: before ? { name: before.name, assign_to_user_id: before.assign_to_user_id } : undefined,
  });

  return { error: null };
}

export async function moveRoutingRule(
  ruleId: string,
  direction: 'up' | 'down',
  context: RoutingRuleContext,
): Promise<{ error: string | null }> {
  const { data: rules, error } = await listRoutingRules(context.companyId);
  if (error) return { error };

  const currentIndex = rules.findIndex((r) => r.id === ruleId);
  if (currentIndex === -1) return { error: 'Rule not found.' };

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= rules.length) return { error: null };

  const current = rules[currentIndex];
  const target = rules[targetIndex];
  const timestamp = new Date().toISOString();

  const { error: e1 } = await supabase.from('request_routing_rules')
    .update({ sort_order: target.sort_order, updated_at: timestamp })
    .eq('id', current.id)
    .eq('company_id', context.companyId);
  if (e1) return { error: (e1 as { message: string }).message };

  const { error: e2 } = await supabase.from('request_routing_rules')
    .update({ sort_order: current.sort_order, updated_at: timestamp })
    .eq('id', target.id)
    .eq('company_id', context.companyId);
  if (e2) return { error: (e2 as { message: string }).message };

  void logUserAction(context.actorId, 'update', 'request_routing_rule', ruleId, {
    component: 'RequestRoutingService',
    move: direction,
    swappedWith: target.id,
  });

  return { error: null };
}

/**
 * Persist an arbitrary new evaluation order (e.g. from drag-and-drop) by
 * writing `sort_order = index` for each id. App-layer like {@link moveRoutingRule}.
 */
export async function reorderRoutingRules(
  orderedIds: string[],
  context: RoutingRuleContext,
): Promise<{ error: string | null }> {
  const timestamp = new Date().toISOString();
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('request_routing_rules')
        .update({ sort_order: index, updated_at: timestamp })
        .eq('id', id)
        .eq('company_id', context.companyId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { error: (failed.error as { message: string }).message };

  void logUserAction(context.actorId, 'update', 'request_routing_rule', orderedIds[0] ?? '', {
    component: 'RequestRoutingService',
    reorder: orderedIds.length,
  });

  return { error: null };
}

/**
 * Evaluate routing rules in priority order.
 * Returns the assign_to_user_id of the first active matching rule, or null.
 * Gracefully returns null if rules cannot be loaded (ticket is still created unassigned).
 */
export async function evaluateRoutingRules(
  companyId: string,
  ticket: {
    category: string;
    subcategory: string | null;
    priority: string;
    submitterRole: string | null;
  },
): Promise<string | null> {
  try {
    const { data: rules, error } = await listRoutingRules(companyId);
    if (error) return null;

    // Bulk-load the set of users who can currently own a ticket so a rule
    // pinned to a deactivated or repurposed user falls through to the next
    // matching rule instead of silently assigning a ghost owner. One round
    // trip per ticket creation regardless of rule count.
    const validAssigneeIds = await fetchValidAssigneeIds(companyId);

    for (const rule of rules) {
      if (!rule.is_active) continue;
      if (rule.match_category && rule.match_category !== ticket.category) continue;
      if (rule.match_subcategory && rule.match_subcategory !== (ticket.subcategory ?? null)) continue;
      if (rule.match_priority && rule.match_priority !== ticket.priority) continue;
      if (rule.match_submitter_role && rule.match_submitter_role !== ticket.submitterRole) continue;
      if (!validAssigneeIds.has(rule.assign_to_user_id)) continue;
      return rule.assign_to_user_id;
    }
  } catch {
    // DB unavailable — degrade gracefully; ticket is created unassigned
  }
  return null;
}
