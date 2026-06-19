import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, Clock3, Loader2, ShieldAlert, UserRound, XCircle } from 'lucide-react';

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
import { customFieldEntries, isOverdue } from '@/lib/requestFormatters';
import { RequestBadge, RequestStatusBadge } from '@/components/tickets/RequestBadge';
import { TicketActivityList } from '@/components/tickets/TicketActivityList';
import { TicketAttachmentList } from '@/components/tickets/TicketAttachmentList';
import { TicketApprovalHistory } from '@/components/tickets/TicketApprovalHistory';
import { TicketApprovalSummary } from '@/components/tickets/TicketApprovalSummary';
import { TicketChatPanel } from '@/components/tickets/TicketChatPanel';
import { TicketInternalNotesPanel } from '@/components/tickets/TicketInternalNotesPanel';
import { TicketOperationalIndicatorGrid } from '@/components/tickets/TicketOperationalIndicators';
import { TicketSlaSummary } from '@/components/tickets/TicketSlaSummary';
import { getTicketSlaSummary } from '@/lib/ticketSla';
import type { RequestCategoryRecord } from '@/services/requestCategoryService';
import type { RequestSubcategoryRecord } from '@/services/requestSubcategoryService';
import type { ProfileRow } from '@flc/auth';
import type { TicketAttachmentRecord } from '@flc/platform-services';
import type {
  CompanyTicketRecord,
  TicketActivityRecord,
  TicketInternalNoteRecord,
  TicketPriority,
  TicketStatus,
} from '@/services/ticketService';
import type { RequestOperationalIndicator } from '@/services/requestManagementService';

interface RequestDetailPanelProps {
  ticket: CompanyTicketRecord;
  categories: RequestCategoryRecord[];
  subcategories: RequestSubcategoryRecord[];
  assignees: ProfileRow[];
  activities: TicketActivityRecord[];
  internalNotes?: TicketInternalNoteRecord[];
  operationalIndicator?: RequestOperationalIndicator;
  attachments: TicketAttachmentRecord[];
  customFieldLabelMap: Record<string, string>;
  statusOptions: Array<{ value: TicketStatus; label: string }>;
  priorityOptions: Array<{ value: TicketPriority; label: string }>;
  currentUserId?: string | null;
  saving: boolean;
  noteDraft: string;
  commentDraft: string;
  internalNoteDraft?: string;
  canReviewApproval: boolean;
  canManageWorkflow?: boolean;
  canCloseAsRequester?: boolean;
  variant?: 'pane' | 'drawer';
  onStatusChange: (ticketId: string, status: TicketStatus) => void;
  onPriorityChange: (ticketId: string, priority: TicketPriority) => void;
  onAssignmentChange: (ticketId: string, value: string) => void;
  onResolutionNoteChange: (ticketId: string, value: string) => void;
  onResolutionNoteSave: (ticketId: string) => void;
  onCommentChange: (ticketId: string, value: string) => void;
  onAddComment: (ticketId: string) => void;
  onInternalNoteChange?: (ticketId: string, value: string) => void;
  onAddInternalNote?: (ticketId: string) => void;
  onRequestMoreInformation?: (ticketId: string) => void;
  onMarkCompleted?: (ticketId: string) => void;
  onCloseRequest?: (ticketId: string) => void;
  onChatFilesSelected?: (ticketId: string, files: File[]) => void;
  onReviewApproval: (ticketId: string, decision: 'approved' | 'rejected') => void;
}

export function RequestDetailPanel({
  ticket,
  categories,
  subcategories,
  assignees,
  activities,
  internalNotes = [],
  operationalIndicator,
  attachments,
  customFieldLabelMap,
  priorityOptions,
  currentUserId,
  saving,
  noteDraft,
  commentDraft,
  internalNoteDraft = '',
  canReviewApproval,
  canManageWorkflow = false,
  canCloseAsRequester = false,
  variant = 'pane',
  onPriorityChange,
  onAssignmentChange,
  onResolutionNoteChange,
  onResolutionNoteSave,
  onCommentChange,
  onAddComment,
  onInternalNoteChange,
  onAddInternalNote,
  onRequestMoreInformation,
  onMarkCompleted,
  onCloseRequest,
  onChatFilesSelected,
  onReviewApproval,
}: RequestDetailPanelProps) {
  const extraFields = customFieldEntries(ticket, customFieldLabelMap);
  const gridColumns = variant === 'drawer' ? 'sm:grid-cols-3' : 'md:grid-cols-3';
  const twoColumns = variant === 'drawer' ? 'sm:grid-cols-2' : 'md:grid-cols-2';
  const additionalFieldValueClass = variant === 'drawer' ? 'break-words' : 'truncate';
  const sla = getTicketSlaSummary(ticket);
  const needsBreachReason = sla.overall === 'breached' && !ticket.sla_breach_reason;
  const canRequestInfo = canManageWorkflow && (ticket.status === 'open' || ticket.status === 'in_progress' || ticket.status === 'pending_owner_review' || ticket.status === 'reopened');
  const canMarkCompleted = canManageWorkflow && ticket.status !== 'closed' && ticket.status !== 'cancelled' && ticket.status !== 'completed_by_owner';
  const canClose = canCloseAsRequester && ticket.status === 'completed_by_owner';

  return (
    <div className={variant === 'drawer' ? undefined : 'flex h-full min-h-0 flex-col'}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className={variant === 'drawer'
        ? 'sticky top-0 z-10 -mx-4 border-b border-border bg-background/95 px-4 pb-3 pt-1 backdrop-blur'
        : 'shrink-0 border-b border-border bg-muted/30 px-4 py-3'}
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <RequestStatusBadge status={ticket.status} />
              {isOverdue(ticket) && <RequestBadge tone="red" label="Overdue" />}
              <TicketApprovalSummary ticket={ticket} compact />
            </div>
            <h2 className={variant === 'drawer' ? 'text-base font-semibold leading-6 text-foreground' : 'text-base font-semibold text-foreground'}>{ticket.subject}</h2>
            <p className="text-xs text-muted-foreground">
              Submitted {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
              {ticket.vso_number ? ` · VSO ${ticket.vso_number}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className={variant === 'drawer' ? 'space-y-3 pt-3' : 'min-h-0 flex-1 space-y-3 overflow-y-auto p-4'}>

        {/* Approval action panel — top priority for approvers */}
        {ticket.approval_status && (
          <div className="space-y-2 rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <TicketApprovalSummary ticket={ticket} />
              {canReviewApproval && (
                <div className={variant === 'drawer' ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                    onClick={() => onReviewApproval(ticket.id, 'approved')}
                    disabled={saving}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                    onClick={() => onReviewApproval(ticket.id, 'rejected')}
                    disabled={saving}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
            <TicketApprovalHistory ticketId={ticket.id} />
          </div>
        )}

        {/* Workflow, priority, owner */}
        <div className={`grid gap-2 ${gridColumns}`}>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <p className="eyebrow">Current responsible party</p>
            <p className="mt-1 text-sm font-medium text-foreground">{ticket.current_responsible_party}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{ticket.next_action}</p>
          </div>
          <div className="space-y-1.5">
            <p className="eyebrow">Priority</p>
            <Select
              value={ticket.priority}
              onValueChange={(value) => onPriorityChange(ticket.id, value as TicketPriority)}
              disabled={saving}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="Set priority" /></SelectTrigger>
              <SelectContent>
                {priorityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="eyebrow">Owner</p>
            <Select
              value={ticket.assigned_to ?? 'unassigned'}
              onValueChange={(value) => onAssignmentChange(ticket.id, value)}
              disabled={saving}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="Assign owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {assignees.map((assignee) => (
                  <SelectItem key={assignee.id} value={assignee.id}>{assignee.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border border-border bg-background px-3 py-2">
          <p className="eyebrow flex items-center gap-1.5">
            <Clock3 className="h-3 w-3" />
            Workflow timing
          </p>
          <div className={`mt-1.5 grid gap-2 ${twoColumns}`}>
            <div>
              <p className="text-xs text-muted-foreground">Time in current status</p>
              <p className="text-sm text-foreground">
                {formatDistanceToNow(new Date(ticket.status_changed_at), { addSuffix: false })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last action by</p>
              <p className="text-sm text-foreground">{ticket.last_action_by_name ?? 'System'}</p>
            </div>
          </div>
        </div>

        {/* Metadata cards */}
        <div className={`grid gap-2 ${gridColumns}`}>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <p className="flex items-center gap-1.5 eyebrow">
              <UserRound className="h-3 w-3" />
              Requester
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">{ticket.submitted_by_name ?? 'Unknown requester'}</p>
            {ticket.submitted_by_email && <p className="truncate text-xs text-muted-foreground">{ticket.submitted_by_email}</p>}
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <p className="eyebrow">Category</p>
            <p className="mt-1 text-sm font-medium text-foreground">{getRequestCategoryLabel(ticket.category, categories)}</p>
            {ticket.subcategory && (
              <p className="text-xs text-muted-foreground">
                {getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories)}
              </p>
            )}
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <p className="eyebrow">Owner / PIC</p>
            <p className="mt-1 text-sm font-medium text-foreground">{ticket.assigned_to_name ?? ticket.responsible_queue}</p>
            <p className="text-xs text-muted-foreground">Backup: {ticket.backup_owner_name ?? 'Not assigned'}</p>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <p className="eyebrow">Escalation owner</p>
            <p className="mt-1 text-sm font-medium text-foreground">{ticket.escalation_owner_name ?? 'Not assigned'}</p>
            <p className="text-xs text-muted-foreground">Manager / approver: {ticket.current_approval_step_name ?? 'Not applicable'}</p>
          </div>
        </div>

        <TicketSlaSummary ticket={ticket} />
        <TicketOperationalIndicatorGrid indicator={operationalIndicator} />

        {/* Additional custom fields */}
        {extraFields.length > 0 && (
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <p className="eyebrow">Additional details</p>
            <div className={`mt-1.5 grid gap-2 ${twoColumns}`}>
              {extraFields.map((field) => (
                <div key={field.key} className="min-w-0">
                  <p className="text-xs text-muted-foreground">{field.label}</p>
                  <p className={`${additionalFieldValueClass} text-sm text-foreground`}>{field.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="rounded-md border bg-background px-3 py-2">
          <p className="mb-1 eyebrow">Request detail</p>
          <p className="whitespace-pre-line text-sm leading-5 text-foreground">{ticket.description}</p>
        </div>

        {/* Desired outcome / Business impact */}
        {(ticket.desired_outcome || ticket.business_impact) && (
          <div className={`grid gap-2 ${twoColumns}`}>
            {ticket.desired_outcome && (
              <div className="rounded-md border border-border px-3 py-2">
                <p className="flex items-center gap-1.5 eyebrow">
                  <CheckCircle2 className="h-3 w-3" />
                  Desired outcome
                </p>
                <p className="mt-1 text-sm leading-5 text-foreground">{ticket.desired_outcome}</p>
              </div>
            )}
            {ticket.business_impact && (
              <div className="rounded-md border border-border px-3 py-2">
                <p className="eyebrow">Business impact</p>
                <p className="mt-1 text-sm leading-5 text-foreground">{ticket.business_impact}</p>
              </div>
            )}
          </div>
        )}

        {/* Resolution note */}
        {(ticket.status === 'completed_by_owner' || ticket.status === 'closed' || ticket.resolution_note || canManageWorkflow) && (
          <div className="space-y-2 rounded-md border border-border bg-secondary/20 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Resolution note</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
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
            <p className="text-xs text-muted-foreground">Shown to the requester before final closure.</p>
            {needsBreachReason && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <ShieldAlert className="h-3 w-3" />
                Add a breach reason before completing or closing this request.
              </p>
            )}
          </div>
        )}

        <TicketAttachmentList attachments={attachments} />

        {(canRequestInfo || canMarkCompleted || canClose) && (
          <div className="flex flex-wrap gap-2 rounded-md border border-border bg-background px-3 py-2.5">
            {canRequestInfo && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => onRequestMoreInformation?.(ticket.id)}
                disabled={saving || !commentDraft.trim()}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Need more information
              </Button>
            )}
            {canMarkCompleted && (
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => onMarkCompleted?.(ticket.id)}
                disabled={saving || !noteDraft.trim() || needsBreachReason}
              >
                Mark as completed
              </Button>
            )}
            {canClose && (
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => onCloseRequest?.(ticket.id)}
                disabled={saving || needsBreachReason}
              >
                Close request
              </Button>
            )}
          </div>
        )}

        <TicketChatPanel
          activities={activities}
          currentUserId={currentUserId}
          draft={commentDraft}
          saving={saving}
          onDraftChange={(value) => onCommentChange(ticket.id, value)}
          onSend={() => onAddComment(ticket.id)}
          onAttachFiles={onChatFilesSelected ? (files) => onChatFilesSelected(ticket.id, files) : undefined}
        />

        {canManageWorkflow && (
          <TicketInternalNotesPanel
            notes={internalNotes}
            draft={internalNoteDraft}
            saving={saving}
            onDraftChange={(value) => onInternalNoteChange?.(ticket.id, value)}
            onSend={() => onAddInternalNote?.(ticket.id)}
          />
        )}

        <TicketActivityList activities={activities} />
      </div>
    </div>
  );
}
