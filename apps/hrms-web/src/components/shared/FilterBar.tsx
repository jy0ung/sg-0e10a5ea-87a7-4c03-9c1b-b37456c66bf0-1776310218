import { FilterBar as SharedFilterBar, type FilterBarProps, type FilterBarVariant } from '@flc/ui/FilterBar';

export type { FilterBarProps, FilterBarVariant };

export function FilterBar({ variant = 'compact', ...props }: FilterBarProps) {
  return <SharedFilterBar variant={variant} {...props} />;
}
