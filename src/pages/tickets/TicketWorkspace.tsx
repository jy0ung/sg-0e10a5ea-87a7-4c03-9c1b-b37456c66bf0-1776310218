import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { listProfiles } from '@flc/auth';
import { listAttachmentsForTickets, uploadTicketAttachment, type TicketAttachmentRecord } from '@flc/platform-services';

import { useAuth } from '@/contexts/AuthContext';
import {
  formatDateTime,
  InfoRow,
  Section,
  EmptyPanel,
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
import { reviewInternalRequestApproval } from '@flc/internal-requests';
import {
  addTicketComment,
  addTicketInternalNote,
  closeTicketByRequester,
  getTicketWorkspaceData,
  markTicketChatRead,
  markTicketCompletedByOwner,
  reopenTicketByRequester,
  requestTicketMoreInformation,
  submitRequesterTicketUpdate,
  updateTicket,


  type TicketCompletionCategory,
  type TicketPriority,
  type TicketStatus,

} from '@/services/ticketService';

const tabs: Array<{ value: TicketWorkspaceTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'details', label: 'Details' },
  { value: 'chat', label: 'Chat' },
  { value: 'attachments', label: 'Attachments' },
  { value: 'resolution', label: 'Resolution' },
  { value: 'internal-notes', label: 'Internal Notes' },
  { value: 'activity', label: 'Activity' },
  { value: 'audit-trail', label: 'Audit Trail' },
];

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

export default function TicketWorkspace() {
  const { ticketId = '' } = useParams();
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
  const [reopenOpen, setReopenOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected' | null>(null);
  const [completionCategory, setCompletionCategory] = useState<TicketCompletionCategory>('resolved');
  const [completionChecklistConfirmed, setCompletionChecklistConfirmed] = useState(false);
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [satisfactionRating, setSatisfactionRating] = useState('5');
  const [selectedAssignee, setSelectedAssignee] = useState('unassigned');
  const [selectedPriority, setSelectedPriority] = useState<TicketPriority>('medium');
  const [overrideStatus, setOverrideStatus] = useState<TicketStatus>('in_progress');

  const activeTabParam = searchParams.get('tab') as TicketWorkspaceTab | null;
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => {
      if (tab.value === 'internal-notes' || tab.value === 'audit-trail') return canManageQueue;
      return true;
    }),
    [canManageQueue],
  );
  const activeTab = visibleTabs.some((tab) => tab.value === activeTabParam) ? activeTabParam! : 'overview';

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
  const latestChatMessage = data?.activities.find((activity) => activity.event_type === 'comment_added') ?? null;
  const latestSystemActivity = data?.activities.find((activity) => activity.event_type !== 'comment_added') ?? null;

  useEffect(() => {
    if (!ticket) return;
    if (!assignOpen) setSelectedAssignee(ticket.assigned_to ?? 'unassigned');
    if (!priorityOpen) setSelectedPriority(ticket.priority);
    if (!overrideOpen) setOverrideStatus(ticket.status === 'closed' ? 'in_progress' : ticket.status);
  }, [assignOpen, overrideOpen, priorityOpen, ticket]);

  useEffect(() => {
    if (!user || !ticket || activeTab !== 'chat') return;
    void markTicketChatRead(ticket.id, { userId: user.id, companyId: user.company_id });
  }, [activeTab, ticket, user]);

  const refreshWorkspace = useCallback(
    () => queryClient.invalidateQueries({ queryKey: workspaceQueryKey }),
    [queryClient, workspaceQueryKey],
  );

  const runWorkflow = useCallback(async (
    operation: () => Promise<{ error: Error | string | null }>,
    successMessage: string,
    optimisticPatch?: Record<string, unknown>,
  ) => {
    setSaving(true);
    // Optimistic: apply patch to query cache immediately
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
      // Rollback
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
    if (data.permissions.canManageWorkflow && ticket.status === 'open') {
      await runWorkflow(
        () => updateTicket(ticket.id, { mark_opened: true }, { userId: user.id, companyId: user.company_id }),
        'Request started',
      );
      return;
    }
    if (data.permissions.canManageWorkflow && (ticket.status === 'in_progress' || ticket.status === 'pending_owner_review' || ticket.status === 'reopened')) {
      setCompletionOpen(true);
      return;
    }
    if (data.permissions.canManageWorkflow && ticket.status === 'pending_requester') {
      setInfoDialogOpen(true);
      return;
    }
    if (data.permissions.canCloseAsRequester && ticket.status === 'pending_requester') {
      setRequesterUpdateOpen(true);
      return;
    }
    if (data.permissions.canCloseAsRequester && ticket.status === 'completed_by_owner') {
      setCloseOpen(true);
      return;
    }
    if (data.permissions.canCloseAsRequester && ticket.status === 'closed') {
      setReopenOpen(true);
    }
  };

  const handleAddComment = useCallback(async () => {
    const message = chatDraft.value.trim();
    if (!ticket || !user || !message) return true;
    const ok = await runWorkflow(
      () => addTicketComment(ticket.id, { message }, { userId: user.id, companyId: user.company_id }),
      'Message sent',
    );
    if (ok) chatDraft.clearValue();
    return ok;
  }, [chatDraft, runWorkflow, ticket, user]);

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
      await refreshWorkspace();
    }
  };

  const handleAddInternalNote = useCallback(async () => {
    const note = internalNote.value.trim();
    if (!ticket || !user || !note) return true;
    const ok = await runWorkflow(
      () => addTicketInternalNote(ticket.id, { note }, { userId: user.id, companyId: user.company_id }),
      'Internal note added',
    );
    if (ok) internalNote.clearValue();
    return ok;
  }, [internalNote, runWorkflow, ticket, user]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isEditable = target.isContentEditable;
      const isInput = tagName === 'input' || tagName === 'textarea' || isEditable;

      // Escape: close any open dialog
      if (event.key === 'Escape') {
        setInfoDialogOpen(false);
        setRequesterUpdateOpen(false);
        setCompletionOpen(false);
        setCloseOpen(false);
        setReopenOpen(false);
        setAssignOpen(false);
        setPriorityOpen(false);
        setOverrideOpen(false);
        setReviewDecision(null);
        return;
      }

      // Ctrl+Enter / Cmd+Enter: send chat message or internal note
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        if (activeTab === 'chat') {
          event.preventDefault();
          void handleAddComment();
        } else if (activeTab === 'internal-notes') {
          event.preventDefault();
          void handleAddInternalNote();
        }
        return;
      }

      // Remaining shortcuts only fire when no input is focused
      if (isInput) return;

      // Tab switching: 1-5
      if (event.key === '1') { setTab('details'); return; }
      if (event.key === '2') { setTab('chat'); return; }
      if (event.key === '3') { setTab('activity'); return; }
      if (event.key === '4' && canManageQueue) { setTab('internal-notes'); return; }
      if (event.key === '5' && canManageQueue) { setTab('audit-trail'); return; }

      // r: reopen dialog
      if (event.key === 'r' && ticket?.status === 'closed' && data?.permissions.canCloseAsRequester) {
        setReopenOpen(true);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab, ticket, data, canManageQueue, handleAddComment, handleAddInternalNote, setTab]);

  const hasUnsavedChanges = Boolean(
    chatDraft.value.trim()
    || internalNote.value.trim()
    || workflowMessage.value.trim()
    || closureFeedback.value.trim()
    || reopenReason.value.trim()
    || overrideReason.value.trim()
    || reviewNote.value.trim()
    || resolutionDirty
    || breachReasonDirty
    || (closeOpen && closeConfirmed)
    || (ticket && assignOpen && selectedAssignee !== (ticket.assigned_to ?? 'unassigned'))
    || (ticket && priorityOpen && selectedPriority !== ticket.priority)
    || (ticket && overrideOpen && overrideStatus !== (ticket.status === 'closed' ? 'in_progress' : ticket.status))
  );

  useBeforeUnloadWarning(hasUnsavedChanges);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => (
    hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
  ));

  const discardWorkspaceChanges = useCallback(() => {
    chatDraft.clearValue();
    internalNote.clearValue();
    workflowMessage.clearValue();
    resolutionDraft.clearValue();
    breachReason.clearValue();
    closureFeedback.clearValue();
    reopenReason.clearValue();
    overrideReason.clearValue();
    reviewNote.clearValue();
    setCompletionChecklistConfirmed(false);
    setCloseConfirmed(false);
    if (ticket) {
      setSelectedAssignee(ticket.assigned_to ?? 'unassigned');
      setSelectedPriority(ticket.priority);
      setOverrideStatus(ticket.status === 'closed' ? 'in_progress' : ticket.status);
    }
  }, [breachReason, chatDraft, closureFeedback, internalNote, overrideReason, reopenReason, resolutionDraft, reviewNote, ticket, workflowMessage]);

  const saveWorkspaceChanges = useCallback(async () => {
    if (!ticket || !user) {
      toast.error('Unable to save changes without an active request session.');
      return false;
    }

    let ok = true;
    if (chatDraft.value.trim()) ok = (await handleAddComment()) && ok;
    if (internalNote.value.trim()) ok = (await handleAddInternalNote()) && ok;

    if (resolutionDirty || breachReasonDirty) {
      const result = await runWorkflow(
        () => updateTicket(
          ticket.id,
          {
            ...(resolutionDirty ? { resolution_note: resolutionSummary } : {}),
            ...(breachReasonDirty ? { sla_breach_reason: completionBreachReason } : {}),
          },
          { userId: user.id, companyId: user.company_id },
        ),
        'Workspace fields saved',
      );
      if (result) {
        resolutionDraft.clearValue();
        breachReason.clearValue();
      }
      ok = result && ok;
    }

    if (ok && (
      workflowMessage.value.trim()
      || closureFeedback.value.trim()
      || reopenReason.value.trim()
      || overrideReason.value.trim()
      || reviewNote.value.trim()
    )) {
      toast.info('Workflow dialog text is saved as a local draft until you submit that action.');
    }

    return ok;
  }, [
    breachReason,
    breachReasonDirty,
    chatDraft.value,
    closureFeedback.value,
    completionBreachReason,
    handleAddComment,
    handleAddInternalNote,
    internalNote.value,
    overrideReason.value,
    reopenReason.value,
    resolutionDirty,
    resolutionDraft,
    resolutionSummary,
    reviewNote.value,
    runWorkflow,
    ticket,
    user,
    workflowMessage.value,
  ]);

  const requestRefreshWorkspace = () => {
    if (hasUnsavedChanges) {
      toast.info('Save or discard workspace changes before refreshing.');
      return;
    }
    void refreshWorkspace();
  };

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

  const primaryLabel = primaryActionLabel(ticket, data.permissions);

  return (
    <div className="min-h-full bg-muted/20">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-3 sm:p-4 lg:p-6">
        <header className="sticky top-0 z-20 rounded-lg border border-border bg-background/95 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 px-2" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
                Back to previous view
              </Button>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{ticket.id}</span>
                  <RequestStatusBadge status={ticket.status} />
                  <TicketSlaSummary ticket={ticket} compact />
                  <RequestPriorityBadge priority={ticket.priority} />
                </div>
                <h1 className="break-words text-xl font-semibold leading-7 text-foreground lg:text-2xl">{ticket.subject}</h1>
                <p className="text-sm text-muted-foreground">
                  {ticket.submitted_by_name ?? ticket.submitted_by_email ?? 'Unknown requester'}
                  {ticket.vso_number ? ` · VSO ${ticket.vso_number}` : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Submitted</span> {formatDateTime(ticket.created_at)}
              </div>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Updated</span> {formatDateTime(ticket.updated_at)}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label="More request actions">
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
                  {data.permissions.canViewAuditTrail && <DropdownMenuItem onClick={() => setTab('audit-trail')}>View audit trail</DropdownMenuItem>}
                  <DropdownMenuItem onClick={requestRefreshWorkspace}>Refresh workspace</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {needsBreachReason && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">SLA breach reason required</p>
              <p className="mt-0.5">Add the breach reason in the completion workflow before this request can be completed or closed.</p>
            </div>
          </div>
        )}

        <div className="sticky top-[96px] z-10 rounded-lg border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="grid gap-2 text-sm md:grid-cols-3 lg:flex lg:flex-wrap">
                <InfoRow label="Responsible party" value={ticket.current_responsible_party} />
                <InfoRow label="Next action" value={ticket.next_action} />
                <InfoRow label="SLA status" value={sla ? formatTicketLabel(sla.overall) : 'Not configured'} />
              </div>
              <div className="flex flex-wrap gap-2">
                {data.permissions.canReviewApproval && (
                  <>
                    <Button type="button" variant="outline" className="gap-1.5" onClick={() => setReviewDecision('approved')} disabled={saving}>
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button type="button" variant="outline" className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setReviewDecision('rejected')} disabled={saving}>
                      Reject
                    </Button>
                  </>
                )}
                {data.permissions.canManageWorkflow && (
                  <Button type="button" variant="outline" onClick={() => setInfoDialogOpen(true)} disabled={saving || ticket.status === 'closed' || ticket.status === 'cancelled'}>
                    Request More Info
                  </Button>
                )}
                {primaryLabel && (
                  <Button type="button" onClick={() => void handlePrimaryAction()} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {primaryLabel}
                  </Button>
                )}
              </div>
            </div>
            <WorkflowStrip status={ticket.status} />
          </div>
        </div>

        <main className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            <Tabs value={activeTab} onValueChange={setTab} className="space-y-4">
              <div className="overflow-x-auto">
                <TabsList className="h-auto min-w-max justify-start">
                  {visibleTabs.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value} className="min-h-9">
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoRow label="Current responsible party" value={ticket.current_responsible_party} />
                  <InfoRow label="Owner / PIC" value={ticket.assigned_to_name ?? ticket.responsible_queue} />
                  <InfoRow label="Next action" value={ticket.next_action} />
                </div>
                <Section title="Request summary" icon={FileText}>
                  <p className="whitespace-pre-line text-sm leading-6 text-foreground">{ticket.description}</p>
                </Section>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Section title="Latest discussion" icon={MessageSquare}>
                    {latestChatMessage ? (
                      <div className="rounded-md bg-muted/30 px-3 py-2">
                        <p className="text-sm text-foreground">{latestChatMessage.message}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {latestChatMessage.actor_name ?? 'User'} · {latestChatMessage.created_at ? formatDistanceToNow(new Date(latestChatMessage.created_at), { addSuffix: true }) : ''}
                        </p>
                      </div>
                    ) : <EmptyPanel title="No chat yet" description="Conversation with the requester will appear here." />}
                  </Section>
                  <Section title="Latest activity" icon={Clock3}>
                    {latestSystemActivity ? (
                      <div className="rounded-md bg-muted/30 px-3 py-2">
                        <p className="text-sm text-foreground">{latestSystemActivity.message}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {latestSystemActivity.actor_name ?? 'System'} · {latestSystemActivity.created_at ? formatDistanceToNow(new Date(latestSystemActivity.created_at), { addSuffix: true }) : ''}
                        </p>
                      </div>
                    ) : <EmptyPanel title="No activity yet" description="System workflow events will appear here." />}
                  </Section>
                </div>
                <Section title="Resolution status">
                  <div className="grid gap-3 md:grid-cols-3">
                    <InfoRow label="Resolution note" value={ticket.resolution_note ?? 'Not completed'} />
                    <InfoRow label="Completion category" value={ticket.completion_category ? formatTicketLabel(ticket.completion_category) : 'Not selected'} />
                    <InfoRow label="Closure confirmed" value={ticket.closure_confirmed ? 'Yes' : 'No'} />
                  </div>
                </Section>
              </TabsContent>

              <TabsContent value="details" className="space-y-4">
                <Section title="Request details">
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoRow label="Category" value={getRequestCategoryLabel(ticket.category, categories)} />
                    <InfoRow label="Subcategory" value={ticket.subcategory ? getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories) : 'Not selected'} />
                    <InfoRow label="Requested due date" value={ticket.requested_due_date ? formatDueDate(ticket.requested_due_date) : 'Not provided'} />
                    <InfoRow label="VSO" value={ticket.vso_number ?? 'Not provided'} />
                    <InfoRow label="Desired outcome" value={ticket.desired_outcome ?? 'Not provided'} />
                    <InfoRow label="Business impact" value={ticket.business_impact ?? 'Not provided'} />
                  </div>
                </Section>
                {customFields.length > 0 && (
                  <Section title="Additional fields">
                    <div className="grid gap-3 md:grid-cols-2">
                      {customFields.map((field) => (
                        <InfoRow key={field.key} label={field.label} value={field.value} />
                      ))}
                    </div>
                  </Section>
                )}
              </TabsContent>

              <TabsContent value="chat">
                <TicketChatPanel
                  activities={data.activities}
                  currentUserId={user?.id}
                  draft={chatDraft.value}
                  saving={saving}
                  onDraftChange={chatDraft.setValue}
                  onSend={() => void handleAddComment()}
                  onAttachFiles={(files) => void handleChatFilesSelected(files)}
                />
              </TabsContent>

              <TabsContent value="attachments">
                {data.attachments.length > 0
                  ? <TicketAttachmentList attachments={data.attachments} />
                  : <EmptyPanel title="No attachments" description="Uploaded documents and images will appear here." />}
              </TabsContent>

              <TabsContent value="resolution" className="space-y-4">
                <Section title="Resolution workflow">
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoRow label="Resolution summary" value={ticket.resolution_note ?? 'Not completed'} />
                    <InfoRow label="Completion category" value={ticket.completion_category ? formatTicketLabel(ticket.completion_category) : 'Not selected'} />
                    <InfoRow label="SLA breach reason" value={ticket.sla_breach_reason ?? 'Not required or not entered'} />
                    <InfoRow label="Completed at" value={formatDateTime(ticket.resolved_at)} />
                  </div>
                  {data.permissions.canManageWorkflow && ticket.status !== 'closed' && ticket.status !== 'cancelled' && (
                    <Button type="button" className="mt-4" onClick={() => setCompletionOpen(true)}>
                      Mark as Completed
                    </Button>
                  )}
                </Section>
              </TabsContent>

              {data.permissions.canViewInternalNotes && (
                <TabsContent value="internal-notes">
                  <TicketInternalNotesPanel
                    notes={data.internalNotes}
                    draft={internalNote.value}
                    saving={saving}
                    onDraftChange={internalNote.setValue}
                    onSend={() => void handleAddInternalNote()}
                  />
                </TabsContent>
              )}

              <TabsContent value="activity">
                {data.activities.some((activity) => activity.event_type !== 'comment_added')
                  ? <TicketActivityList activities={data.activities} />
                  : <EmptyPanel title="No activity yet" description="System-generated workflow events will appear here." />}
              </TabsContent>

              {data.permissions.canViewAuditTrail && (
                <TabsContent value="audit-trail">
                  <AuditTrailPanel entries={data.auditEntries} activities={data.activities} />
                </TabsContent>
              )}
            </Tabs>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-[180px] xl:self-start">
            <Section title="Insight panel" icon={UserRound}>
              <div className="space-y-2">
                <InfoRow label="Requester" value={ticket.submitted_by_name ?? ticket.submitted_by_email ?? 'Unknown'} />
                <InfoRow label="Owner / PIC" value={ticket.assigned_to_name ?? ticket.responsible_queue} />
                <InfoRow label="Category" value={getRequestCategoryLabel(ticket.category, categories)} />
                <InfoRow label="Subcategory" value={ticket.subcategory ? getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories) : 'Not selected'} />
                <InfoRow label="Priority" value={formatTicketLabel(ticket.priority)} />
                <InfoRow label="Next action" value={ticket.next_action} />
                <InfoRow label="Backup owner" value={ticket.backup_owner_name ?? 'Not assigned'} />
                <InfoRow label="Escalation owner" value={ticket.escalation_owner_name ?? 'Not assigned'} />
                <InfoRow label="Last action by" value={ticket.last_action_by_name ?? 'System'} />
              </div>
            </Section>
            <TicketSlaSummary ticket={ticket} />
            <TicketOperationalIndicatorGrid indicator={data.operationalIndicator} />
            <Section title="Accountability">
              <div className="space-y-2">
                <InfoRow label="First response due" value={formatDateTime(ticket.first_response_due_at)} />
                <InfoRow label="Resolution due" value={formatDateTime(ticket.resolution_due_at)} />
                <InfoRow label="Time in current status" value={formatDistanceToNow(new Date(ticket.status_changed_at), { addSuffix: false })} />
                <InfoRow label="Request age" value={formatDistanceToNow(new Date(ticket.created_at), { addSuffix: false })} />
                <InfoRow label="Chat messages" value={String(data.chatSummary.message_count)} />
                <InfoRow label="Unread messages" value={String(data.chatSummary.unread_count)} />
              </div>
            </Section>
          </aside>
        </main>
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
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="not_applicable">Not Applicable</SelectItem>
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
                  () => updateTicket(ticket.id, { assigned_to: selectedAssignee === 'unassigned' ? null : selectedAssignee }, { userId: user.id, companyId: user.company_id }),
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
                  () => updateTicket(ticket.id, { status: overrideStatus, admin_override_reason: overrideReason.value }, { userId: user.id, companyId: user.company_id }),
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
                if (!user || !reviewDecision) return;
                const decision = reviewDecision;
                const ok = await runWorkflow(
                  () => reviewInternalRequestApproval(ticket.id, decision, reviewNote.value, { userId: user.id, companyId: user.company_id })
                    .then((result) => ({ error: result.error ? new Error(result.error) : null })),
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

      <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => { if (!open && blocker.state === 'blocked') blocker.reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved workspace changes</DialogTitle>
            <DialogDescription>
              Save fields that can be persisted now, discard local drafts, or keep editing this request.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Workflow action text is kept as a local draft until you submit that action.
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => blocker.state === 'blocked' && blocker.reset()}>
              Continue editing
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  discardWorkspaceChanges();
                  if (blocker.state === 'blocked') blocker.proceed();
                }}
              >
                Discard
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={async () => {
                  const ok = await saveWorkspaceChanges();
                  if (ok && blocker.state === 'blocked') blocker.proceed();
                }}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

