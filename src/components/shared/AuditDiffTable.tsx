import React from 'react';
import { cn } from '@/lib/utils';

interface FieldChange {
  before: unknown;
  after: unknown;
}

type ChangesMap = Record<string, FieldChange>;

interface AuditDiffTableProps {
  changes: ChangesMap | null | undefined;
  className?: string;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Renders a colour-coded before/after diff table from an audit_logs.changes JSONB object.
 * Each key in the changes map is a field name; each value has { before, after }.
 */
export function AuditDiffTable({ changes, className }: AuditDiffTableProps) {
  if (!changes || Object.keys(changes).length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No field changes recorded.</p>;
  }

  const entries = Object.entries(changes);

  return (
    <div className={cn('rounded-md border border-border overflow-hidden text-xs', className)}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground w-1/3">Field</th>
            <th className="px-3 py-1.5 text-left font-medium text-red-500/80 w-1/3">Before</th>
            <th className="px-3 py-1.5 text-left font-medium text-green-500/80 w-1/3">After</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([field, change]) => {
            const before = formatValue((change as FieldChange).before);
            const after = formatValue((change as FieldChange).after);
            const changed = before !== after;
            return (
              <tr key={field} className="border-b border-border last:border-0 hover:bg-secondary/20">
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{field}</td>
                <td className={cn('px-3 py-1.5', changed && 'text-red-400 line-through')}>{before}</td>
                <td className={cn('px-3 py-1.5', changed && 'text-green-400 font-medium')}>{after}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
