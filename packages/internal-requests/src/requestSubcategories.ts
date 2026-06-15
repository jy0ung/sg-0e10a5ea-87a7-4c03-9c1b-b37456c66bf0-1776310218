import { buildRequestCategoryKey } from './requestCategories';

/**
 * Subcategory keys share the same slug rules as category keys — derive a stable,
 * URL/DB-safe key from a human label. Kept as its own export so call sites read
 * intentionally and so the rule can diverge later without touching consumers.
 */
export function buildRequestSubcategoryKey(label: string) {
  return buildRequestCategoryKey(label);
}
