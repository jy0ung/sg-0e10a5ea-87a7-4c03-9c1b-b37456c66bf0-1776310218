export interface RequestCategoryOption {
  key: string;
  label: string;
  description: string;
  sortOrder: number;
}

export const DEFAULT_REQUEST_CATEGORY_OPTIONS: RequestCategoryOption[] = [
  {
    key: 'operations_support',
    label: 'Operations Support',
    description: 'Outlet operations, inventory coordination, or internal process support.',
    sortOrder: 10,
  },
  {
    key: 'technical_support',
    label: 'Technical Support',
    description: 'System issues, broken workflows, or troubleshooting requests.',
    sortOrder: 20,
  },
  {
    key: 'access_request',
    label: 'System Access',
    description: 'New access, permission changes, or account provisioning help.',
    sortOrder: 30,
  },
  {
    key: 'finance_request',
    label: 'Finance Request',
    description: 'Billing, payment follow-up, or finance-team coordination.',
    sortOrder: 40,
  },
  {
    key: 'hr_request',
    label: 'HR Request',
    description: 'HR policy questions, employee records, or people operations support.',
    sortOrder: 50,
  },
  {
    key: 'service_coordination',
    label: 'Service Coordination',
    description: 'Cross-team coordination for branch, customer, or service execution.',
    sortOrder: 60,
  },
  {
    key: 'other',
    label: 'Other',
    description: 'Anything that does not fit the standard internal request lanes.',
    sortOrder: 70,
  },
];

export type RequestCategoryValue = string;

export type LegacyRequestCategoryValue =
  | 'sales_inquiry'
  | 'technical_issue'
  | 'service_request'
  | 'general'
  | 'other';

const REQUEST_CATEGORY_LABELS: Record<string, string> = {
  sales_inquiry: 'Service Coordination',
  technical_issue: 'Technical Support',
  service_request: 'Operations Support',
  general: 'Operations Support',
};

for (const option of DEFAULT_REQUEST_CATEGORY_OPTIONS) {
  REQUEST_CATEGORY_LABELS[option.key] = option.label;
}

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
  return REQUEST_CATEGORY_LABELS[value as RequestCategoryValue | LegacyRequestCategoryValue] ?? value.replace(/_/g, ' ');
}