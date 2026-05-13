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
import type { TicketAttachmentRecord } from '@/services/ticketAttachmentService';
import type { CompanyTicketRecord } from '@/services/ticketService';

interface RequestQueueListProps {
  tickets: CompanyTicketRecord[];
  selectedTicketId: string | null;
  openCount: number;
  categories: RequestCategoryRecord[];
  subcategories: RequestSubcategoryRecord[];
  attachmentsByTicket: Record<string, TicketAttachmentRecord[]>;
  onSelectTicket: (ticketId: string) => void;
}

export function RequestQueueList({
  tickets,
  selectedTicketId,
  openCount,
  categories,
  subcategories,
  attachmentsByTicket,
  onSelectTicket,
}: RequestQueueListProps) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
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

          return (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onSelectTicket(ticket.id)}
              className={`w-full border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                selected ? 'bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]' : 'hover:bg-muted/50'
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
          );
        })}
      </div>
    </section>
  );
}