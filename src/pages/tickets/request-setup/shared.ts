/**
 * Draft types, change-detection helpers, and select-control sentinels shared
 * across the Request Setup editors (Categories, Templates, Form Builder,
 * Routing, Attachment Settings).
 *
 * Each editor used to inline its own copy of these inside `RequestSetup.tsx`,
 * which made the file 2,785 lines long and tightly coupled. Lifting the
 * non-React surface here keeps each editor focused on its UI + handlers.
 */

import type { RequestCategoryRecord } from '@/services/requestCategoryService';
import type { RequestSubcategoryRecord } from '@/services/requestSubcategoryService';
import type {
  RequestFieldDataSource,
  RequestFormFieldRecord,
  RequestFormFieldType,
  RequestTemplateRecord,
  TemplatePriority,
  RequestRoutingRule,
} from '@flc/internal-requests';

// ───────────────────────── Category drafts ──────────────────────────

export interface CategoryDraft {
  label: string;
  description: string;
  response_sla_hours: number | null;
  resolution_sla_hours: number | null;
  is_active: boolean;
  approval_flow_id: string | null;
}

export interface SubcategoryDraft {
  label: string;
  description: string;
  is_active: boolean;
  approval_flow_id: string | null;
}

export interface CreateSubcategoryDraft {
  label: string;
  description: string;
}

export function hasCategoryChanges(
  category: RequestCategoryRecord,
  draft: CategoryDraft | undefined,
) {
  if (!draft) return false;
  return (
    draft.label !== category.label
    || draft.description !== category.description
    || draft.response_sla_hours !== category.response_sla_hours
    || draft.resolution_sla_hours !== category.resolution_sla_hours
    || draft.is_active !== category.is_active
    || draft.approval_flow_id !== category.approval_flow_id
  );
}

export function hasSubcategoryChanges(
  subcategory: RequestSubcategoryRecord,
  draft: SubcategoryDraft | undefined,
) {
  if (!draft) return false;
  return (
    draft.label !== subcategory.label
    || draft.description !== subcategory.description
    || draft.is_active !== subcategory.is_active
    || draft.approval_flow_id !== subcategory.approval_flow_id
  );
}

// ───────────────────────── Template drafts ──────────────────────────

export interface TemplateDraft {
  name: string;
  description: string;
  category_key: string;
  subcategory_key: string;
  priority: TemplatePriority;
  subject: string;
  body: string;
  is_active: boolean;
}

export function hasTemplateChanges(
  template: RequestTemplateRecord,
  draft: TemplateDraft | undefined,
) {
  if (!draft) return false;
  return (
    draft.name !== template.name
    || draft.description !== template.description
    || draft.category_key !== template.category_key
    || draft.subcategory_key !== (template.subcategory_key ?? '')
    || draft.priority !== template.priority
    || draft.subject !== template.subject
    || draft.body !== template.body
    || draft.is_active !== template.is_active
  );
}

// ───────────────────────── Form-field drafts ────────────────────────

export interface FormFieldDraft {
  label: string;
  field_type: RequestFormFieldType;
  data_source: RequestFieldDataSource | null;
  placeholder: string;
  help_text: string;
  is_required: boolean;
  is_active: boolean;
}

export function hasFormFieldChanges(
  field: RequestFormFieldRecord,
  draft: FormFieldDraft | undefined,
) {
  if (!draft) return false;
  return (
    draft.label !== field.label
    || draft.field_type !== field.field_type
    || draft.data_source !== field.data_source
    || draft.placeholder !== field.placeholder
    || draft.help_text !== field.help_text
    || draft.is_required !== field.is_required
    || draft.is_active !== field.is_active
  );
}

// ───────────────────────── Routing-rule drafts ──────────────────────

export interface RoutingRuleDraft {
  name: string;
  match_category: string;
  match_subcategory: string;
  match_submitter_role: string;
  match_priority: string;
  assign_to_user_id: string;
}

export function hasRuleChanges(
  rule: RequestRoutingRule,
  draft: RoutingRuleDraft | undefined,
) {
  if (!draft) return false;
  return (
    draft.name !== rule.name
    || (draft.match_category || null) !== rule.match_category
    || (draft.match_subcategory || null) !== rule.match_subcategory
    || (draft.match_submitter_role || null) !== rule.match_submitter_role
    || (draft.match_priority || null) !== rule.match_priority
    || draft.assign_to_user_id !== rule.assign_to_user_id
  );
}

// ───────────────────────── Constants ────────────────────────────────

export const PRIORITY_OPTIONS: { value: TemplatePriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const FIELD_TYPE_OPTIONS: { value: RequestFormFieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'database_select', label: 'Database dropdown' },
];

export const DATA_SOURCE_OPTIONS: { value: RequestFieldDataSource; label: string }[] = [
  { value: 'branches', label: 'Branches' },
  { value: 'employees', label: 'Employees' },
  { value: 'vehicles', label: 'Vehicles' },
];

// ───────────────────────── Optimistic-lock conflict ─────────────────────────

/**
 * Shape returned by config mutations that support optimistic locking. When a
 * concurrent edit moved the row's `updated_at` out from under the caller, the
 * service returns `{ conflict: true }` (a 409-equivalent) instead of silently
 * overwriting. Editors branch on this BEFORE the generic `error` so they can
 * show an inline "reload" affordance rather than a throwaway error toast.
 */
export interface MaybeConflictResult {
  error?: string | null;
  conflict?: boolean;
}

/** True when a mutation failed because the record was changed concurrently. */
export function isConflict(result: MaybeConflictResult | null | undefined): boolean {
  return Boolean(result?.conflict);
}

export const CONFLICT_RELOAD_MESSAGE =
  'This record was changed by someone else. Reload to see the latest version before saving.';

// Sentinel values used by shadcn <Select> to represent "Any" / "None" — empty
// strings would collide with the placeholder behaviour.
export const ANY_SELECT_VALUE = '__any__';
export const NONE_SELECT_VALUE = '__none__';

export function selectValue(value: string | null | undefined) {
  return value || ANY_SELECT_VALUE;
}

export function optionalSelectValue(value: string) {
  return value === ANY_SELECT_VALUE || value === NONE_SELECT_VALUE ? '' : value;
}

export function parseSlaHours(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, parsed);
}
