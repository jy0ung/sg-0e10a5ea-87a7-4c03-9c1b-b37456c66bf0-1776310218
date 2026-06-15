import { supabase } from '@flc/supabase';
import { buildRequestCategoryKey } from './requestCategories';
import { logUserAction } from '@flc/platform-services';
import {
  OPTIMISTIC_CONFLICT_MESSAGE,
  buildAuditDiff,
  type ConfigMutationResult,
} from './mutationSupport';

export interface RequestCategoryRecord {
  id: string;
  company_id: string;
  key: string;
  label: string;
  description: string;
  response_sla_hours: number | null;
  resolution_sla_hours: number | null;
  is_active: boolean;
  sort_order: number;
  approval_flow_id: string | null;
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
  response_sla_hours?: number | null;
  resolution_sla_hours?: number | null;
  is_active: boolean;
  sort_order: number;
  approval_flow_id?: string | null;
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
  response_sla_hours?: number | null;
  resolution_sla_hours?: number | null;
}

export interface UpdateRequestCategoryInput {
  label?: string;
  description?: string;
  response_sla_hours?: number | null;
  resolution_sla_hours?: number | null;
  is_active?: boolean;
  approval_flow_id?: string | null;
  /**
   * Optimistic-lock token: the `updated_at` value the caller last read. When
   * provided, the update only succeeds if the row still has that timestamp;
   * otherwise it returns `{ conflict: true }`. Omit to force last-write-wins.
   */
  expectedUpdatedAt?: string;
}

export interface ListRequestCategoriesOptions {
  includeInactive?: boolean;
}

const REQUEST_CATEGORY_SELECT = 'id, company_id, category_key, label, description, response_sla_hours, resolution_sla_hours, is_active, sort_order, approval_flow_id, created_at, updated_at, updated_by';
const LEGACY_REQUEST_CATEGORY_SELECT = 'id, company_id, category_key, label, description, is_active, sort_order, created_at, updated_at, updated_by';

function isMissingSlaColumnError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  return message.includes('response_sla_hours') || message.includes('resolution_sla_hours');
}

function normalizeSlaHours(value?: number | null) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Math.floor(value);
}

function mapRequestCategory(row: RequestCategoryRow): RequestCategoryRecord {
  return {
    id: row.id,
    company_id: row.company_id,
    key: row.category_key,
    label: row.label,
    description: row.description ?? '',
    response_sla_hours: row.response_sla_hours ?? null,
    resolution_sla_hours: row.resolution_sla_hours ?? null,
    is_active: row.is_active,
    sort_order: row.sort_order,
    approval_flow_id: row.approval_flow_id ?? null,
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
    .select(REQUEST_CATEGORY_SELECT)
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  let { data, error } = await query;
  if (error && isMissingSlaColumnError(error)) {
    let legacyQuery = supabase
      .from('request_categories')
      .select(LEGACY_REQUEST_CATEGORY_SELECT)
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });

    if (!includeInactive) {
      legacyQuery = legacyQuery.eq('is_active', true);
    }

    const legacyResult = await legacyQuery;
    data = legacyResult.data as typeof data;
    error = legacyResult.error;
  }
  if (error) return { data: [] as RequestCategoryRecord[], error: error.message };
  return {
    data: ((data ?? []) as unknown as RequestCategoryRow[]).map(mapRequestCategory),
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
  const insertPayload = {
    company_id: context.companyId,
    category_key: normalizedKey,
    label,
    description: normalizeDescription(input.description),
    response_sla_hours: normalizeSlaHours(input.response_sla_hours),
    resolution_sla_hours: normalizeSlaHours(input.resolution_sla_hours),
    is_active: true,
    sort_order: nextSortOrder,
    updated_by: context.actorId,
  };

  const { data, error } = await supabase
    .from('request_categories')
    .insert(insertPayload as never)
    .select(REQUEST_CATEGORY_SELECT)
    .single();

  if (error) return { data: null, error: error.message };

  const row = data as unknown as RequestCategoryRow;
  void logUserAction(context.actorId, 'create', 'request_category', row.id, {
    component: 'RequestCategoryService',
    category_key: normalizedKey,
  });

  return { data: mapRequestCategory(row), error: null };
}

export async function updateRequestCategory(
  categoryId: string,
  input: UpdateRequestCategoryInput,
  context: RequestCategoryContext,
): Promise<ConfigMutationResult<RequestCategoryRecord>> {
  const { expectedUpdatedAt } = input;

  // One round trip serves two purposes: the `before` snapshot for the audit
  // trail and the rename-collision check below.
  const { data: existingCategories, error: existingError } = await fetchRequestCategories(context.companyId, true);
  if (existingError) return { data: null, error: existingError };
  const before = existingCategories.find((category) => category.id === categoryId) ?? null;

  if (input.label !== undefined) {
    const nextLabelKey = buildRequestCategoryKey(input.label.trim());
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
  if (input.response_sla_hours !== undefined) {
    patch.response_sla_hours = normalizeSlaHours(input.response_sla_hours);
  }
  if (input.resolution_sla_hours !== undefined) {
    patch.resolution_sla_hours = normalizeSlaHours(input.resolution_sla_hours);
  }
  if (input.is_active !== undefined) {
    patch.is_active = input.is_active;
  }
  if ('approval_flow_id' in input) {
    patch.approval_flow_id = input.approval_flow_id ?? null;
  }

  let query = supabase
    .from('request_categories')
    .update(patch as never)
    .eq('id', categoryId)
    .eq('company_id', context.companyId);
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);

  const { data, error } = await query.select(REQUEST_CATEGORY_SELECT).maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) {
    return expectedUpdatedAt
      ? { data: null, error: OPTIMISTIC_CONFLICT_MESSAGE, conflict: true }
      : { data: null, error: 'Category not found.' };
  }

  void logUserAction(context.actorId, 'update', 'request_category', categoryId, {
    component: 'RequestCategoryService',
    ...buildAuditDiff(before as unknown as Record<string, unknown>, patch),
  });

  return { data: mapRequestCategory(data as unknown as RequestCategoryRow), error: null };
}

export interface DeleteRequestCategoryResult {
  error: string | null;
  inUse?: boolean;
  conflict?: boolean;
}

/**
 * Deletes a request category if it is not referenced by any tickets or templates.
 * If the category is in use, returns { error: ..., inUse: true } — the caller
 * should offer deactivation instead.
 */
export async function deleteRequestCategory(
  categoryId: string,
  context: RequestCategoryContext,
  expectedUpdatedAt?: string,
): Promise<DeleteRequestCategoryResult> {
  // Fetch the category to get its key + label (label feeds the audit snapshot)
  const { data: categoryRow, error: fetchError } = await supabase
    .from('request_categories')
    .select('id, category_key, label')
    .eq('id', categoryId)
    .eq('company_id', context.companyId)
    .single();

  if (fetchError || !categoryRow) {
    return { error: 'Category not found.' };
  }

  const categoryKey = (categoryRow as { category_key: string }).category_key;
  const categoryLabel = (categoryRow as { label: string }).label;

  // Check ticket usage
  const { count: ticketCount, error: ticketError } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', context.companyId)
    .eq('category', categoryKey);

  if (ticketError) return { error: ticketError.message };

  if ((ticketCount ?? 0) > 0) {
    return { error: 'This category has been used in existing requests. Deactivate it instead.', inUse: true };
  }

  // Check template usage
  const { count: templateCount, error: templateError } = await supabase
    .from('request_templates')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', context.companyId)
    .eq('category_key', categoryKey);

  if (templateError) return { error: templateError.message };

  if ((templateCount ?? 0) > 0) {
    return { error: 'This category is used by one or more templates. Deactivate it instead.', inUse: true };
  }

  // Safe to hard-delete
  let deleteQuery = supabase
    .from('request_categories')
    .delete()
    .eq('id', categoryId)
    .eq('company_id', context.companyId);
  if (expectedUpdatedAt) deleteQuery = deleteQuery.eq('updated_at', expectedUpdatedAt);

  const { data: deletedRows, error: deleteError } = await deleteQuery.select('id');
  if (deleteError) return { error: deleteError.message };
  if (expectedUpdatedAt && (!deletedRows || deletedRows.length === 0)) {
    return { error: OPTIMISTIC_CONFLICT_MESSAGE, conflict: true };
  }

  void logUserAction(context.actorId, 'delete', 'request_category', categoryId, {
    component: 'RequestCategoryService',
    category_key: categoryKey,
    before: { label: categoryLabel, category_key: categoryKey },
  });

  return { error: null };
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