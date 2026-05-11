import { Paperclip } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { TicketApprovalSummary } from '@/components/tickets/TicketApprovalSummary';
import { TicketSlaSummary } from '@/components/tickets/TicketSlaSummary';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { getRequestSubcategoryLabel } from '@/lib/requestSubcategories';
import type { RequestCategoryRecord } from '@/services/requestCategoryService';
import type { RequestSubcategoryRecord } from '@/services/requestSubcategoryService';
import type { TicketAttachmentRecord } from '@/services/ticketAttachmentService';
import type { CompanyTicketRecord, TicketPriority, TicketStatus } from '@/services/ticketService';

const statusVariant: Record<TicketStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'default',
  in_progress: 'secondary',
  awaiting_requester: 'outline',
  resolved: 'outline',
  closed: 'outline',
  cancelled: 'outline',
};

const priorityVariant: Record<TicketPriority, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'destructive',
};

function formatTicketLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function formatDueDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isOpenStatus(status: TicketStatus) {
  return status === 'open' || status === 'in_progress' || status === 'awaiting_requester';
}

function isOverdue(ticket: CompanyTicketRecord) {
  if (!ticket.requested_due_date || !isOpenStatus(ticket.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${ticket.requested_due_date}T00:00:00`) < today;
}

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
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Queue</h2>
          <p className="text-xs text-muted-foreground">{tickets.length} requests in view</p>
        </div>
        <Badge variant="outline">{openCount} open</Badge>
      </div>

      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto lg:max-h-[calc(100vh-18rem)]">
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
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium text-foreground">{ticket.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ticket.submitted_by_name ?? 'Unknown requester'} · {categoryLabel}{subcategoryLabel ? ` / ${subcategoryLabel}` : ''}
                  </p>
                </div>
                <Badge variant={statusVariant[ticket.status]} className="shrink-0 capitalize">
                  {formatTicketLabel(ticket.status)}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={priorityVariant[ticket.priority]} className="capitalize">
                  {ticket.priority}
                </Badge>
                <TicketApprovalSummary ticket={ticket} compact />
                <TicketSlaSummary ticket={ticket} compact />
                <span>{ticket.assigned_to_name ?? 'Unassigned'}</span>
                {ticket.requested_due_date && (
                  <span className={isOverdue(ticket) ? 'font-medium text-destructive' : ''}>
                    Needed {formatDueDate(ticket.requested_due_date)}
                  </span>
                )}
                {attachmentCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Paperclip className="h-3.5 w-3.5" />
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