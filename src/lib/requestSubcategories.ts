import { buildRequestCategoryKey } from './requestCategories';

export interface RequestSubcategoryOption {
  categoryKey: string;
  key: string;
  label: string;
  description: string;
  sortOrder: number;
}

type RequestSubcategoryLabelSource = Pick<RequestSubcategoryOption, 'key' | 'label'> & (
  | { categoryKey: string }
  | { category_key: string }
);

export function buildRequestSubcategoryKey(label: string) {
  return buildRequestCategoryKey(label);
}

export function getRequestSubcategoryLabel(
  value: string,
  categoryKey: string,
  subcategories?: RequestSubcategoryLabelSource[],
) {
  const dynamicLabel = subcategories?.find(
    (subcategory) => (
      ('categoryKey' in subcategory ? subcategory.categoryKey : subcategory.category_key) === categoryKey
    ) && subcategory.key === value,
  )?.label;

  if (dynamicLabel) return dynamicLabel;
  return value.replace(/_/g, ' ');
}