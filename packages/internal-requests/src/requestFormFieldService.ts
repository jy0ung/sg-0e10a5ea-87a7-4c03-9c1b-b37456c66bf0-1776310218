import { supabase } from '@flc/supabase';
import { buildRequestCategoryKey } from './requestCategories';
import { logUserAction } from '@flc/platform-services';

export type RequestFormFieldType = 'text' | 'textarea' | 'number' | 'date' | 'database_select';
export type RequestFieldDataSource = 'branches' | 'employees' | 'vehicles';

export interface RequestFormFieldRecord {
  id: string;
  company_id: string;
  category_key: string;
  key: string;
  label: string;
  field_type: RequestFormFieldType;
  data_source: RequestFieldDataSource | null;
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
  field_key: string;
  label: string;
  field_type: RequestFormFieldType;
  data_source: RequestFieldDataSource | null;
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
  label: string;
  field_type: RequestFormFieldType;
  data_source?: RequestFieldDataSource | null;
  placeholder?: string;
  help_text?: string;
  is_required?: boolean;
}

export interface UpdateRequestFormFieldInput {
  label?: string;
  field_type?: RequestFormFieldType;
  data_source?: RequestFieldDataSource | null;
  placeholder?: string;
  help_text?: string;
  is_required?: boolean;
  is_active?: boolean;
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
  return {
    id: row.id,
    company_id: row.company_id,
    category_key: row.category_key,
    key: row.field_key,
    label: row.label,
    field_type: row.field_type,
    data_source: row.data_source,
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

export async function listRequestFormFields(
  companyId: string,
  options: { categoryKey?: string; includeInactive?: boolean } = {},
): Promise<{ data: RequestFormFieldRecord[]; error: string | null }> {
  let query = requestFormFieldsTable()
    .select('*')
    .eq('company_id', companyId)
    .order('category_key', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (options.categoryKey) query = query.eq('category_key', options.categoryKey);
  if (!options.includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return { data: [], error: (error as { message: string }).message };
  return { data: ((data ?? []) as RequestFormFieldRow[]).map(mapField), error: null };
}

export async function createRequestFormField(
  input: CreateRequestFormFieldInput,
  context: RequestFormFieldContext,
): Promise<{ data: RequestFormFieldRecord | null; error: string | null }> {
  const label = input.label.trim();
  if (!label) return { data: null, error: 'Field label is required.' };

  const { data: existingFields, error: existingError } = await listRequestFormFields(context.companyId, {
    categoryKey: input.category_key,
    includeInactive: true,
  });
  if (existingError) return { data: null, error: existingError };

  const fieldKey = buildRequestCategoryKey(label);
  if (existingFields.some((field) => field.key === fieldKey)) {
    return { data: null, error: 'A field with this label already exists for the selected category.' };
  }

  const nextSortOrder = (existingFields.at(-1)?.sort_order ?? 0) + 10;
  const { data, error } = await requestFormFieldsTable()
    .insert({
      company_id: context.companyId,
      category_key: input.category_key,
      field_key: fieldKey,
      label,
      field_type: input.field_type,
      data_source: normalizeFieldSource(input.field_type, input.data_source),
      placeholder: input.placeholder?.trim() ?? '',
      help_text: input.help_text?.trim() ?? '',
      is_required: input.is_required ?? false,
      is_active: true,
      sort_order: nextSortOrder,
      created_by: context.actorId,
    } as never)
    .select('*')
    .single();

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
): Promise<{ data: RequestFormFieldRecord | null; error: string | null }> {
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
  if (input.placeholder !== undefined) patch.placeholder = input.placeholder.trim();
  if (input.help_text !== undefined) patch.help_text = input.help_text.trim();
  if (input.is_required !== undefined) patch.is_required = input.is_required;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await requestFormFieldsTable()
    .update(patch as never)
    .eq('id', fieldId)
    .eq('company_id', context.companyId)
    .select('*')
    .single();

  if (error) return { data: null, error: (error as { message: string }).message };
  void logUserAction(context.actorId, 'update', 'request_form_field', fieldId, {
    component: 'RequestFormFieldService',
    fieldCount: Object.keys(patch).length,
  });
  return { data: mapField(data as RequestFormFieldRow), error: null };
}

export async function deleteRequestFormField(
  fieldId: string,
  context: RequestFormFieldContext,
): Promise<{ error: string | null }> {
  const { error } = await requestFormFieldsTable()
    .delete()
    .eq('id', fieldId)
    .eq('company_id', context.companyId);
  if (error) return { error: (error as { message: string }).message };
  void logUserAction(context.actorId, 'delete', 'request_form_field', fieldId, {
    component: 'RequestFormFieldService',
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