/**
 * Shared mutation helpers for the internal-request admin config services.
 *
 * Two concerns live here so the five config services (categories,
 * subcategories, form fields, templates, routing rules) stay consistent:
 *
 *  1. Optimistic locking — every config table maintains `updated_at` via a
 *     BEFORE UPDATE trigger. A mutation may pass the `updated_at` value it last
 *     read as `expectedUpdatedAt`; the service adds `.eq('updated_at', expected)`
 *     to the WHERE clause so a concurrent edit (which bumped `updated_at`) makes
 *     the predicate match zero rows. Zero rows under a supplied token = a
 *     conflict, surfaced as `{ conflict: true }` (a 409-equivalent) so the UI can
 *     prompt a reload instead of silently clobbering the other writer's change.
 *
 *  2. Audit before/after — admin mutations must record actor + before/after so
 *     the audit trail captures intent and the prior state, not just a field count.
 */

export const OPTIMISTIC_CONFLICT_MESSAGE =
  'This record was changed by someone else. Reload to see the latest version, then try again.';

/** Standard result shape for config update mutations. */
export interface ConfigMutationResult<T> {
  data: T | null;
  error: string | null;
  /** True when the update/delete matched zero rows under a supplied version token. */
  conflict?: boolean;
}

/** Standard result shape for config delete mutations (no row returned). */
export interface ConfigDeleteResult {
  error: string | null;
  conflict?: boolean;
}

/**
 * Build a compact `{ before, after }` diff limited to the keys that actually
 * changed in `patch` (excluding bookkeeping columns like `updated_by`). Keeps
 * audit metadata small while still recording the prior value for each field.
 *
 * `before` is the mapped record (or null when it could not be fetched); its
 * field names match the DB column names used as `patch` keys for the audited
 * columns (label/description/is_active/priority/sla/approval_flow_id/...).
 */
export function buildAuditDiff(
  before: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
  ignoreKeys: string[] = ['updated_by', 'updated_at'],
): { changedFields: string[]; before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedFields = Object.keys(patch).filter((key) => !ignoreKeys.includes(key));
  const beforeValues: Record<string, unknown> = {};
  const afterValues: Record<string, unknown> = {};
  for (const key of changedFields) {
    beforeValues[key] = before ? before[key] : undefined;
    afterValues[key] = patch[key];
  }
  return { changedFields, before: beforeValues, after: afterValues };
}
