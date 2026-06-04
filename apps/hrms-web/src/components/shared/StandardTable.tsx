import {
  StandardTable as SharedStandardTable,
  type SortDir,
  type StandardTableColumn,
  type StandardTableMobileLayout,
  type StandardTableProps,
} from '@flc/ui/StandardTable';

export type { SortDir, StandardTableColumn, StandardTableMobileLayout, StandardTableProps };

export function StandardTable<T extends object>({ mobileLayout = 'table', ...props }: StandardTableProps<T>) {
  return <SharedStandardTable mobileLayout={mobileLayout} {...props} />;
}
