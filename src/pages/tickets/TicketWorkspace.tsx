import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Check,
  Clock3,
  Edit2,
  FileText,
  Loader2,
  MoreHorizontal,
  Paperclip,
  ShieldAlert,
  UserRound,
  X,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { listProfiles } from '@flc/auth';
import { listAttachmentsForTickets, uploadTicketAttachment, type TicketAttachmentRecord } from '@flc/platform-services';

import { useAuth } from '@/contexts/AuthContext';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import {
  formatDateTime,
  InfoRow,
  Section,
  WorkflowStrip,
  MessageDialog,
  AuditTrailPanel,
  primaryActionLabel,
} from '@/components/tickets/TicketWorkspaceHelpers';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/tickets/RequestBadge';
import { TicketActivityList } from '@/components/tickets/TicketActivityList';
import { TicketAttachmentList } from '@/components/tickets/TicketAttachmentList';
import { TicketChatPanel } from '@/components/tickets/TicketChatPanel';
import { TicketInternalNotesPanel } from '@/components/tickets/TicketInternalNotesPanel';
import { TicketOperationalIndicatorGrid } from '@/components/tickets/TicketOperationalIndicators';
import { TicketSlaSummary } from '@/components/tickets/TicketSlaSummary';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useBeforeUnloadWarning } from '@/hooks/useBeforeUnloadWarning';
import { usePersistedDraftMap } from '@/hooks/usePersistedDraftMap';
import { STALE } from '@/lib/queryClient';
import { canManagePortalQueue } from '@/lib/portalAccess';
import { getRequestAssignees } from '@/lib/requestAssignees';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { customFieldEntries, formatDueDate, formatTicketLabel } from '@/lib/requestFormatters';
import { getRequestSubcategoryLabel } from '@/lib/requestSubcategories';
import { getTicketSlaSummary } from '@/lib/ticketSla';
import {
  getFallbackTicketListPath,
  readTicketWorkspaceReturnState,
  type TicketWorkspaceTab,
} from '@/lib/ticketWorkspaceNavigation';
import { buildRequestOperationalIndicators } from '@/services/requestManagementService';
import { cn } from '@/lib/utils';
import {
  addTicketComment,
  addTicketInternalNote,
  closeTicketByRequester,
  getAvailableTicketWorkflowActions,
  getTicketWorkspaceData,
  markTicketChatRead,
  markTicketCompletedByOwner,
  rejectTicketCompletion,
  reopenTicketByRequester,
  requestTicketMoreInformation,
  submitRequesterTicketUpdate,
  ticketReplyAndWait,
  transitionTicketWorkflow,
  updateTicket,


  type TicketActivityRecord,
  type TicketCompletionCategory,
  type TicketInternalNoteRecord,
  type TicketPriority,
  type TicketStatus,
  type TicketTransitionAction,
  type TicketResponsibleParty,

} from '@/services/ticketService';

type VisibleTicketWorkspaceTab = 'overview' | 'activity' | 'properties' | 'history';
const visibleTabs: VisibleTicketWorkspaceTab[] = ['overview', 'activity', 'properties', 'history'];
const legacyTabMap: Partial<Record<TicketWorkspaceTab, VisibleTicketWorkspaceTab>> = {
  chat: 'activity',
  'internal-notes': 'activity',
  'audit-trail': 'history',
  details: 'overview',
  attachments: 'overview',
  resolution: 'properties',
};

type TimelineEvent =
  | { id: string; timestamp: number; type: 'comment' | 'system'; record: TicketActivityRecord }
  | { id: string; timestamp: number; type: 'internal_note'; record: TicketInternalNoteRecord };

const priorityOptions: Array<{ value: TicketPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const statusOptions: Array<{ value: TicketStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending_requester', label: 'Pending Requester' },
  { value: 'pending_owner_review', label: 'Pending Owner Review' },
  { value: 'completed_by_owner', label: 'Completed by Owner' },
  { value: 'closed', label: 'Closed' },
  { value: 'reopened', label: 'Reopened' },
  { value: 'cancelled', label: 'Cancelled' },
];

function useTicketDraftField(
  scope: string,
  ticketId: string,
  companyId: string | null | undefined,
  userId: string | null | undefined,
  fallback = '',
) {
  const [drafts, setDrafts, clearDraft] = usePersistedDraftMap(scope, companyId, userId);
  const hasDraft = Boolean(ticketId) && Object.prototype.hasOwnProperty.call(drafts, ticketId);
  const value = hasDraft ? drafts[ticketId] : fallback;
  const setValue = useCallback((nextValue: string) => {
    if (!ticketId) return;
    setDrafts((current) => ({ ...current, [ticketId]: nextValue }));
  }, [setDrafts, ticketId]);
  const clearValue = useCallback(() => {
    if (!ticketId) return;
    clearDraft(ticketId);
  }, [clearDraft, ticketId]);
  return { value, setValue, clearValue, hasDraft };
}

function EditableInfoRow({
  label,
  value,
  onSave,
  disabled
}: {
  label: string;
  value: string | null;
  onSave: (val: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCurrentValue(value ?? '');
  }, [value]);

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(currentValue);
    setSaving(false);
    if (ok) setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="group relative space-y-0.5 rounded-md -mx-2 px-2 py-1 hover:bg-muted/50 transition-colors">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground pr-6">{value || '—'}</p>
        {!disabled && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setIsEditing(true)}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1 -mx-2 px-2 py-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        <Input
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          className="h-7 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave();
            if (e.key === 'Escape') {
              setIsEditing(false);
              setCurrentValue(value ?? '');
            }
          }}
          disabled={saving}
        />
        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 shrink-0" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => { setIsEditing(false); setCurrentValue(value ?? ''); }} disabled={saving}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function EditableSelectRow({
  label,
  value,
  options,
  onSave,
  disabled
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onSave: (val: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(currentValue);
    setSaving(false);
    if (ok) setIsEditing(false);
  };

  const displayLabel = options.find((opt) => opt.value === value)?.label || value || '—';

  if (!isEditing) {
    return (
      <div className="group relative space-y-0.5 rounded-md -mx-2 px-2 py-1 hover:bg-muted/50 transition-colors">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground pr-6">{displayLabel}</p>
        {!disabled && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setIsEditing(true)}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1 -mx-2 px-2 py-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        <Select value={currentValue} onValueChange={setCurrentValue} disabled={saving}>
          <SelectTrigger className="h-7 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 shrink-0" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => { setIsEditing(false); setCurrentValue(value); }} disabled={saving}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function EditableCollaboratorsRow({
  label,
  value,
  options,
  onSave,
  disabled
}: {
  label: string;
  value: string[];
  options: Array<{ value: string; label: string }>;
  onSave: (val: string[]) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState<string[]>(value || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCurrentValue(value || []);
  }, [value]);

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(currentValue);
    setSaving(false);
    if (ok) setIsEditing(false);
  };

  const displayLabel = value && value.length > 0
    ? value.map((id) => options.find((opt) => opt.value === id)?.label || id).join(', ')
    : 'None';

  if (!isEditing) {
    return (
      <div className="group relative space-y-0.5 rounded-md -mx-2 px-2 py-1 hover:bg-muted/50 transition-colors">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground pr-6">{displayLabel}</p>
        {!disabled && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setIsEditing(true)}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1 -mx-2 px-2 py-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-2 rounded-md border p-2 bg-background">
        <div className="max-h-36 overflow-y-auto space-y-1">
          {options.map((opt) => {
            const checked = currentValue.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(isChecked) => {
                    if (isChecked) {
                      setCurrentValue((curr) => [...curr, opt.value]);
                    } else {
                      setCurrentValue((curr) => curr.filter((id) => id !== opt.value));
                    }
                  }}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
        <div className="flex justify-end gap-1 border-t pt-1.5">
          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setIsEditing(false); setCurrentValue(value || []); }} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TicketWorkspace({ ticketIdProp, onClose }: { ticketIdProp?: string; onClose?: () => void } = {}) {
  const params = useParams();
  const ticketId = ticketIdProp || params.ticketId || '';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManageQueue = canManagePortalQueue(user);

  const [saving, setSaving] = useState(false);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [requesterUpdateOpen, setRequesterUpdateOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [rejectCompletionOpen, setRejectCompletionOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [replyAndWaitDialogOpen, setReplyAndWaitDialogOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected' | null>(null);
  const [completionCategory, setCompletionCategory] = useState<TicketCompletionCategory>('resolved');
  const [completionChecklistConfirmed, setCompletionChecklistConfirmed] = useState(false);
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [satisfactionRating, setSatisfactionRating] = useState('5');
  const [selectedAssignee, setSelectedAssignee] = useState('unassigned');
  const [selectedPriority, setSelectedPriority] = useState<TicketPriority>('medium');
  const [overrideStatus, setOverrideStatus] = useState<TicketStatus>('in_progress');

  const activeTabParam = searchParams.get('tab') as TicketWorkspaceTab | null;
  const requestedTab = activeTabParam ? legacyTabMap[activeTabParam] ?? activeTabParam : null;
  const activeTab: VisibleTicketWorkspaceTab = requestedTab && visibleTabs.includes(requestedTab as VisibleTicketWorkspaceTab)
    ? requestedTab as VisibleTicketWorkspaceTab
    : 'overview';

  const { categories } = useRequestCategories(user?.company_id, true);
  const { subcategories } = useRequestSubcategories(user?.company_id, { includeInactive: true });
  const { fields: formFields } = useRequestFormFields(user?.company_id, { includeInactive: true });

  const workspaceQueryKey = useMemo(
    () => ['ticket-workspace', ticketId, user?.id, user?.company_id] as const,
    [ticketId, user?.company_id, user?.id],
  );
  const { data, isLoading, error } = useQuery({
    queryKey: workspaceQueryKey,
    enabled: Boolean(user && ticketId),
    staleTime: STALE.transactional,
    queryFn: async () => {
      const result = await getTicketWorkspaceData(ticketId, {
        userId: user!.id,
        companyId: user!.company_id,
        userRole: user!.role,
        canManagePortalQueue: canManageQueue,
      });
      if (result.error || !result.data) throw result.error ?? new Error('Unable to load request workspace.');

      const [{ data: attachmentData }, profileResult] = await Promise.all([
        listAttachmentsForTickets([ticketId], user!.company_id),
        listProfiles(user!.company_id),
      ]);
      if (profileResult.error) throw new Error(profileResult.error);

      const operationalIndicators = buildRequestOperationalIndicators(
        [result.data.ticket],
        { [ticketId]: result.data.activities },
        { [ticketId]: result.data.chatSummary },
      );

      return {
        ...result.data,
        attachments: attachmentData?.[ticketId] ?? ([] as TicketAttachmentRecord[]),
        assignees: getRequestAssignees(profileResult.data),
        operationalIndicator: operationalIndicators[ticketId],
      };
    },
  });

  const ticket = data?.ticket ?? null;
  const sla = ticket ? getTicketSlaSummary(ticket) : null;
  const needsBreachReason = sla?.overall === 'breached' && !ticket?.sla_breach_reason;

  const chatDraft = useTicketDraftField('workspace:chat', ticketId, user?.company_id, user?.id);
  const internalNote = useTicketDraftField('workspace:internal-note', ticketId, user?.company_id, user?.id);
  const workflowMessage = useTicketDraftField('workspace:workflow-message', ticketId, user?.company_id, user?.id);
  const resolutionDraft = useTicketDraftField('workspace:resolution', ticketId, user?.company_id, user?.id, ticket?.resolution_note ?? '');
  const breachReason = useTicketDraftField('workspace:breach-reason', ticketId, user?.company_id, user?.id, ticket?.sla_breach_reason ?? '');
  const closureFeedback = useTicketDraftField('workspace:closure-feedback', ticketId, user?.company_id, user?.id);
  const reopenReason = useTicketDraftField('workspace:reopen-reason', ticketId, user?.company_id, user?.id);
  const overrideReason = useTicketDraftField('workspace:override-reason', ticketId, user?.company_id, user?.id);
  const reviewNote = useTicketDraftField('workspace:review-note', ticketId, user?.company_id, user?.id);
  const resolutionSummary = resolutionDraft.value;
  const completionBreachReason = breachReason.value;
  const resolutionDirty = Boolean(
    ticket
    && resolutionDraft.hasDraft
    && resolutionSummary.trim() !== (ticket.resolution_note ?? '').trim(),
  );
  const breachReasonDirty = Boolean(
    ticket
    && breachReason.hasDraft
    && completionBreachReason.trim() !== (ticket.sla_breach_reason ?? '').trim(),
  );
  const customFieldLabelMap = useMemo(
    () => Object.fromEntries(formFields.map((field) => [`${field.category_key}:${field.key}`, field.label])),
    [formFields],
  );
  const customFields = ticket ? customFieldEntries(ticket, customFieldLabelMap) : [];
  const workflowActions = useMemo(() => {
    if (!ticket || !user || !data) return [] as TicketTransitionAction[];
    return getAvailableTicketWorkflowActions(ticket, {
      userId: user.id,
      companyId: user.company_id,
      userRole: user.role,
      canManagePortalQueue: data.permissions.canManageWorkflow,
      canAdminOverride: data.permissions.canManageWorkflow,
      isAssignedApprover: data.permissions.canReviewApproval,
    });
  }, [data, ticket, user]);
  const canWorkflow = useCallback(
    (action: TicketTransitionAction) => workflowActions.includes(action),
    [workflowActions],
  );
  const workflowActor = user && data ? {
    userId: user.id,
    companyId: user.company_id,
    role: user.role,
    isRequester: ticket?.submitted_by === user.id,
    canManageQueue: data.permissions.canManageWorkflow,
    canAdminOverride: data.permissions.canManageWorkflow,
    isAssignedApprover: data.permissions.canReviewApproval,
  } : null;

  useEffect(() => {
    if (!ticket) return;
    if (!assignOpen) setSelectedAssignee(ticket.assigned_to ?? 'unassigned');
    if (!priorityOpen) setSelectedPriority(ticket.priority);
    if (!overrideOpen) setOverrideStatus(ticket.status === 'closed' ? 'in_progress' : ticket.status);
  }, [assignOpen, overrideOpen, priorityOpen, ticket]);

  useEffect(() => {
    if (!user || !ticket || activeTab !== 'activity') return;
    void markTicketChatRead(ticket.id, { userId: user.id, companyId: user.company_id });
  }, [activeTab, ticket, user]);

  const refreshWorkspace = useCallback(
    () => queryClient.invalidateQueries({ queryKey: workspaceQueryKey }),
    [queryClient, workspaceQueryKey],
  );

  useTicketsRealtime({
    companyId: user?.company_id,
    scope: 'ticket-workspace',
    onChange: refreshWorkspace,
  });

  const runWorkflow = useCallback(async (
    operation: () => Promise<{ error: Error | string | null }>,
    successMessage: string,
    optimisticPatch?: Record<string, unknown>,
  ) => {
    setSaving(true);
    const previousData = optimisticPatch
      ? queryClient.getQueryData(workspaceQueryKey)
      : undefined;
    if (optimisticPatch && previousData) {
      queryClient.setQueryData(workspaceQueryKey, (old: Record<string, unknown> | undefined) => {
        if (!old?.ticket) return old;
        return { ...old, ticket: { ...old.ticket, ...optimisticPatch } };
      });
    }
    const result = await operation();
    setSaving(false);
    if (result.error) {
      if (optimisticPatch && previousData) {
        queryClient.setQueryData(workspaceQueryKey, previousData);
      }
      toast.error(typeof result.error === 'string' ? result.error : result.error.message);
      return false;
    }
    toast.success(successMessage);
    await refreshWorkspace();
    return true;
  }, [refreshWorkspace, queryClient, workspaceQueryKey]);

  const handleBack = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (!ticket) {
      navigate('/portal/tickets');
      return;
    }
    const state = readTicketWorkspaceReturnState(ticket.id);
    if (state) {
      navigate(state.path, { state: { ticketWorkspaceReturnState: state } });
      return;
    }
    navigate(getFallbackTicketListPath(canManageQueue, ticket.status === 'closed'));
  };

  const setTab = useCallback((nextTab: string) => {
    setSearchParams(nextTab === 'overview' ? {} : { tab: nextTab });
  }, [setSearchParams]);

  const handlePrimaryAction = async () => {
    if (!ticket || !user || !data) return;
    if (canWorkflow('start_work')) {
      await runWorkflow(
        () => transitionTicketWorkflow({
          ticketId: ticket.id,
          action: 'start_work',
          actor: workflowActor!,
          payload: { kind: 'start_work' },
        }),
        'Request accepted and status set to In Progress',
      );
    } else if (canWorkflow('complete_by_owner')) {
      setCompletionOpen(true);
    } else if (canWorkflow('requester_reply')) {
      setRequesterUpdateOpen(true);
    } else if (canWorkflow('close_by_requester')) {
      setCloseOpen(true);
    } else if (canWorkflow('reopen_by_requester')) {
      setReopenOpen(true);
    }
  };

  const handleAddComment = async () => {
    const message = chatDraft.value.trim();
    if (!ticket || !user || !message) return false;
    const ok = await runWorkflow(
      () => addTicketComment(ticket.id, { message }, { userId: user.id, companyId: user.company_id }),
      'Message sent',
    );
    if (ok) chatDraft.clearValue();
    return ok;
  };

  const handleReplyAndWait = async () => {
    const message = chatDraft.value.trim();
    if (!ticket || !user || !message) return true;
    const ok = await runWorkflow(
      () => ticketReplyAndWait(ticket.id, message, { userId: user.id, companyId: user.company_id }),
      'Replied and paused SLA',
    );
    if (ok) chatDraft.clearValue();
    return ok;
  };

  const handleAddInternalNote = async () => {
    const note = internalNote.value.trim();
    if (!ticket || !user || !note) return;
    const ok = await runWorkflow(
      () => addTicketInternalNote(ticket.id, { note, mentions: [] }, { userId: user.id, companyId: user.company_id }),
      'Internal note added',
    );
    if (ok) internalNote.clearValue();
  };

  const handleChatFilesSelected = async (files: File[]) => {
    if (!ticket || !user || files.length === 0) return;
    setSaving(true);
    try {
      const settled = await Promise.allSettled(
        files.map((file) => uploadTicketAttachment(file, ticket.id, user.company_id, user.id)),
      );

      const successfulNames: string[] = [];
      const failedNames: string[] = [];

      settled.forEach((result, index) => {
        if (result.status === 'fulfilled' && !result.value.error) {
          successfulNames.push(files[index].name);
        } else {
          failedNames.push(files[index].name);
        }
      });

      if (successfulNames.length > 0) {
        await addTicketComment(
          ticket.id,
          { message: `Attached ${successfulNames.length} file${successfulNames.length === 1 ? '' : 's'}.`, attachmentNames: successfulNames },
          { userId: user.id, companyId: user.company_id },
        );
      }

      if (failedNames.length > 0 && successfulNames.length > 0) {
        toast.warning(`${failedNames.length} file${failedNames.length === 1 ? '' : 's'} failed to upload: ${failedNames.join(', ')}`);
      } else if (failedNames.length > 0) {
        toast.error(`All ${failedNames.length} file${failedNames.length === 1 ? '' : 's'} failed to upload.`);
      }
    } finally {
      setSaving(false);
      void refreshWorkspace();
    }
  };

  const hasUnsavedChanges = Boolean(
    chatDraft.value.trim()
    || internalNote.value.trim()
    || workflowMessage.value.trim()
    || resolutionDirty
    || breachReasonDirty
    || closureFeedback.value.trim()
    || reopenReason.value.trim()
    || overrideReason.value.trim()
    || reviewNote.value.trim()
  );

  useBeforeUnloadWarning(hasUnsavedChanges);

  const requestRefreshWorkspace = () => {
    if (hasUnsavedChanges) {
      toast.info('Save or discard workspace changes before refreshing.');
      return;
    }
    void refreshWorkspace();
  };

  const timelineEvents = useMemo(() => {
    if (!data) return [];
    const events: TimelineEvent[] = [];

    data.activities.forEach((act) => {
      events.push({
        id: act.id,
        timestamp: act.created_at ? new Date(act.created_at).getTime() : 0,
        type: act.event_type === 'comment_added' ? 'comment' : 'system',
        record: act,
      });
    });

    data.internalNotes?.forEach((note) => {
      events.push({
        id: note.id,
        timestamp: new Date(note.created_at).getTime(),
        type: 'internal_note',
        record: note,
      });
    });

    return events.sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  const historyActivities = useMemo(() => {
    if (!data) return [];
    return data.activities.filter((act) => act.event_type !== 'comment_added');
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !ticket || !data) {
    return (
      <div className="p-4 lg:p-6">
        <HrmsEmptyState
          icon={AlertCircle}
          title="Unable to load request workspace"
          description={(error as Error)?.message ?? 'The request could not be found or you do not have access.'}
          action={{ label: 'Back to requests', onClick: () => navigate(getFallbackTicketListPath(canManageQueue)) }}
        />
      </div>
    );
  }

  const primaryLabel = primaryActionLabel(ticket, data.permissions, workflowActions);

  return (
    <Tabs value={activeTab} onValueChange={setTab} className="flex h-full flex-col bg-background overflow-hidden">
      <header className="sticky top-0 z-20 flex shrink-0 flex-col bg-background shadow-sm">
        <div className="flex flex-col gap-3 p-4 pb-0">
          {/* Row 1: Badges & Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleBack}>
                <X className="h-4 w-4" />
              </Button>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ID: {ticket.id}</span>
              <RequestStatusBadge status={ticket.status} />
              <TicketSlaSummary ticket={ticket} compact />
              <RequestPriorityBadge priority={ticket.priority} />
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {data.permissions.canManageWorkflow && (
                    <>
                      <DropdownMenuItem onClick={() => setAssignOpen(true)}>Assign owner</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPriorityOpen(true)}>Change priority</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setOverrideOpen(true)}>Admin override status</DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={requestRefreshWorkspace}>Refresh workspace</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Row 2: Title & Meta */}
          <div className="space-y-1.5 px-1">
            <h1 className="break-words text-lg font-semibold leading-tight text-foreground">{ticket.subject}</h1>
            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
              <span>Requester: <span className="font-medium text-foreground">{ticket.submitted_by_name ?? ticket.submitted_by_email ?? 'Unknown'}</span></span>
              <span>•</span>
              <span>Submitted: {formatDateTime(ticket.created_at)}</span>
              <span>•</span>
              <span>Updated: {formatDateTime(ticket.updated_at)}</span>
            </div>
          </div>

          {/* Row 3: Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2 px-1 pb-2">
            {data.permissions.canManageWorkflow && (
              <>
                <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] px-2.5 gap-1" onClick={() => setInfoDialogOpen(true)} disabled={saving || !canWorkflow('request_more_info')}>
                  Request Info
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] px-2.5 gap-1" onClick={() => setReplyAndWaitDialogOpen(true)} disabled={saving || !canWorkflow('request_more_info')}>
                  Reply & Wait
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] px-2.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => setEscalateOpen(true)} disabled={saving || !canWorkflow('escalate')}>
                  Escalate
                </Button>
                {primaryLabel && (
                  <Button type="button" size="sm" className="h-7 text-[11px] px-2.5" onClick={() => void handlePrimaryAction()} disabled={saving}>
                    {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    {primaryLabel}
                  </Button>
                )}
              </>
            )}
            {!data.permissions.canManageWorkflow && primaryLabel && (
              <Button type="button" size="sm" className="h-7 text-[11px] px-2.5" onClick={() => void handlePrimaryAction()} disabled={saving}>
                {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {primaryLabel}
              </Button>
            )}
            {canWorkflow('reject_completion') && (
              <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] px-2.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => setRejectCompletionOpen(true)} disabled={saving}>
                Reject Completion
              </Button>
            )}
            {data.permissions.canReviewApproval && (
              <>
                <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] px-2.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => setReviewDecision('rejected')} disabled={saving || !canWorkflow('reject_step')}>
                  Reject
                </Button>
                <Button type="button" variant="default" size="sm" className="h-7 text-[11px] px-2.5 gap-1" onClick={() => setReviewDecision('approved')} disabled={saving || !canWorkflow('approve_step')}>
                  Approve
                </Button>
              </>
            )}
          </div>
          <div className="px-1 pb-3">
            <WorkflowStrip status={ticket.status} />
          </div>
        </div>

        {needsBreachReason && (
          <div className="mx-4 mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <p className="font-semibold">SLA breach reason required</p>
              <p className="mt-0.5">Provide a breach reason during completion before this request can be closed.</p>
            </div>
          </div>
        )}

        {/* Tabs inside Sticky Header */}
        <div className="border-t border-border bg-background px-4">
          <TabsList className="flex h-10 gap-5 border-b-0 bg-transparent p-0">
            <TabsTrigger value="overview" className="h-full rounded-none border-b-2 border-transparent px-1 py-0 text-xs font-medium text-muted-foreground bg-transparent hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent">Overview</TabsTrigger>
            <TabsTrigger value="activity" className="h-full rounded-none border-b-2 border-transparent px-1 py-0 text-xs font-medium text-muted-foreground bg-transparent hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent">Activity</TabsTrigger>
            <TabsTrigger value="properties" className="h-full rounded-none border-b-2 border-transparent px-1 py-0 text-xs font-medium text-muted-foreground bg-transparent hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent">Properties</TabsTrigger>
            <TabsTrigger value="history" className="h-full rounded-none border-b-2 border-transparent px-1 py-0 text-xs font-medium text-muted-foreground bg-transparent hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent">History</TabsTrigger>
          </TabsList>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-5 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
            <TabsContent value="overview" className="m-0 space-y-4 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
              <Section title="Request description" icon={FileText}>
                <p className="whitespace-pre-line text-sm leading-6 text-foreground">{ticket.description}</p>
              </Section>

              <Section title="Requester Information" icon={UserRound}>
                <div className="space-y-3 text-sm">
                  <InfoRow label="Name" value={ticket.submitted_by_name ?? ticket.submitted_by_email ?? 'Unknown'} />
                  <InfoRow label="VSO" value={ticket.vso_number ?? 'N/A'} />
                  <InfoRow label="Email" value={ticket.submitted_by_email ?? 'N/A'} />
                </div>
              </Section>

              <Section title="Key Metadata">
                <div className="space-y-3 text-sm">
                  <InfoRow label="Category" value={getRequestCategoryLabel(ticket.category, categories)} />
                  <InfoRow label="Subcategory" value={ticket.subcategory ? getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories) : 'Not selected'} />
                  <InfoRow label="Priority" value={formatTicketLabel(ticket.priority)} />
                  <InfoRow label="SLA Status" value={sla ? formatTicketLabel(sla.overall) : 'Not configured'} />
                  <InfoRow label="Requested due date" value={ticket.requested_due_date ? formatDueDate(ticket.requested_due_date) : 'Not provided'} />
                  <InfoRow label="Desired outcome" value={ticket.desired_outcome ?? 'Not provided'} />
                  <InfoRow label="Business impact" value={ticket.business_impact ?? 'Not provided'} />
                  <InfoRow label="Submitted" value={formatDateTime(ticket.created_at)} />
                </div>
              </Section>

              {customFields.length > 0 && (
                <Section title="Additional fields">
                  <div className="space-y-3 text-sm">
                    {customFields.map((field) => (
                      <InfoRow key={field.key} label={field.label} value={field.value} />
                    ))}
                  </div>
                </Section>
              )}

              <TicketSlaSummary ticket={ticket} />
              <TicketOperationalIndicatorGrid indicator={data.operationalIndicator} />

              {data.attachments.length > 0 && (
                <Section title="Attachments" icon={Paperclip}>
                  <TicketAttachmentList attachments={data.attachments} />
                </Section>
              )}
            </TabsContent>

            <TabsContent value="activity" className="m-0 space-y-4 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
              <div className="space-y-4">
                <TicketChatPanel
                  activities={data.activities}
                  currentUserId={user?.id}
                  draft={chatDraft.value}
                  saving={saving}
                  onDraftChange={chatDraft.setValue}
                  onSend={() => void handleAddComment()}
                  onReplyAndWait={data.permissions.canManageWorkflow ? () => void handleReplyAndWait() : undefined}
                  onAttachFiles={(files) => void handleChatFilesSelected(files)}
                />

                {data.permissions.canViewInternalNotes && (
                  <TicketInternalNotesPanel
                    notes={data.internalNotes}
                    draft={internalNote.value}
                    saving={saving}
                    onDraftChange={internalNote.setValue}
                    onSend={() => void handleAddInternalNote()}
                  />
                )}

                <div className="space-y-3 border-t pt-5">
                  <p className="eyebrow flex items-center gap-1.5 text-foreground">Discussion Timeline</p>
                  <div className="space-y-4">
                    {timelineEvents.map((evt) => {
                      if (evt.type === 'comment') {
                        const message = evt.record;
                        const mine = message.actor_id === user?.id;
                        return (
                          <div key={evt.id} className={cn('flex w-full', mine ? 'justify-end' : 'justify-start')}>
                            <div className={cn('max-w-[95%] md:max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm', mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border border-border bg-card text-foreground')}>
                              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] opacity-90">
                                <span className="font-semibold">{message.actor_name ?? 'User'}</span>
                                {!mine && <span className="rounded bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Public Reply</span>}
                                {mine && <span className="rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">You</span>}
                              </div>
                              <p className="whitespace-pre-line leading-relaxed">{message.message}</p>
                              {Array.isArray(message.metadata?.attachment_names) && message.metadata.attachment_names.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {message.metadata.attachment_names.filter((name): name is string => typeof name === 'string').map((name) => (
                                    <span key={name} className="flex items-center gap-1.5 text-[11px] opacity-80">
                                      <Paperclip className="h-3 w-3" />
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <p className="mt-2 text-[10px] opacity-70">
                                {message.created_at ? formatDistanceToNow(new Date(message.created_at), { addSuffix: true }) : ''}
                              </p>
                            </div>
                          </div>
                        );
                      } else if (evt.type === 'internal_note') {
                        const note = evt.record;
                        return (
                          <div key={evt.id} className="flex w-full justify-start">
                            <div className="max-w-[95%] md:max-w-[85%] rounded-2xl rounded-bl-sm border border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/30 px-4 py-3 text-sm shadow-sm">
                              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] opacity-90">
                                <span className="font-semibold text-amber-900 dark:text-amber-200">{note.author_name ?? 'Internal User'}</span>
                                <span className="rounded bg-amber-200/50 dark:bg-amber-900/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">Internal Note</span>
                              </div>
                              <p className="whitespace-pre-line leading-relaxed text-amber-950 dark:text-amber-100">{note.note}</p>
                              {note.mentions?.length > 0 && (
                                <p className="mt-2 text-[11px] font-medium text-amber-800/80 dark:text-amber-300/80">Mentions: {note.mentions.join(', ')}</p>
                              )}
                              <p className="mt-2 text-[10px] text-amber-800/60 dark:text-amber-300/60">
                                {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        );
                      } else {
                        const activity = evt.record;
                        return (
                          <div key={evt.id} className="mx-auto w-[90%] md:w-[75%] rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-4">
                            <span className="font-medium text-foreground">{activity.message}</span>
                            <span className="shrink-0 text-[10px]">
                              {activity.actor_name ? `${activity.actor_name} • ` : ''}
                              {activity.created_at ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true }) : ''}
                            </span>
                          </div>
                        );
                      }
                    })}
                    {timelineEvents.length === 0 && (
                      <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/5">
                        No discussion history yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="properties" className="m-0 space-y-4 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
              <Section title="Request Properties">
                <div className="space-y-4">
                  <EditableSelectRow
                    label="Responsible Party"
                    value={ticket.current_responsible_party}
                    options={[
                      { value: 'Owner', label: 'Owner' },
                      { value: 'Requester', label: 'Requester' },
                      { value: 'Backup Owner', label: 'Backup Owner' },
                      { value: 'Manager', label: 'Manager' },
                      { value: 'Escalation Owner', label: 'Escalation Owner' },
                      { value: 'Admin', label: 'Admin' },
                      { value: 'None', label: 'None' }
                    ]}
                    onSave={async (val) => {
                      if (!user) return false;
                      const res = await runWorkflow(
                        () => updateTicket(ticket.id, { current_responsible_party: val as TicketResponsibleParty }, { userId: user.id, companyId: user.company_id }),
                        'Responsible party updated successfully'
                      );
                      return res;
                    }}
                    disabled={!data.permissions.canManageWorkflow}
                  />

                  <EditableSelectRow
                    label="Primary Owner"
                    value={ticket.assigned_to ?? 'unassigned'}
                    options={[
                      { value: 'unassigned', label: 'Unassigned' },
                      ...data.assignees.map((a) => ({ value: a.id, label: a.name }))
                    ]}
                    onSave={async (val) => {
                      if (!user) return false;
                      const res = await runWorkflow(
                        () => transitionTicketWorkflow({
                          ticketId: ticket.id,
                          action: 'reassign_owner',
                          actor: workflowActor!,
                          payload: {
                            kind: 'reassign_owner',
                            newOwnerId: val === 'unassigned' ? null : val,
                            transitionNote: 'Owner changed from request properties.',
                          },
                        }),
                        'Owner updated successfully'
                      );
                      return res;
                    }}
                    disabled={!data.permissions.canManageWorkflow}
                  />

                  <EditableCollaboratorsRow
                    label="Collaborators"
                    value={ticket.collaborator_ids || []}
                    options={data.assignees.map((a) => ({ value: a.id, label: a.name }))}
                    onSave={async (val) => {
                      if (!user) return false;
                      const res = await runWorkflow(
                        () => updateTicket(ticket.id, { collaborator_ids: val }, { userId: user.id, companyId: user.company_id }),
                        'Collaborators updated successfully'
                      );
                      return res;
                    }}
                    disabled={!data.permissions.canManageWorkflow}
                  />

                  <EditableSelectRow
                    label="Status"
                    value={ticket.status}
                    options={
                      [
                        { value: 'open', label: 'Open' },
                        { value: 'in_progress', label: 'In Progress' },
                        { value: 'pending_requester', label: 'Pending Requester' },
                        { value: 'pending_owner_review', label: 'Pending Owner Review' },
                        { value: 'completed_by_owner', label: 'Completed by Owner' },
                        { value: 'closed', label: 'Closed' },
                        { value: 'reopened', label: 'Reopened' },
                        { value: 'cancelled', label: 'Cancelled' },
                      ]
                    }
                    onSave={async () => {
                      setOverrideOpen(true);
                      return false;
                    }}
                    disabled={!data.permissions.canManageWorkflow}
                  />

                  <EditableSelectRow
                    label="Priority"
                    value={ticket.priority}
                    options={[
                      { value: 'low', label: 'Low' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'high', label: 'High' },
                    ]}
                    onSave={async (val) => {
                      if (!user) return false;
                      const res = await runWorkflow(
                        () => updateTicket(ticket.id, { priority: val as TicketPriority }, { userId: user.id, companyId: user.company_id }),
                        'Priority updated successfully'
                      );
                      return res;
                    }}
                    disabled={!data.permissions.canManageWorkflow}
                  />

                  <EditableSelectRow
                    label="Category"
                    value={ticket.category}
                    options={categories.map((c) => ({ value: c.key, label: c.label }))}
                    onSave={async (val) => {
                      if (!user) return false;
                      const res = await runWorkflow(
                        () => updateTicket(ticket.id, { category: val }, { userId: user.id, companyId: user.company_id }),
                        'Category updated successfully'
                      );
                      return res;
                    }}
                    disabled={!data.permissions.canManageWorkflow}
                  />

                  <EditableInfoRow
                    label="Next Action"
                    value={ticket.next_action}
                    onSave={async (val) => {
                      if (!user) return false;
                      const res = await runWorkflow(
                        () => updateTicket(ticket.id, { next_action: val }, { userId: user.id, companyId: user.company_id }),
                        'Next action updated successfully'
                      );
                      return res;
                    }}
                    disabled={!data.permissions.canManageWorkflow}
                  />

                  <EditableInfoRow
                    label="SLA Target"
                    value={ticket.resolution_due_at ? formatDateTime(ticket.resolution_due_at) : 'Not configured'}
                    onSave={async (val) => {
                      if (!user) return false;
                      const res = await runWorkflow(
                        () => updateTicket(ticket.id, { resolution_due_at: val }, { userId: user.id, companyId: user.company_id }),
                        'SLA target updated successfully'
                      );
                      return res;
                    }}
                    disabled={!data.permissions.canManageWorkflow}
                  />
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="history" className="m-0 space-y-4 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
              <Section title="Request Audit Log" icon={Clock3}>
                <div className="space-y-4">
                  {data.permissions.canViewAuditTrail ? (
                    <AuditTrailPanel entries={data.auditEntries} activities={data.activities} />
                  ) : (
                    <>
                      <TicketActivityList activities={historyActivities} />
                      {historyActivities.length === 0 && (
                        <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/5">
                          No system events recorded.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Section>
            </TabsContent>
          </div>
        </div>

      <MessageDialog
        open={infoDialogOpen}
        title="Request more information"
        description="This moves the request to Pending Requester and records the message in chat."
        value={workflowMessage.value}
        onValueChange={workflowMessage.setValue}
        saving={saving}
        onOpenChange={setInfoDialogOpen}
        onSubmit={async () => {
          if (!user || !workflowMessage.value.trim()) return;
          const ok = await runWorkflow(
            () => requestTicketMoreInformation(ticket.id, { message: workflowMessage.value.trim() }, { userId: user.id, companyId: user.company_id }),
            'Information requested',
          );
          if (ok) {
            workflowMessage.clearValue();
            setInfoDialogOpen(false);
          }
        }}
      />

      <MessageDialog
        open={replyAndWaitDialogOpen}
        title="Reply & Wait"
        description="Type a public message to the requester. This will send the reply, set the ticket to Pending Requester, and pause the SLA."
        value={workflowMessage.value}
        onValueChange={workflowMessage.setValue}
        saving={saving}
        onOpenChange={setReplyAndWaitDialogOpen}
        onSubmit={async () => {
          if (!user || !workflowMessage.value.trim()) return;
          const ok = await runWorkflow(
            () => ticketReplyAndWait(ticket.id, workflowMessage.value.trim(), { userId: user.id, companyId: user.company_id }),
            'Replied and paused SLA',
          );
          if (ok) {
            workflowMessage.clearValue();
            setReplyAndWaitDialogOpen(false);
          }
        }}
      />

      <MessageDialog
        open={escalateOpen}
        title="Escalate Request"
        description="Provide a reason for escalating this request. The ticket's responsible party will be set to 'Escalation Owner'."
        value={overrideReason.value}
        onValueChange={overrideReason.setValue}
        saving={saving}
        onOpenChange={setEscalateOpen}
        onSubmit={async () => {
          if (!user || !overrideReason.value.trim()) return;
          const ok = await runWorkflow(
            () => transitionTicketWorkflow({
              ticketId: ticket.id,
              action: 'escalate',
              actor: workflowActor!,
              payload: { kind: 'escalate', reason: overrideReason.value.trim(), escalationOwnerId: ticket.escalation_owner_id },
            }),
            'Ticket escalated successfully',
          );
          if (ok) {
            overrideReason.clearValue();
            setEscalateOpen(false);
          }
        }}
      />

      <MessageDialog
        open={requesterUpdateOpen}
        title="Submit update"
        description="This moves the request to Pending Owner Review."
        value={workflowMessage.value}
        onValueChange={workflowMessage.setValue}
        saving={saving}
        onOpenChange={setRequesterUpdateOpen}
        onSubmit={async () => {
          if (!user || !workflowMessage.value.trim()) return;
          const ok = await runWorkflow(
            () => submitRequesterTicketUpdate(ticket.id, { message: workflowMessage.value.trim() }, { userId: user.id, companyId: user.company_id }),
            'Update submitted',
          );
          if (ok) {
            workflowMessage.clearValue();
            setRequesterUpdateOpen(false);
          }
        }}
      />

      <Dialog open={completionOpen} onOpenChange={(open) => { setCompletionOpen(open); if (!open) setCompletionChecklistConfirmed(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mark request completed</DialogTitle>
            <DialogDescription>Completion is auditable and visible to the requester before final closure.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="resolution-summary">Resolution summary</Label>
              <Textarea id="resolution-summary" value={resolutionSummary} onChange={(event) => resolutionDraft.setValue(event.target.value)} rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label>Completion category</Label>
              <Select value={completionCategory} onValueChange={(value) => setCompletionCategory(value as TicketCompletionCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="partially_resolved">Partially Resolved</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                  <SelectItem value="no_action_needed">No Action Needed</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {needsBreachReason && (
              <div className="space-y-1.5">
                <Label htmlFor="breach-reason">Breach reason</Label>
                <Textarea id="breach-reason" value={completionBreachReason} onChange={(event) => breachReason.setValue(event.target.value)} rows={3} />
              </div>
            )}
            <label htmlFor="completion-checklist" className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <Checkbox id="completion-checklist" checked={completionChecklistConfirmed} onCheckedChange={(checked) => setCompletionChecklistConfirmed(Boolean(checked))} />
              <span>Resolution, category, attachments, and breach reason are complete where required.</span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCompletionOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={saving || !resolutionSummary.trim() || !completionChecklistConfirmed || (needsBreachReason && !completionBreachReason.trim())}
              onClick={async () => {
                if (!user) return;
                const ok = await runWorkflow(
                  () => markTicketCompletedByOwner(
                    ticket.id,
                    {
                      resolutionNote: resolutionSummary,
                      completionCategory,
                      checklistConfirmed: completionChecklistConfirmed,
                      slaBreachReason: completionBreachReason,
                    },
                    { userId: user.id, companyId: user.company_id },
                  ),
                  'Request marked completed',
                );
                if (ok) {
                  resolutionDraft.clearValue();
                  breachReason.clearValue();
                  setCompletionOpen(false);
                }
              }}
            >
              Mark completed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close request</DialogTitle>
            <DialogDescription>Confirm the owner resolution and optionally rate the experience.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label htmlFor="close-confirmed" className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <Checkbox id="close-confirmed" checked={closeConfirmed} onCheckedChange={(checked) => setCloseConfirmed(Boolean(checked))} />
              <span>I confirm this request is resolved.</span>
            </label>
            <div className="space-y-1.5">
              <Label>Satisfaction rating</Label>
              <Select value={satisfactionRating} onValueChange={setSatisfactionRating}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[5, 4, 3, 2, 1].map((rating) => <SelectItem key={rating} value={String(rating)}>{rating}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Textarea value={closureFeedback.value} onChange={(event) => closureFeedback.setValue(event.target.value)} rows={3} placeholder="Optional feedback" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={saving || !closeConfirmed}
              onClick={async () => {
                if (!user) return;
                const ok = await runWorkflow(
                  () => closeTicketByRequester(
                    ticket.id,
                    { confirmedResolved: closeConfirmed, satisfactionRating: Number(satisfactionRating), feedbackComment: closureFeedback.value },
                    { userId: user.id, companyId: user.company_id },
                  ),
                  'Request closed',
                );
                if (ok) {
                  closureFeedback.clearValue();
                  setCloseOpen(false);
                }
              }}
            >
              Close request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MessageDialog
        open={rejectCompletionOpen}
        title="Reject completion"
        description="Provide the reason so the owner can continue the request."
        value={reopenReason.value}
        onValueChange={reopenReason.setValue}
        saving={saving}
        onOpenChange={setRejectCompletionOpen}
        onSubmit={async () => {
          if (!user || !reopenReason.value.trim()) return;
          const ok = await runWorkflow(
            () => rejectTicketCompletion(ticket.id, { reason: reopenReason.value }, { userId: user.id, companyId: user.company_id }),
            'Completion rejected',
          );
          if (ok) {
            reopenReason.clearValue();
            setRejectCompletionOpen(false);
          }
        }}
      />

      <MessageDialog
        open={reopenOpen}
        title="Reopen request"
        description="Provide the reason so the owner understands what needs attention."
        value={reopenReason.value}
        onValueChange={reopenReason.setValue}
        saving={saving}
        onOpenChange={setReopenOpen}
        onSubmit={async () => {
          if (!user || !reopenReason.value.trim()) return;
          const ok = await runWorkflow(
            () => reopenTicketByRequester(ticket.id, { reason: reopenReason.value }, { userId: user.id, companyId: user.company_id }),
            'Request reopened',
          );
          if (ok) {
            reopenReason.clearValue();
            setReopenOpen(false);
          }
        }}
      />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign owner</DialogTitle>
            <DialogDescription>Owner changes are recorded in the request activity trail.</DialogDescription>
          </DialogHeader>
          <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
            <SelectTrigger><SelectValue placeholder="Assign owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {data.assignees.map((assignee) => (
                <SelectItem key={assignee.id} value={assignee.id}>{assignee.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (!user) return;
                const ok = await runWorkflow(
                  () => transitionTicketWorkflow({
                    ticketId: ticket.id,
                    action: 'reassign_owner',
                    actor: workflowActor!,
                    payload: {
                      kind: 'reassign_owner',
                      newOwnerId: selectedAssignee === 'unassigned' ? null : selectedAssignee,
                      transitionNote: 'Owner changed from the request workspace.',
                    },
                  }),
                  'Owner updated',
                );
                if (ok) setAssignOpen(false);
              }}
            >
              Save owner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={priorityOpen} onOpenChange={setPriorityOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change priority</DialogTitle>
            <DialogDescription>Priority changes are visible to operators and requesters.</DialogDescription>
          </DialogHeader>
          <Select value={selectedPriority} onValueChange={(value) => setSelectedPriority(value as TicketPriority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {priorityOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPriorityOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (!user) return;
                const ok = await runWorkflow(
                  () => updateTicket(ticket.id, { priority: selectedPriority }, { userId: user.id, companyId: user.company_id }),
                  'Priority updated',
                );
                if (ok) setPriorityOpen(false);
              }}
            >
              Save priority
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Admin override status</DialogTitle>
            <DialogDescription>Manual status changes require a reason and are recorded in the audit trail.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={overrideStatus} onValueChange={(value) => setOverrideStatus(value as TicketStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea value={overrideReason.value} onChange={(event) => overrideReason.setValue(event.target.value)} rows={3} placeholder="Required reason" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={saving || !overrideReason.value.trim()}
              onClick={async () => {
                if (!user) return;
                const ok = await runWorkflow(
                  () => transitionTicketWorkflow({
                    ticketId: ticket.id,
                    action: 'admin_override_status',
                    actor: workflowActor!,
                    payload: { kind: 'admin_override_status', targetStatus: overrideStatus, reason: overrideReason.value },
                  }),
                  'Status overridden',
                );
                if (ok) {
                  overrideReason.clearValue();
                  setOverrideOpen(false);
                }
              }}
            >
              Override status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewDecision !== null} onOpenChange={(open) => { if (!open) setReviewDecision(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{reviewDecision === 'approved' ? 'Approve request' : 'Reject request'}</DialogTitle>
            <DialogDescription>{reviewDecision === 'approved' ? 'Record approval for the current step.' : 'Rejecting approval may stop the request workflow.'}</DialogDescription>
          </DialogHeader>
          <Textarea value={reviewNote.value} onChange={(event) => reviewNote.setValue(event.target.value)} rows={3} placeholder="Optional note" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setReviewDecision(null)}>Cancel</Button>
            <Button
              type="button"
              disabled={saving || !reviewDecision}
              onClick={async () => {
                if (!user || !reviewDecision || !ticket.current_approval_step_id) return;
                const decision = reviewDecision;
                const expectedStepId = ticket.current_approval_step_id;
                const ok = await runWorkflow(
                  () => transitionTicketWorkflow({
                    ticketId: ticket.id,
                    action: decision === 'approved' ? 'approve_step' : 'reject_step',
                    actor: workflowActor!,
                    payload: decision === 'approved'
                      ? { kind: 'approve_step', expectedStepId, note: reviewNote.value }
                      : { kind: 'reject_step', expectedStepId, note: reviewNote.value },
                  })
                    .then((result) => ({ error: result.error })),
                  decision === 'approved' ? 'Approval recorded' : 'Rejection recorded',
                );
                if (ok) {
                  setReviewDecision(null);
                  reviewNote.clearValue();
                }
              }}
            >
              {reviewDecision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
