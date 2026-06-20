import { useEffect, useMemo, useState, type ElementType, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
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
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { listProfiles } from '@flc/auth';
import { listAttachmentsForTickets, uploadTicketAttachment, type TicketAttachmentRecord } from '@flc/platform-services';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  type CompanyTicketRecord,
  type TicketAuditEntryRecord,
  type TicketCompletionCategory,
  type TicketPriority,
  type TicketStatus,
  type TicketWorkspaceData,
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return format(date, 'PP p');
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 break-words text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: ElementType; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function primaryActionLabel(ticket: CompanyTicketRecord, permissions: TicketWorkspaceData['permissions']) {
  if (permissions.canManageWorkflow) {
    if (ticket.status === 'open') return 'Start Request';
    if (ticket.status === 'in_progress' || ticket.status === 'pending_owner_review' || ticket.status === 'reopened') return 'Mark as Completed';
    if (ticket.status === 'pending_requester') return 'Request More Info';
  }
  if (permissions.canCloseAsRequester) {
    if (ticket.status === 'pending_requester') return 'Submit Update';
    if (ticket.status === 'completed_by_owner') return 'Close Request';
    if (ticket.status === 'closed') return 'Reopen Request';
  }
  return null;
}

export default function TicketWorkspace() {
  const { ticketId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManageQueue = canManagePortalQueue(user);

  const [saving, setSaving] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [internalNoteDraft, setInternalNoteDraft] = useState('');
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [requesterUpdateOpen, setRequesterUpdateOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected' | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [completionCategory, setCompletionCategory] = useState<TicketCompletionCategory>('resolved');
  const [completionChecklistConfirmed, setCompletionChecklistConfirmed] = useState(false);
  const [completionBreachReason, setCompletionBreachReason] = useState('');
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [satisfactionRating, setSatisfactionRating] = useState('5');
  const [closureFeedback, setClosureFeedback] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('unassigned');
  const [selectedPriority, setSelectedPriority] = useState<TicketPriority>('medium');
  const [overrideStatus, setOverrideStatus] = useState<TicketStatus>('in_progress');
  const [overrideReason, setOverrideReason] = useState('');
  const [reviewNote, setReviewNote] = useState('');

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
  const customFieldLabelMap = useMemo(
    () => Object.fromEntries(formFields.map((field) => [`${field.category_key}:${field.key}`, field.label])),
    [formFields],
  );
  const customFields = ticket ? customFieldEntries(ticket, customFieldLabelMap) : [];
  const latestChatMessage = data?.activities.find((activity) => activity.event_type === 'comment_added') ?? null;
  const latestSystemActivity = data?.activities.find((activity) => activity.event_type !== 'comment_added') ?? null;

  useEffect(() => {
    if (!ticket) return;
    setResolutionSummary(ticket.resolution_note ?? '');
    setCompletionBreachReason(ticket.sla_breach_reason ?? '');
    setSelectedAssignee(ticket.assigned_to ?? 'unassigned');
    setSelectedPriority(ticket.priority);
    setOverrideStatus(ticket.status === 'closed' ? 'in_progress' : ticket.status);
  }, [ticket]);

  useEffect(() => {
    if (!user || !ticket || !data?.permissions.canManageWorkflow || ticket.status !== 'open') return;
    void updateTicket(ticket.id, { mark_opened: true }, { userId: user.id, companyId: user.company_id })
      .then((result) => {
        if (result.data) void queryClient.invalidateQueries({ queryKey: workspaceQueryKey });
      });
  }, [data?.permissions.canManageWorkflow, queryClient, ticket, user, workspaceQueryKey]);

  useEffect(() => {
    if (!user || !ticket || activeTab !== 'chat') return;
    void markTicketChatRead(ticket.id, { userId: user.id, companyId: user.company_id })
      .then(() => void queryClient.invalidateQueries({ queryKey: workspaceQueryKey }));
  }, [activeTab, queryClient, ticket, user, workspaceQueryKey]);

  const refreshWorkspace = () => queryClient.invalidateQueries({ queryKey: workspaceQueryKey });

  const runWorkflow = async (operation: () => Promise<{ error: Error | string | null }>, successMessage: string) => {
    setSaving(true);
    const result = await operation();
    setSaving(false);
    if (result.error) {
      toast.error(typeof result.error === 'string' ? result.error : result.error.message);
      return false;
    }
    toast.success(successMessage);
    await refreshWorkspace();
    return true;
  };

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

  const setTab = (nextTab: string) => {
    setSearchParams(nextTab === 'overview' ? {} : { tab: nextTab });
  };

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

  const handleAddComment = async () => {
    if (!ticket || !user || !commentDraft.trim()) return;
    const message = commentDraft.trim();
    const ok = await runWorkflow(
      () => addTicketComment(ticket.id, { message }, { userId: user.id, companyId: user.company_id }),
      'Message sent',
    );
    if (ok) setCommentDraft('');
  };

  const handleChatFilesSelected = async (files: File[]) => {
    if (!ticket || !user || files.length === 0) return;
    setSaving(true);
    const results = await Promise.all(files.map((file) => uploadTicketAttachment(file, ticket.id, user.company_id, user.id)));
    const uploadedNames = files.filter((_, index) => !results[index].error).map((file) => file.name);
    if (uploadedNames.length > 0) {
      await addTicketComment(
        ticket.id,
        { message: `Attached ${uploadedNames.length} file${uploadedNames.length === 1 ? '' : 's'}.`, attachmentNames: uploadedNames },
        { userId: user.id, companyId: user.company_id },
      );
    }
    setSaving(false);
    const failedCount = results.filter((result) => result.error).length;
    if (failedCount > 0) toast.error(`${failedCount} attachment${failedCount === 1 ? '' : 's'} failed to upload.`);
    await refreshWorkspace();
  };

  const handleAddInternalNote = async () => {
    if (!ticket || !user || !internalNoteDraft.trim()) return;
    const note = internalNoteDraft.trim();
    const ok = await runWorkflow(
      () => addTicketInternalNote(ticket.id, { note }, { userId: user.id, companyId: user.company_id }),
      'Internal note added',
    );
    if (ok) setInternalNoteDraft('');
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
                  <DropdownMenuItem onClick={() => void refreshWorkspace()}>Refresh workspace</DropdownMenuItem>
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
                  draft={commentDraft}
                  saving={saving}
                  onDraftChange={setCommentDraft}
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
                    draft={internalNoteDraft}
                    saving={saving}
                    onDraftChange={setInternalNoteDraft}
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
                <InfoRow label="Backup owner" value={ticket.backup_owner_name ?? 'Not assigned'} />
                <InfoRow label="Escalation owner" value={ticket.escalation_owner_name ?? 'Not assigned'} />
                <InfoRow label="Last action by" value={ticket.last_action_by_name ?? 'System'} />
              </div>
            </Section>
            <TicketSlaSummary ticket={ticket} />
            <TicketOperationalIndicatorGrid indicator={data.operationalIndicator} />
            <Section title="Accountability">
              <div className="space-y-2">
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
        value={workflowMessage}
        onValueChange={setWorkflowMessage}
        saving={saving}
        onOpenChange={(open) => { setInfoDialogOpen(open); if (!open) setWorkflowMessage(''); }}
        onSubmit={async () => {
          if (!user || !workflowMessage.trim()) return;
          const ok = await runWorkflow(
            () => requestTicketMoreInformation(ticket.id, { message: workflowMessage.trim() }, { userId: user.id, companyId: user.company_id }),
            'Information requested',
          );
          if (ok) {
            setWorkflowMessage('');
            setInfoDialogOpen(false);
          }
        }}
      />

      <MessageDialog
        open={requesterUpdateOpen}
        title="Submit update"
        description="This moves the request to Pending Owner Review."
        value={workflowMessage}
        onValueChange={setWorkflowMessage}
        saving={saving}
        onOpenChange={(open) => { setRequesterUpdateOpen(open); if (!open) setWorkflowMessage(''); }}
        onSubmit={async () => {
          if (!user || !workflowMessage.trim()) return;
          const ok = await runWorkflow(
            () => submitRequesterTicketUpdate(ticket.id, { message: workflowMessage.trim() }, { userId: user.id, companyId: user.company_id }),
            'Update submitted',
          );
          if (ok) {
            setWorkflowMessage('');
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
              <Textarea id="resolution-summary" value={resolutionSummary} onChange={(event) => setResolutionSummary(event.target.value)} rows={4} />
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
                <Textarea id="breach-reason" value={completionBreachReason} onChange={(event) => setCompletionBreachReason(event.target.value)} rows={3} />
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
                if (ok) setCompletionOpen(false);
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
            <Textarea value={closureFeedback} onChange={(event) => setClosureFeedback(event.target.value)} rows={3} placeholder="Optional feedback" />
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
                    { confirmedResolved: closeConfirmed, satisfactionRating: Number(satisfactionRating), feedbackComment: closureFeedback },
                    { userId: user.id, companyId: user.company_id },
                  ),
                  'Request closed',
                );
                if (ok) setCloseOpen(false);
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
        value={reopenReason}
        onValueChange={setReopenReason}
        saving={saving}
        onOpenChange={(open) => { setReopenOpen(open); if (!open) setReopenReason(''); }}
        onSubmit={async () => {
          if (!user || !reopenReason.trim()) return;
          const ok = await runWorkflow(
            () => reopenTicketByRequester(ticket.id, { reason: reopenReason }, { userId: user.id, companyId: user.company_id }),
            'Request reopened',
          );
          if (ok) {
            setReopenReason('');
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

      <Dialog open={overrideOpen} onOpenChange={(open) => { setOverrideOpen(open); if (!open) setOverrideReason(''); }}>
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
            <Textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={3} placeholder="Required reason" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={saving || !overrideReason.trim()}
              onClick={async () => {
                if (!user) return;
                const ok = await runWorkflow(
                  () => updateTicket(ticket.id, { status: overrideStatus, admin_override_reason: overrideReason }, { userId: user.id, companyId: user.company_id }),
                  'Status overridden',
                );
                if (ok) {
                  setOverrideReason('');
                  setOverrideOpen(false);
                }
              }}
            >
              Override status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewDecision !== null} onOpenChange={(open) => { if (!open) { setReviewDecision(null); setReviewNote(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{reviewDecision === 'approved' ? 'Approve request' : 'Reject request'}</DialogTitle>
            <DialogDescription>{reviewDecision === 'approved' ? 'Record approval for the current step.' : 'Rejecting approval may stop the request workflow.'}</DialogDescription>
          </DialogHeader>
          <Textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={3} placeholder="Optional note" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setReviewDecision(null)}>Cancel</Button>
            <Button
              type="button"
              disabled={saving || !reviewDecision}
              onClick={async () => {
                if (!user || !reviewDecision) return;
                const decision = reviewDecision;
                const ok = await runWorkflow(
                  () => reviewInternalRequestApproval(ticket.id, decision, reviewNote, { userId: user.id, companyId: user.company_id })
                    .then((result) => ({ error: result.error ? new Error(result.error) : null })),
                  decision === 'approved' ? 'Approval recorded' : 'Rejection recorded',
                );
                if (ok) {
                  setReviewDecision(null);
                  setReviewNote('');
                }
              }}
            >
              {reviewDecision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageDialog({
  open,
  title,
  description,
  value,
  saving,
  onValueChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  value: string;
  saving: boolean;
  onValueChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea value={value} onChange={(event) => onValueChange(event.target.value)} rows={4} placeholder="Write a clear update" />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={saving || !value.trim()} onClick={onSubmit}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuditTrailPanel({
  entries,
  activities,
}: {
  entries: TicketAuditEntryRecord[];
  activities: TicketWorkspaceData['activities'];
}) {
  const systemActivities = activities.filter((activity) => activity.event_type !== 'comment_added');

  if (entries.length === 0 && systemActivities.length === 0) {
    return <EmptyPanel title="No audit trail yet" description="Auditable changes and workflow events will appear here." />;
  }

  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <Section title="Audit log">
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border bg-card px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">{entry.action}</Badge>
                  <p className="text-sm font-medium text-foreground">{entry.actor_name ?? 'User action'}</p>
                  <p className="text-xs text-muted-foreground">{entry.created_at ? formatDateTime(entry.created_at) : ''}</p>
                </div>
                {entry.changes && Object.keys(entry.changes).length > 0 && (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                    {JSON.stringify(entry.changes, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
      {systemActivities.length > 0 && (
        <Section title="Workflow activity">
          <TicketActivityList activities={activities} />
        </Section>
      )}
    </div>
  );
}
