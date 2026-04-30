import { supabase } from '@/integrations/supabase/client';
import { buildRequestSubcategoryKey } from '@/lib/requestSubcategories';
import { logUserAction } from './auditService';

export interface RequestSubcategoryRecord {
  id: string;
  company_id: string;
  category_key: string;
  key: string;
  label: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

interface RequestSubcategoryRow {
  id: string;
  company_id: string;
  category_key: string;
  subcategory_key: string;
  label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface RequestSubcategoryContext {
  actorId: string;
  companyId: string;
}

export interface CreateRequestSubcategoryInput {
  categoryKey: string;
  label: string;
  description?: string;
}

export interface UpdateRequestSubcategoryInput {
  label?: string;
  description?: string;
  is_active?: boolean;
}

export interface ListRequestSubcategoriesOptions {
  includeInactive?: boolean;
  categoryKey?: string;
}

function mapRequestSubcategory(row: RequestSubcategoryRow): RequestSubcategoryRecord {
  return {
    id: row.id,
    company_id: row.company_id,
    category_key: row.category_key,
    key: row.subcategory_key,
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

// Keep the generated-type escape hatch isolated to this service.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requestSubcategoriesTable(): any {
  return supabase.from('request_subcategories' as never);
}

async function fetchRequestSubcategories(
  companyId: string,
  options: ListRequestSubcategoriesOptions = {},
) {
  let query = requestSubcategoriesTable()
    .select('id, company_id, category_key, subcategory_key, label, description, is_active, sort_order, created_at, updated_at, updated_by')
    .eq('company_id', companyId)
    .order('category_key', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (options.categoryKey) {
    query = query.eq('category_key', options.categoryKey);
  }

  if (!options.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) return { data: [] as RequestSubcategoryRecord[], error: error.message };

  return {
    data: ((data ?? []) as RequestSubcategoryRow[]).map(mapRequestSubcategory),
    error: null,
  };
}

export async function listRequestSubcategories(
  companyId: string,
  options: ListRequestSubcategoriesOptions = {},
) {
  return fetchRequestSubcategories(companyId, options);
}

export async function createRequestSubcategory(
  input: CreateRequestSubcategoryInput,
  context: RequestSubcategoryContext,
) {
  const categoryKey = input.categoryKey.trim();
  const label = input.label.trim();

  if (!categoryKey) return { data: null, error: 'Parent category is required.' };
  if (!label) return { data: null, error: 'Subcategory name is required.' };

  const normalizedKey = buildRequestSubcategoryKey(label);
  const { data: existingSubcategories, error: existingError } = await fetchRequestSubcategories(
    context.companyId,
    { categoryKey, includeInactive: true },
  );
  if (existingError) return { data: null, error: existingError };

  if (existingSubcategories.some((subcategory) => subcategory.key === normalizedKey)) {
    return { data: null, error: 'A subcategory with this name already exists in this category.' };
  }

  const nextSortOrder = (existingSubcategories.at(-1)?.sort_order ?? 0) + 10;
  const { data, error } = await requestSubcategoriesTable()
    .insert({
      company_id: context.companyId,
      category_key: categoryKey,
      subcategory_key: normalizedKey,
      label,
      description: normalizeDescription(input.description),
      is_active: true,
      sort_order: nextSortOrder,
      updated_by: context.actorId,
    })
    .select('id, company_id, category_key, subcategory_key, label, description, is_active, sort_order, created_at, updated_at, updated_by')
    .single();

  if (error) return { data: null, error: error.message };

  void logUserAction(context.actorId, 'create', 'request_subcategory', data.id, {
    component: 'RequestSubcategoryService',
    category_key: categoryKey,
    subcategory_key: normalizedKey,
  });

  return { data: mapRequestSubcategory(data as RequestSubcategoryRow), error: null };
}

export async function updateRequestSubcategory(
  subcategoryId: string,
  input: UpdateRequestSubcategoryInput,
  context: RequestSubcategoryContext,
) {
  const { data: existingSubcategories, error: existingError } = await fetchRequestSubcategories(
    context.companyId,
    { includeInactive: true },
  );
  if (existingError) return { data: null, error: existingError };

  const currentSubcategory = existingSubcategories.find((subcategory) => subcategory.id === subcategoryId);
  if (!currentSubcategory) return { data: null, error: 'Subcategory not found.' };

  if (input.label !== undefined) {
    const nextLabel = input.label.trim();
    const nextLabelKey = buildRequestSubcategoryKey(nextLabel);
    if (
      existingSubcategories.some(
        (subcategory) => subcategory.id !== subcategoryId
          && subcategory.category_key === currentSubcategory.category_key
          && buildRequestSubcategoryKey(subcategory.label) === nextLabelKey,
      )
    ) {
      return { data: null, error: 'A subcategory with this name already exists in this category.' };
    }
  }

  const patch: Record<string, unknown> = {
    updated_by: context.actorId,
  };

  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) return { data: null, error: 'Subcategory name is required.' };
    patch.label = label;
  }

  if (input.description !== undefined) {
    patch.description = normalizeDescription(input.description);
  }

  if (input.is_active !== undefined) {
    patch.is_active = input.is_active;
  }

  const { data, error } = await requestSubcategoriesTable()
    .update(patch)
    .eq('id', subcategoryId)
    .eq('company_id', context.companyId)
    .select('id, company_id, category_key, subcategory_key, label, description, is_active, sort_order, created_at, updated_at, updated_by')
    .single();

  if (error) return { data: null, error: error.message };

  void logUserAction(context.actorId, 'update', 'request_subcategory', subcategoryId, {
    component: 'RequestSubcategoryService',
    fieldCount: Object.keys(patch).length,
  });

  return { data: mapRequestSubcategory(data as RequestSubcategoryRow), error: null };
}

export async function moveRequestSubcategory(
  subcategoryId: string,
  direction: 'up' | 'down',
  context: RequestSubcategoryContext,
) {
  const { data: subcategories, error } = await fetchRequestSubcategories(context.companyId, {
    includeInactive: true,
  });
  if (error) return { error };

  const current = subcategories.find((subcategory) => subcategory.id === subcategoryId);
  if (!current) return { error: 'Subcategory not found.' };

  const siblings = subcategories.filter((subcategory) => subcategory.category_key === current.category_key);
  const currentIndex = siblings.findIndex((subcategory) => subcategory.id === subcategoryId);
  if (currentIndex === -1) return { error: 'Subcategory not found.' };

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= siblings.length) {
    return { error: null };
  }

  const target = siblings[targetIndex];
  const timestamp = new Date().toISOString();

  const { error: currentError } = await requestSubcategoriesTable()
    .update({ sort_order: target.sort_order, updated_by: context.actorId, updated_at: timestamp })
    .eq('id', current.id)
    .eq('company_id', context.companyId);
  if (currentError) return { error: currentError.message };

  const { error: targetError } = await requestSubcategoriesTable()
    .update({ sort_order: current.sort_order, updated_by: context.actorId, updated_at: timestamp })
    .eq('id', target.id)
    .eq('company_id', context.companyId);
  if (targetError) return { error: targetError.message };

  void logUserAction(context.actorId, 'update', 'request_subcategory', subcategoryId, {
    component: 'RequestSubcategoryService',
    move: direction,
  });

  return { error: null };
}