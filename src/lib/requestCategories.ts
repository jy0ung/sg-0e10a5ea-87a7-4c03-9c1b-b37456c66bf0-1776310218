export interface RequestCategoryOption {
  key: string;
  label: string;
  description: string;
  sortOrder: number;
}

export type RequestCategoryValue = string;

// Legacy key → label map kept for backwards-compatibility with tickets created
// before the dynamic category system was introduced.
const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  sales_inquiry: 'Service Coordination',
  technical_issue: 'Technical Support',
  service_request: 'Operations Support',
  general: 'Operations Support',
};

export function buildRequestCategoryKey(label: string) {
  const normalized = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

  return normalized || 'request_category';
}

export function getRequestCategoryLabel(
  value: string,
  categories?: Array<Pick<RequestCategoryOption, 'key' | 'label'>>,
) {
  const dynamicLabel = categories?.find((category) => category.key === value)?.label;
  if (dynamicLabel) return dynamicLabel;
  return LEGACY_CATEGORY_LABELS[value] ?? value.replace(/_/g, ' ');
}