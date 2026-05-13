import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from './auditService';

export type TemplatePriority = 'low' | 'medium' | 'high';

export interface RequestTemplateRecord {
  id: string;
  company_id: string;
  name: string;
  description: string;
  category_key: string;
  subcategory_key: string | null;
  priority: TemplatePriority;
  subject: string;
  body: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

interface RequestTemplateRow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  category_key: string;
  subcategory_key: string | null;
  priority: string;
  subject: string;
  body: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface RequestTemplateContext {
  actorId: string;
  companyId: string;
}

export interface CreateRequestTemplateInput {
  name: string;
  description?: string;
  category_key: string;
  subcategory_key?: string | null;
  priority: TemplatePriority;
  subject: string;
  body: string;
}

export interface UpdateRequestTemplateInput {
  name?: string;
  description?: string;
  category_key?: string;
  subcategory_key?: string | null;
  priority?: TemplatePriority;
  subject?: string;
  body?: string;
  is_active?: boolean;
}

export interface ListRequestTemplatesOptions {
  includeInactive?: boolean;
}

// The request_templates table is not yet in the generated Database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requestTemplatesTable(): any {
  return supabase.from('request_templates' as never);
}

function mapRequestTemplate(row: RequestTemplateRow): RequestTemplateRecord {
  return {
    id: row.id,
    company_id: row.company_id,
    name: row.name,
    description: row.description ?? '',
    category_key: row.category_key,
    subcategory_key: row.subcategory_key,
    priority: (row.priority as TemplatePriority) ?? 'medium',
    subject: row.subject,
    body: row.body,
    is_active: row.is_active,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

const SELECT_COLS =
  'id, company_id, name, description, category_key, subcategory_key, priority, subject, body, is_active, sort_order, created_at, updated_at, updated_by';

async function fetchRequestTemplates(companyId: string, includeInactive = false) {
  let query = requestTemplatesTable()
    .select(SELECT_COLS)
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) return { data: [] as RequestTemplateRecord[], error: error.message as string };
  return {
    data: ((data ?? []) as RequestTemplateRow[]).map(mapRequestTemplate),
    error: null,
  };
}

export async function listRequestTemplates(
  companyId: string,
  options: ListRequestTemplatesOptions = {},
) {
  return fetchRequestTemplates(companyId, options.includeInactive ?? false);
}

export async function createRequestTemplate(
  input: CreateRequestTemplateInput,
  context: RequestTemplateContext,
) {
  const name = input.name.trim();
  if (!name) return { data: null, error: 'Template name is required.' };
  if (!input.category_key) return { data: null, error: 'Category is required.' };
  if (!input.subject.trim()) return { data: null, error: 'Subject is required.' };
  if (!input.body.trim()) return { data: null, error: 'Body is required.' };

  const maxSortResult = await requestTemplatesTable()
    .select('sort_order')
    .eq('company_id', context.companyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder =
    ((maxSortResult.data as { sort_order: number } | null)?.sort_order ?? 0) + 10;

  const { data, error } = await requestTemplatesTable()
    .insert({
      company_id: context.companyId,
      name,
      description: input.description?.trim() ?? '',
      category_key: input.category_key,
      subcategory_key: input.subcategory_key ?? null,
      priority: input.priority,
      subject: input.subject.trim(),
      body: input.body.trim(),
      is_active: true,
      sort_order: nextSortOrder,
      updated_by: context.actorId,
    })
    .select(SELECT_COLS)
    .single();

  if (error) return { data: null, error: error.message as string };

  void logUserAction(context.actorId, 'create', 'request_template', (data as RequestTemplateRow).id, {
    component: 'RequestTemplateService',
  });

  return { data: mapRequestTemplate(data as RequestTemplateRow), error: null };
}

export async function updateRequestTemplate(
  templateId: string,
  input: UpdateRequestTemplateInput,
  context: RequestTemplateContext,
) {
  const patch: Record<string, unknown> = { updated_by: context.actorId };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { data: null, error: 'Template name is required.' };
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.category_key !== undefined) patch.category_key = input.category_key;
  if ('subcategory_key' in input) patch.subcategory_key = input.subcategory_key ?? null;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.subject !== undefined) {
    const subject = input.subject.trim();
    if (!subject) return { data: null, error: 'Subject is required.' };
    patch.subject = subject;
  }
  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body) return { data: null, error: 'Body is required.' };
    patch.body = body;
  }
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await requestTemplatesTable()
    .update(patch)
    .eq('id', templateId)
    .eq('company_id', context.companyId)
    .select(SELECT_COLS)
    .single();

  if (error) return { data: null, error: error.message as string };

  void logUserAction(context.actorId, 'update', 'request_template', templateId, {
    component: 'RequestTemplateService',
  });

  return { data: mapRequestTemplate(data as RequestTemplateRow), error: null };
}

export async function moveRequestTemplate(
  templateId: string,
  direction: 'up' | 'down',
  context: RequestTemplateContext,
) {
  const { data: all, error: fetchError } = await requestTemplatesTable()
    .select('id, sort_order')
    .eq('company_id', context.companyId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (fetchError) return { error: fetchError.message as string };

  const rows = (all ?? []) as Array<{ id: string; sort_order: number }>;
  const idx = rows.findIndex((r) => r.id === templateId);
  if (idx === -1) return { error: 'Template not found.' };

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return { error: null };

  const current = rows[idx];
  const swap = rows[swapIdx];

  const { error: e1 } = await requestTemplatesTable()
    .update({ sort_order: swap.sort_order, updated_by: context.actorId })
    .eq('id', current.id)
    .eq('company_id', context.companyId);

  const { error: e2 } = await requestTemplatesTable()
    .update({ sort_order: current.sort_order, updated_by: context.actorId })
    .eq('id', swap.id)
    .eq('company_id', context.companyId);

  if (e1 ?? e2) return { error: ((e1 ?? e2)!.message) as string };

  return { error: null };
}

export async function deleteRequestTemplate(
  templateId: string,
  context: RequestTemplateContext,
) {
  const { error } = await requestTemplatesTable()
    .delete()
    .eq('id', templateId)
    .eq('company_id', context.companyId);

  if (error) return { error: error.message as string };

  void logUserAction(context.actorId, 'delete', 'request_template', templateId, {
    component: 'RequestTemplateService',
  });

  return { error: null };
}
