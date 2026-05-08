import { formatDistanceToNow } from 'date-fns';
import { CalendarDays, CheckCircle2, Loader2, MessageSquare, Send, UserRound, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { getRequestSubcategoryLabel } from '@/lib/requestSubcategories';
import { TicketActivityList } from '@/components/tickets/TicketActivityList';
import { TicketAttachmentList } from '@/components/tickets/TicketAttachmentList';
import { TicketApprovalSummary } from '@/components/tickets/TicketApprovalSummary';
import { TicketSlaSummary } from '@/components/tickets/TicketSlaSummary';
import type { RequestCategoryRecord } from '@/services/requestCategoryService';
import type { RequestSubcategoryRecord } from '@/services/requestSubcategoryService';
import type { ProfileRow } from '@/services/profileService';
import type { TicketAttachmentRecord } from '@/services/ticketAttachmentService';
import type {
  CompanyTicketRecord,
  TicketActivityRecord,
  TicketPriority,
  TicketStatus,
} from '@/services/ticketService';

interface RequestDetailPanelProps {
  ticket: CompanyTicketRecord;
  categories: RequestCategoryRecord[];
  subcategories: RequestSubcategoryRecord[];
  assignees: ProfileRow[];
  activities: TicketActivityRecord[];
  attachments: TicketAttachmentRecord[];
  customFieldLabelMap: Record<string, string>;
  statusOptions: Array<{ value: TicketStatus; label: string }>;
  priorityOptions: Array<{ value: TicketPriority; label: string }>;
  saving: boolean;
  noteDraft: string;
  commentDraft: string;
  canReviewApproval: boolean;
  variant?: 'pane' | 'drawer';
  onStatusChange: (ticketId: string, status: TicketStatus) => void;
  onPriorityChange: (ticketId: string, priority: TicketPriority) => void;
  onAssignmentChange: (ticketId: string, value: string) => void;
  onResolutionNoteChange: (ticketId: string, value: string) => void;
  onResolutionNoteSave: (ticketId: string) => void;
  onCommentChange: (ticketId: string, value: string) => void;
  onAddComment: (ticketId: string) => void;
  onReviewApproval: (ticketId: string, decision: 'approved' | 'rejected') => void;
}

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

function customFieldEntries(
  ticket: CompanyTicketRecord,
  labelMap: Record<string, string>,
) {
  return Object.entries(ticket.custom_fields ?? {})
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .map(([key, value]) => ({
      key,
      label: labelMap[`${ticket.category}:${key}`] ?? formatTicketLabel(key),
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }));
}

export function RequestDetailPanel({
  ticket,
  categories,
  subcategories,
  assignees,
  activities,
  attachments,
  customFieldLabelMap,
  statusOptions,
  priorityOptions,
  saving,
  noteDraft,
  commentDraft,
  canReviewApproval,
  variant = 'pane',
  onStatusChange,
  onPriorityChange,
  onAssignmentChange,
  onResolutionNoteChange,
  onResolutionNoteSave,
  onCommentChange,
  onAddComment,
  onReviewApproval,
}: RequestDetailPanelProps) {
  const extraFields = customFieldEntries(ticket, customFieldLabelMap);
  const gridColumns = variant === 'drawer' ? 'sm:grid-cols-3' : 'md:grid-cols-3';
  const twoColumns = variant === 'drawer' ? 'sm:grid-cols-2' : 'md:grid-cols-2';
  const additionalFieldValueClass = variant === 'drawer' ? 'break-words' : 'truncate';

  return (
    <>
      <div className={variant === 'drawer'
        ? 'sticky top-0 z-10 -mx-4 border-b border-border bg-background/95 px-4 pb-3 pt-1 backdrop-blur'
        : 'border-b border-border px-4 py-3'}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusVariant[ticket.status]} className="capitalize">
                {formatTicketLabel(ticket.status)}
              </Badge>
              <Badge variant={priorityVariant[ticket.priority]} className="capitalize">
                {ticket.priority} priority
              </Badge>
              {isOverdue(ticket) && <Badge variant="destructive">Overdue</Badge>}
              <TicketApprovalSummary ticket={ticket} compact />
              <TicketSlaSummary ticket={ticket} compact />
            </div>
            <h2 className={variant === 'drawer' ? 'text-base font-semibold leading-6 text-foreground' : 'text-lg font-semibold text-foreground'}>{ticket.subject}</h2>
            <p className={variant === 'drawer' ? 'text-xs text-muted-foreground' : 'text-sm text-muted-foreground'}>
              Submitted {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
              {ticket.vso_number ? ` · VSO ${ticket.vso_number}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className={variant === 'drawer' ? 'space-y-4 pt-4' : 'space-y-4 p-4'}>
        {extraFields.length > 0 && (
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Additional details</p>
            <div className={`mt-2 grid gap-2 ${twoColumns}`}>
              {extraFields.map((field) => (
                <div key={field.key} className="min-w-0">
                  <p className="text-xs text-muted-foreground">{field.label}</p>
                  <p className={`${additionalFieldValueClass} text-sm text-foreground`}>{field.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={`grid gap-3 ${gridColumns}`}>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
            <Select
              value={ticket.status}
              onValueChange={(value) => onStatusChange(ticket.id, value as TicketStatus)}
              disabled={saving}
            >
              <SelectTrigger><SelectValue placeholder="Set status" /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Priority</p>
            <Select
              value={ticket.priority}
              onValueChange={(value) => onPriorityChange(ticket.id, value as TicketPriority)}
              disabled={saving}
            >
              <SelectTrigger><SelectValue placeholder="Set priority" /></SelectTrigger>
              <SelectContent>
                {priorityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Owner</p>
            <Select
              value={ticket.assigned_to ?? 'unassigned'}
              onValueChange={(value) => onAssignmentChange(ticket.id, value)}
              disabled={saving}
            >
              <SelectTrigger><SelectValue placeholder="Assign owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {assignees.map((assignee) => (
                  <SelectItem key={assignee.id} value={assignee.id}>{assignee.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className={`grid gap-3 ${gridColumns}`}>
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" />
              Requester
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">{ticket.submitted_by_name ?? 'Unknown requester'}</p>
            {ticket.submitted_by_email && <p className="mt-1 truncate text-xs text-muted-foreground">{ticket.submitted_by_email}</p>}
          </div>
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</p>
            <p className="mt-2 text-sm font-medium text-foreground">{getRequestCategoryLabel(ticket.category, categories)}</p>
            {ticket.subcategory && (
              <p className="mt-1 text-xs text-muted-foreground">
                {getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories)}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Timing
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {ticket.requested_due_date ? formatDueDate(ticket.requested_due_date) : 'No target date'}
            </p>
            {ticket.resolved_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                Resolved {formatDistanceToNow(new Date(ticket.resolved_at), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>

        {ticket.approval_status && (
          <div className="space-y-3 rounded-lg border border-border bg-secondary/20 px-3 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <TicketApprovalSummary ticket={ticket} />
              {canReviewApproval && (
                <div className={variant === 'drawer' ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                    onClick={() => onReviewApproval(ticket.id, 'approved')}
                    disabled={saving}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                    onClick={() => onReviewApproval(ticket.id, 'rejected')}
                    disabled={saving}
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <TicketSlaSummary ticket={ticket} />

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Request detail</p>
          <p className="whitespace-pre-line text-sm leading-5 text-foreground">{ticket.description}</p>
        </div>

        {(ticket.desired_outcome || ticket.business_impact) && (
          <div className={`grid gap-3 ${twoColumns}`}>
            {ticket.desired_outcome && (
              <div className="rounded-lg border border-border px-3 py-2.5">
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Desired outcome
                </p>
                <p className="mt-1 text-sm leading-5 text-foreground">{ticket.desired_outcome}</p>
              </div>
            )}
            {ticket.business_impact && (
              <div className="rounded-lg border border-border px-3 py-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Business impact</p>
                <p className="mt-1 text-sm leading-5 text-foreground">{ticket.business_impact}</p>
              </div>
            )}
          </div>
        )}

        {(ticket.status === 'resolved' || ticket.status === 'closed' || ticket.resolution_note) && (
          <div className="space-y-2 rounded-lg border border-border bg-secondary/20 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resolution note</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onResolutionNoteSave(ticket.id)}
                disabled={saving || noteDraft === (ticket.resolution_note ?? '')}
              >
                Save note
              </Button>
            </div>
            <Textarea
              value={noteDraft}
              onChange={(event) => onResolutionNoteChange(ticket.id, event.target.value)}
              placeholder="Explain the outcome or next step visible to the requester."
              rows={3}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">Shown to the requester when their request is resolved or closed.</p>
          </div>
        )}

        <TicketAttachmentList attachments={attachments} />

        <div className="space-y-2 rounded-lg border border-border px-3 py-3">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            Discussion
          </p>
          <Textarea
            value={commentDraft}
            onChange={(event) => onCommentChange(ticket.id, event.target.value)}
            placeholder="Ask for clarification, add an update, or document the next step."
            rows={3}
            disabled={saving}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={() => onAddComment(ticket.id)}
              disabled={saving || !commentDraft.trim()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Add comment
            </Button>
          </div>
        </div>

        <TicketActivityList activities={activities} />
      </div>
    </>
  );
}