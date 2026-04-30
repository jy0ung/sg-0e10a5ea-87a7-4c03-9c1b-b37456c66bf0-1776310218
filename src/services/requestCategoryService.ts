import { supabase } from '@/integrations/supabase/client';
import { buildRequestCategoryKey } from '@/lib/requestCategories';
import { logUserAction } from './auditService';

export interface RequestCategoryRecord {
  id: string;
  company_id: string;
  key: string;
  label: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

interface RequestCategoryRow {
  id: string;
  company_id: string;
  category_key: string;
  label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface RequestCategoryContext {
  actorId: string;
  companyId: string;
}

export interface CreateRequestCategoryInput {
  label: string;
  description?: string;
}

export interface UpdateRequestCategoryInput {
  label?: string;
  description?: string;
  is_active?: boolean;
}

export interface ListRequestCategoriesOptions {
  includeInactive?: boolean;
}

function mapRequestCategory(row: RequestCategoryRow): RequestCategoryRecord {
  return {
    id: row.id,
    company_id: row.company_id,
    key: row.category_key,
    label: row.label,
    description: row.description ?? '',
    is_active: row.is_active,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

function normalizeDescription(description?: string) {
  return description?.trim() ?? '';
}

async function fetchRequestCategories(companyId: string, includeInactive = false) {
  let query = supabase
    .from('request_categories')
    .select('id, company_id, category_key, label, description, is_active, sort_order, created_at, updated_at, updated_by')
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) return { data: [] as RequestCategoryRecord[], error: error.message };
  return {
    data: ((data ?? []) as RequestCategoryRow[]).map(mapRequestCategory),
    error: null,
  };
}

export async function listRequestCategories(
  companyId: string,
  options: ListRequestCategoriesOptions = {},
) {
  return fetchRequestCategories(companyId, options.includeInactive ?? false);
}

export async function createRequestCategory(
  input: CreateRequestCategoryInput,
  context: RequestCategoryContext,
) {
  const label = input.label.trim();
  if (!label) return { data: null, error: 'Category name is required.' };

  const normalizedKey = buildRequestCategoryKey(label);
  const { data: existingCategories, error: existingError } = await fetchRequestCategories(context.companyId, true);
  if (existingError) return { data: null, error: existingError };

  if (existingCategories.some((category) => category.key === normalizedKey)) {
    return { data: null, error: 'A category with this name already exists.' };
  }

  const nextSortOrder = (existingCategories.at(-1)?.sort_order ?? 0) + 10;
  const { data, error } = await supabase
    .from('request_categories')
    .insert({
      company_id: context.companyId,
      category_key: normalizedKey,
      label,
      description: normalizeDescription(input.description),
      is_active: true,
      sort_order: nextSortOrder,
      updated_by: context.actorId,
    })
    .select('id, company_id, category_key, label, description, is_active, sort_order, created_at, updated_at, updated_by')
    .single();

  if (error) return { data: null, error: error.message };

  void logUserAction(context.actorId, 'create', 'request_category', data.id, {
    component: 'RequestCategoryService',
    category_key: normalizedKey,
  });

  return { data: mapRequestCategory(data as RequestCategoryRow), error: null };
}

export async function updateRequestCategory(
  categoryId: string,
  input: UpdateRequestCategoryInput,
  context: RequestCategoryContext,
) {
  if (input.label !== undefined) {
    const nextLabel = input.label.trim();
    const nextLabelKey = buildRequestCategoryKey(nextLabel);
    const { data: existingCategories, error: existingError } = await fetchRequestCategories(context.companyId, true);
    if (existingError) return { data: null, error: existingError };
    if (existingCategories.some((category) => category.id !== categoryId && buildRequestCategoryKey(category.label) === nextLabelKey)) {
      return { data: null, error: 'A category with this name already exists.' };
    }
  }

  const patch: Record<string, unknown> = {
    updated_by: context.actorId,
  };

  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) return { data: null, error: 'Category name is required.' };
    patch.label = label;
  }
  if (input.description !== undefined) {
    patch.description = normalizeDescription(input.description);
  }
  if (input.is_active !== undefined) {
    patch.is_active = input.is_active;
  }

  const { data, error } = await supabase
    .from('request_categories')
    .update(patch)
    .eq('id', categoryId)
    .eq('company_id', context.companyId)
    .select('id, company_id, category_key, label, description, is_active, sort_order, created_at, updated_at, updated_by')
    .single();

  if (error) return { data: null, error: error.message };

  void logUserAction(context.actorId, 'update', 'request_category', categoryId, {
    component: 'RequestCategoryService',
    fieldCount: Object.keys(patch).length,
  });

  return { data: mapRequestCategory(data as RequestCategoryRow), error: null };
}

export async function moveRequestCategory(
  categoryId: string,
  direction: 'up' | 'down',
  context: RequestCategoryContext,
) {
  const { data: categories, error } = await fetchRequestCategories(context.companyId, true);
  if (error) return { error };

  const currentIndex = categories.findIndex((category) => category.id === categoryId);
  if (currentIndex === -1) return { error: 'Category not found.' };

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= categories.length) {
    return { error: null };
  }

  const current = categories[currentIndex];
  const target = categories[targetIndex];
  const timestamp = new Date().toISOString();

  const { error: currentError } = await supabase
    .from('request_categories')
    .update({ sort_order: target.sort_order, updated_by: context.actorId, updated_at: timestamp })
    .eq('id', current.id)
    .eq('company_id', context.companyId);
  if (currentError) return { error: currentError.message };

  const { error: targetError } = await supabase
    .from('request_categories')
    .update({ sort_order: current.sort_order, updated_by: context.actorId, updated_at: timestamp })
    .eq('id', target.id)
    .eq('company_id', context.companyId);
  if (targetError) return { error: targetError.message };

  void logUserAction(context.actorId, 'update', 'request_category', categoryId, {
    component: 'RequestCategoryService',
    move: direction,
  });

  return { error: null };
}