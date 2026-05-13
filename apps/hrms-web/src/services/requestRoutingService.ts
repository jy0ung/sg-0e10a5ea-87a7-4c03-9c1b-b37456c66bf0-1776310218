import { supabase } from '@/integrations/supabase/client';

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
}

export interface RoutingRuleContext {
  actorId: string;
  companyId: string;
}

// The request_routing_rules table is not yet in the generated Database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function routingRulesTable(): any {
  return supabase.from('request_routing_rules' as never);
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

export async function listRoutingRules(
  companyId: string,
): Promise<{ data: RequestRoutingRule[]; error: string | null }> {
  const { data, error } = await routingRulesTable()
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
  const { data: tail } = await routingRulesTable()
    .select('sort_order')
    .eq('company_id', context.companyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((tail as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await routingRulesTable()
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
  return { data: mapRule(data as RoutingRuleRow), error: null };
}

export async function updateRoutingRule(
  ruleId: string,
  input: UpdateRoutingRuleInput,
  context: RoutingRuleContext,
): Promise<{ data: RequestRoutingRule | null; error: string | null }> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.match_category !== undefined) patch.match_category = input.match_category;
  if (input.match_subcategory !== undefined) patch.match_subcategory = input.match_subcategory;
  if (input.match_submitter_role !== undefined) patch.match_submitter_role = input.match_submitter_role;
  if (input.match_priority !== undefined) patch.match_priority = input.match_priority;
  if (input.assign_to_user_id !== undefined) patch.assign_to_user_id = input.assign_to_user_id;

  const { data, error } = await routingRulesTable()
    .update(patch)
    .eq('id', ruleId)
    .eq('company_id', context.companyId)
    .select('*')
    .single();
  if (error) return { data: null, error: (error as { message: string }).message };
  return { data: mapRule(data as RoutingRuleRow), error: null };
}

export async function deleteRoutingRule(
  ruleId: string,
  context: RoutingRuleContext,
): Promise<{ error: string | null }> {
  const { error } = await routingRulesTable()
    .delete()
    .eq('id', ruleId)
    .eq('company_id', context.companyId);
  if (error) return { error: (error as { message: string }).message };
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

  const { error: e1 } = await routingRulesTable()
    .update({ sort_order: target.sort_order, updated_at: timestamp })
    .eq('id', current.id)
    .eq('company_id', context.companyId);
  if (e1) return { error: (e1 as { message: string }).message };

  const { error: e2 } = await routingRulesTable()
    .update({ sort_order: current.sort_order, updated_at: timestamp })
    .eq('id', target.id)
    .eq('company_id', context.companyId);
  if (e2) return { error: (e2 as { message: string }).message };

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
    for (const rule of rules) {
      if (!rule.is_active) continue;
      if (rule.match_category && rule.match_category !== ticket.category) continue;
      if (rule.match_subcategory && rule.match_subcategory !== (ticket.subcategory ?? null)) continue;
      if (rule.match_priority && rule.match_priority !== ticket.priority) continue;
      if (rule.match_submitter_role && rule.match_submitter_role !== ticket.submitterRole) continue;
      return rule.assign_to_user_id;
    }
  } catch {
    // DB unavailable — degrade gracefully; ticket is created unassigned
  }
  return null;
}
