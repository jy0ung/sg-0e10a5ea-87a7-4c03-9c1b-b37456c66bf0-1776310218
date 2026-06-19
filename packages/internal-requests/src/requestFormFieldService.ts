import { supabase } from '@flc/supabase';
import { buildRequestCategoryKey } from './requestCategories';
import { logUserAction } from '@flc/platform-services';
import {
  OPTIMISTIC_CONFLICT_MESSAGE,
  buildAuditDiff,
  type ConfigDeleteResult,
  type ConfigMutationResult,
} from './mutationSupport';

/** Generated slug keys only ever contain [a-z0-9_]; reject anything else
 *  before it reaches a raw PostgREST filter string (filter-injection guard). */
const SLUG_KEY_PATTERN = /^[a-z0-9_]+$/;

export type RequestFormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'database_select'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'radio'
  | 'file';
export type RequestFieldDataSource = 'branches' | 'employees' | 'vehicles';

export interface RequestFormFieldOption {
  label: string;
  value: string;
}

export interface RequestFormFieldRecord {
  id: string;
  company_id: string;
  category_key: string;
  subcategory_key: string | null;
  key: string;
  label: string;
  field_type: RequestFormFieldType;
  data_source: RequestFieldDataSource | null;
  options: RequestFormFieldOption[];
  default_value: string;
  validation_rules: Record<string, unknown>;
  conditional_logic: Record<string, unknown>;
  placeholder: string;
  help_text: string;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

interface RequestFormFieldRow {
  id: string;
  company_id: string;
  category_key: string;
  subcategory_key: string | null;
  field_key: string;
  label: string;
  field_type: RequestFormFieldType;
  data_source: RequestFieldDataSource | null;
  options?: RequestFormFieldOption[] | null;
  default_value?: string | null;
  validation_rules?: Record<string, unknown> | null;
  conditional_logic?: Record<string, unknown> | null;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface RequestFormFieldContext {
  actorId: string;
  companyId: string;
}

export interface CreateRequestFormFieldInput {
  category_key: string;
  subcategory_key?: string | null;
  label: string;
  field_type: RequestFormFieldType;
  data_source?: RequestFieldDataSource | null;
  options?: RequestFormFieldOption[];
  default_value?: string;
  validation_rules?: Record<string, unknown>;
  conditional_logic?: Record<string, unknown>;
  placeholder?: string;
  help_text?: string;
  is_required?: boolean;
}

export interface UpdateRequestFormFieldInput {
  label?: string;
  field_type?: RequestFormFieldType;
  data_source?: RequestFieldDataSource | null;
  options?: RequestFormFieldOption[];
  default_value?: string;
  validation_rules?: Record<string, unknown>;
  conditional_logic?: Record<string, unknown>;
  placeholder?: string;
  help_text?: string;
  is_required?: boolean;
  is_active?: boolean;
  /**
   * Optimistic-lock token: the `updated_at` the caller last read. When
   * provided, the update only applies if the row still has that timestamp;
   * otherwise it returns `{ conflict: true }`. Omit for last-write-wins.
   */
  expectedUpdatedAt?: string;
}

export interface DatabaseFieldOption {
  value: string;
  label: string;
  description: string;
}

function requestFormFieldsTable() {
  return supabase.from('request_form_fields' as never);
}

function mapField(row: RequestFormFieldRow): RequestFormFieldRecord {
  const options = Array.isArray(row.options) ? row.options : [];
  return {
    id: row.id,
    company_id: row.company_id,
    category_key: row.category_key,
    subcategory_key: row.subcategory_key ?? null,
    key: row.field_key,
    label: row.label,
    field_type: row.field_type,
    data_source: row.data_source,
    options: options
      .filter((option): option is RequestFormFieldOption => Boolean(option && typeof option === 'object' && 'label' in option && 'value' in option))
      .map((option) => ({ label: String(option.label), value: String(option.value) })),
    default_value: row.default_value ?? '',
    validation_rules: row.validation_rules ?? {},
    conditional_logic: row.conditional_logic ?? {},
    placeholder: row.placeholder ?? '',
    help_text: row.help_text ?? '',
    is_required: row.is_required,
    is_active: row.is_active,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
  };
}


function normalizeFieldSource(fieldType: RequestFormFieldType, dataSource?: RequestFieldDataSource | null) {
  return fieldType === 'database_select' ? dataSource ?? 'branches' : null;
}

function normalizeFieldOptions(options?: RequestFormFieldOption[]) {
  return (options ?? [])
    .map((option) => ({
      label: option.label.trim(),
      value: option.value.trim() || option.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
    }))
    .filter((option) => option.label && option.value);
}

/**
 * True when a PostgREST error is about a missing `subcategory_key` column —
 * i.e. the target DB predates migration 20260528200000. Mirrors the
 * `isMissingSlaColumnError` resilience pattern in requestCategoryService so
 * the module degrades gracefully on a DB that is a migration or two behind
 * (category-level fields keep working) instead of hard-failing.
 */
function isMissingSubcategoryColumnError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return message.includes('subcategory_key');
}

export async function listRequestFormFields(
  companyId: string,
  options: { categoryKey?: string; subcategoryKey?: string; includeInactive?: boolean } = {},
): Promise<{ data: RequestFormFieldRecord[]; error: string | null }> {
  let query = requestFormFieldsTable()
    .select('*')
    .eq('company_id', companyId)
    .order('category_key', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (options.categoryKey) query = query.eq('category_key', options.categoryKey);
  // When a subcategory is selected, surface category-level fields (NULL
  // subcategory_key) alongside fields scoped to that subcategory.
  if (options.subcategoryKey) {
    // The value is interpolated into a raw PostgREST .or() filter, so reject
    // anything that isn't a clean slug to prevent filter injection (a value
    // containing ',' or ')' could otherwise alter the filter semantics).
    if (!SLUG_KEY_PATTERN.test(options.subcategoryKey)) {
      return { data: [], error: 'Invalid subcategory key.' };
    }
    query = query.or(`subcategory_key.is.null,subcategory_key.eq.${options.subcategoryKey}`);
  }
  if (!options.includeInactive) query = query.eq('is_active', true);

  let { data, error } = await query;
  if (error && options.subcategoryKey && isMissingSubcategoryColumnError(error)) {
    // Target DB predates the subcategory_key column. Before that migration every
    // field is category-level, so drop the subcategory predicate and return the
    // category's fields (mapField defaults the missing column to null).
    let legacy = requestFormFieldsTable()
      .select('*')
      .eq('company_id', companyId)
      .order('category_key', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });
    if (options.categoryKey) legacy = legacy.eq('category_key', options.categoryKey);
    if (!options.includeInactive) legacy = legacy.eq('is_active', true);
    ({ data, error } = await legacy);
  }
  if (error) return { data: [], error: (error as { message: string }).message };
  return { data: ((data ?? []) as RequestFormFieldRow[]).map(mapField), error: null };
}

export async function createRequestFormField(
  input: CreateRequestFormFieldInput,
  context: RequestFormFieldContext,
): Promise<{ data: RequestFormFieldRecord | null; error: string | null }> {
  const label = input.label.trim();
  if (!label) return { data: null, error: 'Field label is required.' };

  const subcategoryKey = input.subcategory_key?.trim() || null;

  const { data: existingFields, error: existingError } = await listRequestFormFields(context.companyId, {
    categoryKey: input.category_key,
    includeInactive: true,
  });
  if (existingError) return { data: null, error: existingError };

  const fieldKey = buildRequestCategoryKey(label);
  if (existingFields.some((field) => field.key === fieldKey && (field.subcategory_key ?? null) === subcategoryKey)) {
    return { data: null, error: 'A field with this label already exists for the selected category.' };
  }

  const nextSortOrder = (existingFields.at(-1)?.sort_order ?? 0) + 10;
  const insertPayload: Record<string, unknown> = {
    company_id: context.companyId,
    category_key: input.category_key,
    subcategory_key: subcategoryKey,
    field_key: fieldKey,
    label,
    field_type: input.field_type,
    data_source: normalizeFieldSource(input.field_type, input.data_source),
    options: normalizeFieldOptions(input.options),
    default_value: input.default_value?.trim() ?? '',
    validation_rules: input.validation_rules ?? {},
    conditional_logic: input.conditional_logic ?? {},
    placeholder: input.placeholder?.trim() ?? '',
    help_text: input.help_text?.trim() ?? '',
    is_required: input.is_required ?? false,
    is_active: true,
    sort_order: nextSortOrder,
    created_by: context.actorId,
  };
  let { data, error } = await requestFormFieldsTable()
    .insert(insertPayload as never)
    .select('*')
    .single();

  if (error && isMissingSubcategoryColumnError(error)) {
    // Target DB predates the subcategory_key column (migration 20260528200000).
    if (subcategoryKey) {
      // Don't silently strip the requested scope — surface an actionable message.
      return {
        data: null,
        error: 'Subcategory-scoped fields require a pending database update. Create the field at the category level for now, or apply the latest migrations.',
      };
    }
    // Category-level field: retry without the not-yet-present column.
    const legacyPayload = { ...insertPayload };
    delete legacyPayload.subcategory_key;
    ({ data, error } = await requestFormFieldsTable()
      .insert(legacyPayload as never)
      .select('*')
      .single());
  }

  if (error) return { data: null, error: (error as { message: string }).message };
  const field = mapField(data as RequestFormFieldRow);
  void logUserAction(context.actorId, 'create', 'request_form_field', field.id, {
    component: 'RequestFormFieldService',
    field_key: field.key,
  });
  return { data: field, error: null };
}

export async function updateRequestFormField(
  fieldId: string,
  input: UpdateRequestFormFieldInput,
  context: RequestFormFieldContext,
): Promise<ConfigMutationResult<RequestFormFieldRecord>> {
  const { expectedUpdatedAt } = input;

  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) return { data: null, error: 'Field label is required.' };
    patch.label = label;
  }
  if (input.field_type !== undefined) patch.field_type = input.field_type;
  if (input.data_source !== undefined || input.field_type !== undefined) {
    patch.data_source = normalizeFieldSource(input.field_type ?? 'text', input.data_source);
  }
  if (input.options !== undefined) patch.options = normalizeFieldOptions(input.options);
  if (input.default_value !== undefined) patch.default_value = input.default_value.trim();
  if (input.validation_rules !== undefined) patch.validation_rules = input.validation_rules;
  if (input.conditional_logic !== undefined) patch.conditional_logic = input.conditional_logic;
  if (input.placeholder !== undefined) patch.placeholder = input.placeholder.trim();
  if (input.help_text !== undefined) patch.help_text = input.help_text.trim();
  if (input.is_required !== undefined) patch.is_required = input.is_required;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  // Snapshot the prior state for the audit trail before mutating.
  const { data: beforeRow } = await requestFormFieldsTable()
    .select('*')
    .eq('id', fieldId)
    .eq('company_id', context.companyId)
    .maybeSingle();
  const before = beforeRow ? mapField(beforeRow as RequestFormFieldRow) : null;

  let query = requestFormFieldsTable()
    .update(patch as never)
    .eq('id', fieldId)
    .eq('company_id', context.companyId);
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);

  const { data, error } = await query.select('*').maybeSingle();

  if (error) return { data: null, error: (error as { message: string }).message };
  if (!data) {
    return expectedUpdatedAt
      ? { data: null, error: OPTIMISTIC_CONFLICT_MESSAGE, conflict: true }
      : { data: null, error: 'Field not found.' };
  }
  void logUserAction(context.actorId, 'update', 'request_form_field', fieldId, {
    component: 'RequestFormFieldService',
    ...buildAuditDiff(before as unknown as Record<string, unknown>, patch),
  });
  return { data: mapField(data as RequestFormFieldRow), error: null };
}

export async function deleteRequestFormField(
  fieldId: string,
  context: RequestFormFieldContext,
  expectedUpdatedAt?: string,
): Promise<ConfigDeleteResult> {
  const { data: beforeRow } = await requestFormFieldsTable()
    .select('*')
    .eq('id', fieldId)
    .eq('company_id', context.companyId)
    .maybeSingle();
  const before = beforeRow ? mapField(beforeRow as RequestFormFieldRow) : null;

  let query = requestFormFieldsTable()
    .delete()
    .eq('id', fieldId)
    .eq('company_id', context.companyId);
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);

  const { data: deletedRows, error } = await query.select('id');
  if (error) return { error: (error as { message: string }).message };
  if (expectedUpdatedAt && (!deletedRows || (deletedRows as unknown[]).length === 0)) {
    return { error: OPTIMISTIC_CONFLICT_MESSAGE, conflict: true };
  }
  void logUserAction(context.actorId, 'delete', 'request_form_field', fieldId, {
    component: 'RequestFormFieldService',
    before: before ? { key: before.key, label: before.label, category_key: before.category_key } : undefined,
  });
  return { error: null };
}

export async function listRequestFieldOptions(
  companyId: string,
  dataSource: RequestFieldDataSource,
): Promise<{ data: DatabaseFieldOption[]; error: string | null }> {
  if (dataSource === 'branches') {
    const { data, error } = await supabase
      .from('branches')
      .select('id, code, name')
      .eq('company_id', companyId)
      .order('code', { ascending: true })
      .limit(100);
    if (error) return { data: [], error: error.message };
    return {
      data: (data ?? []).map((branch) => ({
        value: String(branch.id),
        label: `${branch.code} · ${branch.name}`,
        description: String(branch.code),
      })),
      error: null,
    };
  }

  if (dataSource === 'employees') {
    const { data, error } = await supabase
      .from('employees')
      .select('id, staff_code, name, work_email')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('name', { ascending: true })
      .limit(100);
    if (error) return { data: [], error: error.message };
    return {
      data: (data ?? []).map((employee) => ({
        value: String(employee.id),
        label: String(employee.name),
        description: [employee.staff_code, employee.work_email].filter(Boolean).join(' · '),
      })),
      error: null,
    };
  }

  const { data, error } = await supabase
    .from('vehicles')
    .select('id, chassis_no, model, customer_name, reg_no, branch_code')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map((vehicle) => ({
      value: String(vehicle.id),
      label: `${vehicle.chassis_no} · ${vehicle.model}`,
      description: [vehicle.customer_name, vehicle.reg_no, vehicle.branch_code].filter(Boolean).join(' · '),
    })),
    error: null,
  };
}
