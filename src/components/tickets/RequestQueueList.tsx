import { Paperclip } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { TicketApprovalSummary } from '@/components/tickets/TicketApprovalSummary';
import { TicketSlaSummary } from '@/components/tickets/TicketSlaSummary';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { getRequestSubcategoryLabel } from '@/lib/requestSubcategories';
import {
  formatDueDate,
  formatTicketLabel,
  isOverdue,
  statusColorMap,
  priorityColorMap,
} from '@/lib/requestFormatters';
import type { RequestCategoryRecord } from '@/services/requestCategoryService';
import type { RequestSubcategoryRecord } from '@/services/requestSubcategoryService';
import type { TicketAttachmentRecord } from '@flc/platform-services';
import type { CompanyTicketRecord } from '@/services/ticketService';

interface RequestQueueListProps {
  tickets: CompanyTicketRecord[];
  selectedTicketId: string | null;
  openCount: number;
  categories: RequestCategoryRecord[];
  subcategories: RequestSubcategoryRecord[];
  attachmentsByTicket: Record<string, TicketAttachmentRecord[]>;
  onSelectTicket: (ticketId: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (ticketId: string) => void;
  onToggleSelectAll?: (allIds: string[]) => void;
}

export function RequestQueueList({
  tickets,
  selectedTicketId,
  openCount,
  categories,
  subcategories,
  attachmentsByTicket,
  onSelectTicket,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: RequestQueueListProps) {
  const showCheckboxes = !!(selectedIds && onToggleSelect);
  const allSelected = tickets.length > 0 && tickets.every((t) => selectedIds?.has(t.id));
  const someSelected = !allSelected && tickets.some((t) => selectedIds?.has(t.id));

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        {showCheckboxes && (
          <input
            type="checkbox"
            aria-label="Select all on this page"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected; }}
            onChange={() => onToggleSelectAll?.(tickets.map((t) => t.id))}
            className="h-3.5 w-3.5 cursor-pointer rounded"
          />
        )}
        <div>
          <h2 className="text-sm font-semibold text-foreground">Queue</h2>
          <p className="text-[11px] text-muted-foreground">{tickets.length} in view · {openCount} open</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tickets.map((ticket) => {
          const selected = ticket.id === selectedTicketId;
          const categoryLabel = getRequestCategoryLabel(ticket.category, categories);
          const subcategoryLabel = ticket.subcategory
            ? getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories)
            : null;
          const attachmentCount = attachmentsByTicket[ticket.id]?.length ?? 0;
          const isChecked = selectedIds?.has(ticket.id) ?? false;

          return (
            <div
              key={ticket.id}
              className={`flex items-stretch border-b border-border last:border-b-0 ${
                selected ? 'bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]' : ''
              }`}
            >
              {showCheckboxes && (
                <div
                  role="checkbox"
                  aria-checked={isChecked}
                  aria-label={`Select ${ticket.subject}`}
                  tabIndex={0}
                  className="flex cursor-pointer items-center px-2"
                  onClick={(e) => { e.stopPropagation(); onToggleSelect?.(ticket.id); }}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.stopPropagation(); onToggleSelect?.(ticket.id); } }}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${ticket.subject}`}
                    checked={isChecked}
                    onChange={() => onToggleSelect?.(ticket.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-3.5 w-3.5 cursor-pointer rounded"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelectTicket(ticket.id)}
                className={`min-w-0 flex-1 px-3 py-2.5 text-left transition-colors ${
                  selected ? '' : 'hover:bg-muted/50'
                }`}
              >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium text-foreground">{ticket.subject}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {ticket.submitted_by_name ?? 'Unknown'} · {categoryLabel}{subcategoryLabel ? ` / ${subcategoryLabel}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className={`shrink-0 border text-[10px] capitalize ${statusColorMap[ticket.status]}`}>
                  {formatTicketLabel(ticket.status)}
                </Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <Badge variant="outline" className={`h-5 border text-[10px] capitalize ${priorityColorMap[ticket.priority]}`}>
                  {ticket.priority}
                </Badge>
                <TicketApprovalSummary ticket={ticket} compact />
                <TicketSlaSummary ticket={ticket} compact />
                <span className="truncate">{ticket.assigned_to_name ?? 'Unassigned'}</span>
                {ticket.requested_due_date && (
                  <span className={isOverdue(ticket) ? 'font-medium text-destructive' : ''}>
                    Due {formatDueDate(ticket.requested_due_date)}
                  </span>
                )}
                {attachmentCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <Paperclip className="h-3 w-3" />
                    {attachmentCount}
                  </span>
                )}
              </div>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}