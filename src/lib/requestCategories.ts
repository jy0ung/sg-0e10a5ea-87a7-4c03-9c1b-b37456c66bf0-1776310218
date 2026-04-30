export const REQUEST_CATEGORY_VALUES = [
  'operations_support',
  'technical_support',
  'access_request',
  'finance_request',
  'hr_request',
  'service_coordination',
  'other',
] as const;

export type RequestCategoryValue = (typeof REQUEST_CATEGORY_VALUES)[number];

export type LegacyRequestCategoryValue =
  | 'sales_inquiry'
  | 'technical_issue'
  | 'service_request'
  | 'general'
  | 'other';

export const REQUEST_CATEGORY_OPTIONS: Array<{
  value: RequestCategoryValue;
  label: string;
  description: string;
}> = [
  {
    value: 'operations_support',
    label: 'Operations Support',
    description: 'Outlet operations, inventory coordination, or internal process support.',
  },
  {
    value: 'technical_support',
    label: 'Technical Support',
    description: 'System issues, broken workflows, or troubleshooting requests.',
  },
  {
    value: 'access_request',
    label: 'System Access',
    description: 'New access, permission changes, or account provisioning help.',
  },
  {
    value: 'finance_request',
    label: 'Finance Request',
    description: 'Billing, payment follow-up, or finance-team coordination.',
  },
  {
    value: 'hr_request',
    label: 'HR Request',
    description: 'HR policy questions, employee records, or people operations support.',
  },
  {
    value: 'service_coordination',
    label: 'Service Coordination',
    description: 'Cross-team coordination for branch, customer, or service execution.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Anything that does not fit the standard internal request lanes.',
  },
];

const REQUEST_CATEGORY_LABELS: Record<RequestCategoryValue | LegacyRequestCategoryValue, string> = {
  operations_support: 'Operations Support',
  technical_support: 'Technical Support',
  access_request: 'System Access',
  finance_request: 'Finance Request',
  hr_request: 'HR Request',
  service_coordination: 'Service Coordination',
  sales_inquiry: 'Service Coordination',
  technical_issue: 'Technical Support',
  service_request: 'Operations Support',
  general: 'Operations Support',
  other: 'Other',
};

export function getRequestCategoryLabel(value: string) {
  return REQUEST_CATEGORY_LABELS[value as RequestCategoryValue | LegacyRequestCategoryValue] ?? value.replace(/_/g, ' ');
}