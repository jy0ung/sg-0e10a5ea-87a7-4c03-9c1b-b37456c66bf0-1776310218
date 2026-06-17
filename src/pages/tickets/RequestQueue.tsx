import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Inbox,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  User,
  UserX,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { PanelErrorBoundary } from '@/components/shared/PanelErrorBoundary';
import { PageHeader } from '@/components/shared/PageHeader';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { RequestDetailPanel } from '@/components/tickets/RequestDetailPanel';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/tickets/RequestBadge';
import { TicketApprovalSummary } from '@/components/tickets/TicketApprovalSummary';
import { TicketSlaSummary } from '@/components/tickets/TicketSlaSummary';
import {
  RequestQueueFilters,
  type AssigneeFilter,
  type PriorityFilter,
  type SlaFilter,
  type StatusFilter,
} from '@/components/tickets/RequestQueueFilters';
import { RequestQueueMetricGrid } from '@/components/tickets/RequestQueueMetricGrid';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import { usePersistedDraftMap } from '@/hooks/usePersistedDraftMap';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  addTicketComment,
  getCompanyTicketStatusCounts,
  listCompanyTicketsPage,
  listTicketActivity,
  type CompanyTicketRecord,
  type PaginatedTicketResult,
  type TicketActivityRecord,
  type TicketPriority,
  type TicketStatus,
  type TicketStatusCounts,
  updateTicket,
} from '@/services/ticketService';
import { reviewInternalRequestApproval } from '@flc/internal-requests';
import { listAttachmentsForTickets, type TicketAttachmentRecord } from '@flc/platform-services';
import { listProfiles } from '@flc/auth';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { getRequestSubcategoryLabel } from '@/lib/requestSubcategories';
import { getRequestAssignees } from '@/lib/requestAssignees';
import { formatSlaState, getTicketSlaSummary } from '@/lib/ticketSla';
import {
  downloadCsv,
  formatTicketLabel,
  isApprovalAssignedToUser,
  isOpenStatus,
} from '@/lib/requestFormatters';

type ApprovalReviewTarget = { ticketId: string; decision: 'approved' | 'rejected' } | null;

const statusOptions: Array<{ value: TicketStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'awaiting_requester', label: 'Awaiting Requester' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const priorityOptions: Array<{ value: TicketPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const REQUEST_QUEUE_PAGE_SIZE = 25;

// formatTicketLabel, isOpenStatus, isApprovalAssignedToUser, csvCell, downloadCsv
// are now imported from '@/lib/requestFormatters'

export default function RequestQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { categories } = useRequestCategories(user?.company_id, true);
  const { subcategories } = useRequestSubcategories(user?.company_id, { includeInactive: true });
  const { fields: formFields } = useRequestFormFields(user?.company_id, { includeInactive: true });
  const [activitiesByTicket, setActivitiesByTicket] = useState<Record<string, TicketActivityRecord[]>>({});
  const [attachmentsByTicket, setAttachmentsByTicket] = useState<Record<string, TicketAttachmentRecord[]>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [slaFilter, setSlaFilter] = useState<SlaFilter>('all');
  const [assignedToFilter, setAssignedToFilter] = useState<AssigneeFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [metricsExpanded, setMetricsExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('requestQueue.metricsExpanded') !== 'false';
  });
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ApprovalReviewTarget>(null);
  const [reviewNote, setReviewNote] = useState('');
  // Drafts overlay the server state — see usePersistedDraftMap. Cycle 3.5's
  // realtime invalidations made it routine for the ticket page to refetch
  // while a queue manager was mid-comment; without persistence those drafts
  // were silently destroyed every time a colleague mutated any ticket.
  const [noteDrafts, setNoteDrafts, clearNoteDraft] = usePersistedDraftMap(
    'queue:note',
    user?.company_id,
    user?.id,
  );
  const [commentDrafts, setCommentDrafts, clearCommentDraft] = usePersistedDraftMap(
    'queue:comment',
    user?.company_id,
    user?.id,
  );
  const [queueError, setQueueError] = useState<string | null>(null);

  const customFieldLabelMap = useMemo(
    () => Object.fromEntries(formFields.map((field) => [`${field.category_key}:${field.key}`, field.label])),
    [formFields],
  );

  // ─── Saved view presets ────────────────────────────────────────────────────
  type SavedViewDef = {
    id: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    status: StatusFilter;
    priority: PriorityFilter;
    sla: SlaFilter;
    assignedTo: string;
  };

  const savedViews = useMemo<SavedViewDef[]>(() => [
    { id: 'all_active',    label: 'All Active',         Icon: Inbox,          status: 'active',              priority: 'all',  sla: 'all',      assignedTo: 'all' },
    { id: 'my_queue',      label: 'My Queue',            Icon: User,           status: 'active',              priority: 'all',  sla: 'all',      assignedTo: user?.id ?? 'all' },
    { id: 'unassigned',    label: 'Unassigned',          Icon: UserX,          status: 'active',              priority: 'all',  sla: 'all',      assignedTo: 'unassigned' },
    { id: 'high_priority', label: 'High Priority',       Icon: AlertCircle,    status: 'active',              priority: 'high', sla: 'all',      assignedTo: 'all' },
    { id: 'awaiting',      label: 'Awaiting Requester',  Icon: Clock,          status: 'awaiting_requester',  priority: 'all',  sla: 'all',      assignedTo: 'all' },
    { id: 'breached',      label: 'Breached SLA',        Icon: AlertTriangle,  status: 'active',              priority: 'all',  sla: 'breached', assignedTo: 'all' },
  ], [user?.id]);

  const activeSavedView = useMemo(() => {
    if (searchTerm.trim() !== '') return null;
    return savedViews.find(
      (v) => v.status === statusFilter && v.priority === priorityFilter && v.sla === slaFilter && v.assignedTo === assignedToFilter,
    )?.id ?? null;
  }, [savedViews, statusFilter, priorityFilter, slaFilter, assignedToFilter, searchTerm]);

  const applyView = useCallback((view: SavedViewDef) => {
    setStatusFilter(view.status);
    setPriorityFilter(view.priority);
    setSlaFilter(view.sla);
    setAssignedToFilter(view.assignedTo);
    setSearchTerm('');
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  // ─── React Query: ticket page ──────────────────────────────────────────────
  const ticketQueryKey = [
    'ticketQueue',
    user?.company_id,
    { page, statusFilter, priorityFilter, slaFilter, searchTerm, assignedToFilter },
  ] as const;

  const {
    data: ticketPage,
    isPending: ticketsLoading,
    error: ticketQueryError,
    refetch: refetchTickets,
    isFetching: ticketsFetching,
  } = useQuery({
    queryKey: ticketQueryKey,
    queryFn: async () => {
      if (!user?.company_id) throw new Error('Not authenticated');
      const result = await listCompanyTicketsPage(user.company_id, {
        page,
        pageSize: REQUEST_QUEUE_PAGE_SIZE,
        status: statusFilter,
        priority: priorityFilter,
        sla: slaFilter,
        search: searchTerm,
        assignedTo: assignedToFilter !== 'all' ? assignedToFilter as 'unassigned' | string : undefined,
      });
      if (result.error) throw result.error;
      return result.data!;
    },
    enabled: !!user?.company_id,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // ─── React Query: assignee profiles ───────────────────────────────────────
  const { data: profileRows } = useQuery({
    queryKey: ['ticketQueueProfiles', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) throw new Error('Not authenticated');
      const result = await listProfiles(user.company_id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!user?.company_id,
    staleTime: 5 * 60_000,
  });

  // ─── React Query: status counts ───────────────────────────────────────────
  const statusCountsQueryKey = [
    'ticketQueueStatusCounts',
    user?.company_id,
    { priorityFilter, searchTerm },
  ] as const;

  const { data: statusCountsData } = useQuery({
    queryKey: statusCountsQueryKey,
    queryFn: async () => {
      if (!user?.company_id) throw new Error('Not authenticated');
      const result = await getCompanyTicketStatusCounts(user.company_id, {
        priority: priorityFilter,
        search: searchTerm,
      });
      if (result.error) throw result.error;
      return result.data!;
    },
    enabled: !!user?.company_id,
    staleTime: 30_000,
  });

  // ─── Realtime ──────────────────────────────────────────────────────────────
  // Invalidate both queue queries on any ticket / activity / attachment change
  // in this tenant so queue managers see new submissions, status flips, and
  // assignment changes without polling the Refresh button. The button stays
  // as an explicit override for the rare case where the websocket dropped.
  const invalidateQueueQueries = useCallback(() => {
    if (!user?.company_id) return;
    void queryClient.invalidateQueries({ queryKey: ['ticketQueue', user.company_id] });
    void queryClient.invalidateQueries({ queryKey: ['ticketQueueStatusCounts', user.company_id] });
  }, [queryClient, user?.company_id]);
  useTicketsRealtime({
    companyId: user?.company_id,
    scope: 'queue',
    onChange: invalidateQueueQueries,
  });

  // ─── Derived state ─────────────────────────────────────────────────────────
  const tickets = useMemo(() => ticketPage?.rows ?? [], [ticketPage]);
  const totalCount = ticketPage?.totalCount ?? 0;
  const loading = ticketsLoading && !ticketPage; // only hard-loading on the very first fetch
  const error = queueError ?? (ticketQueryError ? (ticketQueryError as Error).message : null);

  const assignees = useMemo(
    () => getRequestAssignees(profileRows ?? []),
    [profileRows],
  );

  const statusCounts: TicketStatusCounts = statusCountsData ?? {
    all: 0, open: 0, in_progress: 0, awaiting_requester: 0, resolved: 0, closed: 0, cancelled: 0,
  };

  // ─── Reset page + clear selection when filters change ──────────────────────
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [priorityFilter, searchTerm, statusFilter, slaFilter, assignedToFilter]);

  // ─── Side effects keyed on incoming ticket data ────────────────────────────
  // Fetch the matching activity and attachment slices alongside the paged
  // tickets. Drafts are NOT re-seeded here — they're owned by the persisted
  // draft hook, which preserves in-progress text across realtime refetches.
  useEffect(() => {
    if (!ticketPage || !user) return;
    const nextTickets = ticketPage.rows;

    const ticketIds = nextTickets.map((ticket) => ticket.id);
    if (ticketIds.length === 0) {
      setActivitiesByTicket({});
      setAttachmentsByTicket({});
      return;
    }
    void Promise.all([
      listTicketActivity(ticketIds, user.company_id),
      listAttachmentsForTickets(ticketIds, user.company_id),
    ]).then(([{ data: activityData }, { data: attachmentData }]) => {
      setActivitiesByTicket(activityData ?? {});
      setAttachmentsByTicket(attachmentData ?? {});
    });
  }, [ticketPage, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('requestQueue.metricsExpanded', String(metricsExpanded));
  }, [metricsExpanded]);

  // ─── Filtered view (client-side refinement on top of server-filtered page) ─
  const filteredTickets = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (!normalizedSearch) return true;

      const haystack = [
        ticket.subject,
        ticket.description,
        ticket.desired_outcome,
        ticket.business_impact,
        ...Object.values(ticket.custom_fields ?? {}).map((value) => String(value)),
        ticket.vso_number,
        ticket.submitted_by_name,
        ticket.submitted_by_email,
        ticket.assigned_to_name,
        getRequestCategoryLabel(ticket.category, categories),
        ticket.subcategory ? getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories) : '',
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [categories, searchTerm, subcategories, tickets]);

  const selectedTicket = useMemo(
    () => filteredTickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [filteredTickets, selectedTicketId],
  );

  const queueMetrics = useMemo(() => ({
    unassigned: tickets.filter((ticket) => isOpenStatus(ticket.status) && !ticket.assigned_to).length,
    slaBreached: tickets.filter((ticket) => getTicketSlaSummary(ticket).overall === 'breached').length,
    slaAtRisk: tickets.filter((ticket) => getTicketSlaSummary(ticket).overall === 'at_risk').length,
    active: tickets.filter((ticket) => isOpenStatus(ticket.status)).length,
    awaitingApproval: tickets.filter((ticket) => ticket.approval_status === 'pending').length,
  }), [tickets]);

  const refreshTicketActivity = useCallback(async (ticketId: string) => {
    if (!user) return;
    const { data: updatedActivity } = await listTicketActivity([ticketId], user.company_id);
    if (updatedActivity) {
      setActivitiesByTicket((current) => ({ ...current, ...updatedActivity }));
    }
  }, [user]);

  // ─── Helper: optimistic ticket update in React Query cache ────────────────
  const applyOptimisticTicketUpdate = useCallback(
    (ticketId: string, updates: Partial<CompanyTicketRecord>) => {
      queryClient.setQueryData<PaginatedTicketResult<CompanyTicketRecord>>(ticketQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          rows: old.rows.map((ticket) =>
            ticket.id === ticketId ? { ...ticket, ...updates } : ticket,
          ),
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, ...ticketQueryKey],
  );

  const handleStatusChange = async (ticketId: string, status: TicketStatus) => {
    if (!user) return;

    setSavingTicketId(ticketId);
    setQueueError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { status },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setQueueError(updateError?.message || 'Unable to update request status.');
      setSavingTicketId(null);
      return;
    }

    applyOptimisticTicketUpdate(ticketId, {
      status: data.status,
      priority: data.priority,
      assigned_to: data.assigned_to,
      assigned_at: data.assigned_at,
      resolved_at: data.resolved_at,
      resolution_note: data.resolution_note,
      updated_at: data.updated_at,
    });
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handleAssignmentChange = async (ticketId: string, value: string) => {
    if (!user) return;

    const assignedTo = value === 'unassigned' ? null : value;
    const assignee = assignees.find((profile) => profile.id === assignedTo) ?? null;

    setSavingTicketId(ticketId);
    setQueueError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { assigned_to: assignedTo },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setQueueError(updateError?.message || 'Unable to update request owner.');
      setSavingTicketId(null);
      return;
    }

    applyOptimisticTicketUpdate(ticketId, {
      assigned_to: data.assigned_to,
      assigned_at: data.assigned_at,
      resolved_at: data.resolved_at,
      resolution_note: data.resolution_note,
      updated_at: data.updated_at,
      assigned_to_name: assignee?.name ?? null,
      assigned_to_email: assignee?.email ?? null,
    });
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handlePriorityChange = async (ticketId: string, priority: TicketPriority) => {
    if (!user) return;

    setSavingTicketId(ticketId);
    setQueueError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { priority },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setQueueError(updateError?.message || 'Unable to update request priority.');
      setSavingTicketId(null);
      return;
    }

    applyOptimisticTicketUpdate(ticketId, {
      priority: data.priority,
      updated_at: data.updated_at,
    });
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handleTicketOpen = async (ticketId: string) => {
    if (!user) return;

    const existing = tickets.find((ticket) => ticket.id === ticketId);
    if (!existing || existing.submitted_by === user.id) {
      return;
    }

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { mark_opened: true },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      return;
    }

    const shouldRefreshActivity =
      data.status !== existing.status
      || data.assigned_to !== existing.assigned_to;

    if (!shouldRefreshActivity) {
      return;
    }

    applyOptimisticTicketUpdate(ticketId, {
      status: data.status,
      assigned_to: data.assigned_to,
      assigned_at: data.assigned_at,
      first_responded_at: data.first_responded_at,
      updated_at: data.updated_at,
      assigned_to_name: user.name,
      assigned_to_email: user.email,
    });

    void refreshTicketActivity(ticketId);
  };

  const handleResolutionNoteSave = async (ticketId: string) => {
    if (!user) return;
    // Resolve the saveable note: prefer the user's in-progress draft;
    // if no draft, fall back to whatever resolution_note is already on
    // the ticket (this matches what the textarea is currently showing).
    const ticket = tickets.find((t) => t.id === ticketId);
    const nextNote = noteDrafts[ticketId] ?? ticket?.resolution_note ?? '';

    setSavingTicketId(ticketId);
    setQueueError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { resolution_note: nextNote },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setQueueError(updateError?.message || 'Unable to save the resolution note.');
      setSavingTicketId(null);
      return;
    }

    applyOptimisticTicketUpdate(ticketId, {
      resolution_note: data.resolution_note,
      resolved_at: data.resolved_at,
      updated_at: data.updated_at,
    });
    // Drop the draft; the textarea now reads from the optimistically-updated
    // server state via `noteDrafts[id] ?? ticket.resolution_note`.
    clearNoteDraft(ticketId);
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handleAddComment = async (ticketId: string) => {
    if (!user) return;
    const message = commentDrafts[ticketId]?.trim() ?? '';
    if (!message) return;

    setSavingTicketId(ticketId);
    setQueueError(null);

    const { error: commentError } = await addTicketComment(
      ticketId,
      { message },
      { userId: user.id, companyId: user.company_id },
    );

    if (commentError) {
      setQueueError(commentError.message || 'Unable to add comment.');
      setSavingTicketId(null);
      return;
    }

    clearCommentDraft(ticketId);
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handleApprovalReview = async () => {
    if (!user || !reviewTarget) return;

    setSavingTicketId(reviewTarget.ticketId);
    setQueueError(null);
    const { error: reviewError } = await reviewInternalRequestApproval(
      reviewTarget.ticketId,
      reviewTarget.decision,
      reviewNote,
      { userId: user.id, companyId: user.company_id },
    );
    setSavingTicketId(null);

    if (reviewError) {
      setQueueError(reviewError);
      return;
    }

    toast.success(reviewTarget.decision === 'approved' ? 'Request approval recorded' : 'Request rejected');
    setReviewTarget(null);
    setReviewNote('');
    // Invalidate so the next render fetches fresh data from the server
    await queryClient.invalidateQueries({ queryKey: ['ticketQueue', user.company_id] });
  };

  const handleExportCsv = () => {
    const rows = [
      ['ID', 'Subject', 'Status', 'Priority', 'SLA', 'Category', 'Subcategory', 'Requester', 'Owner', 'Requested due date', 'Created at'],
      ...filteredTickets.map((ticket) => [
        ticket.id,
        ticket.subject,
        formatTicketLabel(ticket.status),
        ticket.priority,
        formatSlaState(getTicketSlaSummary(ticket).overall),
        getRequestCategoryLabel(ticket.category, categories),
        ticket.subcategory ? getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories) : '',
        ticket.submitted_by_name ?? ticket.submitted_by_email ?? '',
        ticket.assigned_to_name ?? '',
        ticket.requested_due_date ?? '',
        ticket.created_at,
      ]),
    ];

    downloadCsv(`internal-requests-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const renderDetailPanel = (ticket: CompanyTicketRecord, variant: 'pane' | 'drawer' = 'pane') => (
    <RequestDetailPanel
      ticket={ticket}
      categories={categories}
      subcategories={subcategories}
      assignees={assignees}
      activities={activitiesByTicket[ticket.id] ?? []}
      attachments={attachmentsByTicket[ticket.id] ?? []}
      customFieldLabelMap={customFieldLabelMap}
      statusOptions={statusOptions}
      priorityOptions={priorityOptions}
      saving={savingTicketId === ticket.id}
      // Drafts overlay the server state — see usePersistedDraftMap.
      noteDraft={noteDrafts[ticket.id] ?? ticket.resolution_note ?? ''}
      commentDraft={commentDrafts[ticket.id] ?? ''}
      canReviewApproval={isApprovalAssignedToUser(ticket, user)}
      variant={variant}
      onStatusChange={(ticketId, status) => void handleStatusChange(ticketId, status)}
      onPriorityChange={(ticketId, priority) => void handlePriorityChange(ticketId, priority)}
      onAssignmentChange={(ticketId, value) => void handleAssignmentChange(ticketId, value)}
      onResolutionNoteChange={(ticketId, value) => setNoteDrafts((current) => ({
        ...current,
        [ticketId]: value,
      }))}
      onResolutionNoteSave={(ticketId) => void handleResolutionNoteSave(ticketId)}
      onCommentChange={(ticketId, value) => setCommentDrafts((current) => ({
        ...current,
        [ticketId]: value,
      }))}
      onAddComment={(ticketId) => void handleAddComment(ticketId)}
      onReviewApproval={(ticketId, decision) => setReviewTarget({ ticketId, decision })}
    />
  );

  const hasActiveFilters = statusFilter !== 'active' || priorityFilter !== 'all' || slaFilter !== 'all' || assignedToFilter !== 'all' || searchTerm.trim() !== '';

  const handleClearFilters = () => {
    setStatusFilter('active');
    setPriorityFilter('all');
    setSlaFilter('all');
    setAssignedToFilter('all');
    setSearchTerm('');
  };

  // ─── Bulk action handlers ───────────────────────────────────────────────────
  const handleBulkAssign = async (profileIdOrUnassigned: string) => {
    if (!user || selectedIds.size === 0) return;
    const count = selectedIds.size;
    const assignedTo = profileIdOrUnassigned === 'unassigned' ? null : profileIdOrUnassigned;
    setBulkSaving(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((ticketId) =>
          updateTicket(ticketId, { assigned_to: assignedTo }, { userId: user.id, companyId: user.company_id }),
        ),
      );
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ['ticketQueue', user.company_id] });
      toast.success(`${count} request${count === 1 ? '' : 's'} assigned`);
    } catch {
      toast.error('Failed to assign some requests');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkStatus = async (status: TicketStatus) => {
    if (!user || selectedIds.size === 0) return;
    const count = selectedIds.size;
    setBulkSaving(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((ticketId) =>
          updateTicket(ticketId, { status }, { userId: user.id, companyId: user.company_id }),
        ),
      );
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ['ticketQueue', user.company_id] });
      toast.success(`${count} request${count === 1 ? '' : 's'} updated`);
    } catch {
      toast.error('Failed to update some requests');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkExportCsv = () => {
    const selected = filteredTickets.filter((t) => selectedIds.has(t.id));
    const rows = [
      ['ID', 'Subject', 'Status', 'Priority', 'SLA', 'Category', 'Subcategory', 'Requester', 'Owner', 'Requested due date', 'Created at'],
      ...selected.map((ticket) => [
        ticket.id,
        ticket.subject,
        formatTicketLabel(ticket.status),
        ticket.priority,
        formatSlaState(getTicketSlaSummary(ticket).overall),
        getRequestCategoryLabel(ticket.category, categories),
        ticket.subcategory ? getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories) : '',
        ticket.submitted_by_name ?? ticket.submitted_by_email ?? '',
        ticket.assigned_to_name ?? '',
        ticket.requested_due_date ?? '',
        ticket.created_at,
      ]),
    ];
    downloadCsv(`internal-requests-selected-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const columns: StandardTableColumn<CompanyTicketRecord>[] = [
    {
      key: 'subject',
      label: 'Request',
      className: 'min-w-[260px] max-w-[460px]',
      render: (ticket) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{ticket.subject}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ticket.submitted_by_name ?? 'Unknown'} · {getRequestCategoryLabel(ticket.category, categories)}
            {ticket.subcategory ? ` / ${getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories)}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (ticket) => <RequestPriorityBadge priority={ticket.priority} />,
    },
    {
      key: 'status',
      label: 'Status',
      render: (ticket) => (
        <div className="flex flex-wrap items-center gap-1">
          <RequestStatusBadge status={ticket.status} />
          {ticket.approval_status === 'pending' && <TicketApprovalSummary ticket={ticket} compact />}
        </div>
      ),
    },
    {
      key: 'sla',
      label: 'SLA',
      sortable: false,
      render: (ticket) => <TicketSlaSummary ticket={ticket} compact />,
    },
    {
      key: 'assigned_to_name',
      label: 'Owner',
      render: (ticket) =>
        ticket.assigned_to_name
          ? <span className="text-sm text-foreground">{ticket.assigned_to_name}</span>
          : <span className="text-sm text-muted-foreground">Unassigned</span>,
    },
    {
      key: 'created_at',
      label: 'Submitted',
      className: 'text-right',
      render: (ticket) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
        </span>
      ),
    },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader
        title="Request Queue"
        description="Triage, assign, and resolve internal requests"
        breadcrumbs={[{ label: 'Internal Requests', path: '/portal' }, { label: 'Queue' }]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMetricsExpanded((current) => !current)}
              className="gap-1.5"
              aria-expanded={metricsExpanded}
            >
              {metricsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Summary
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5" disabled={loading || filteredTickets.length === 0}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetchTickets()}
              className="gap-1.5"
              disabled={ticketsFetching}
            >
              <RefreshCcw className={`h-4 w-4 ${ticketsFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </>
        }
      />

      {metricsExpanded && <RequestQueueMetricGrid metrics={queueMetrics} />}

      {/* Saved views */}
      <div className="flex shrink-0 gap-1 overflow-x-auto pb-0.5">
        {savedViews.map((view) => {
          const ViewIcon = view.Icon;
          const isActive = activeSavedView === view.id;
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => applyView(view)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              <ViewIcon className="h-3 w-3" />
              {view.label}
            </button>
          );
        })}
      </div>

      <div className="shrink-0">
        <RequestQueueFilters
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
          slaFilter={slaFilter}
          assignedToFilter={assignedToFilter}
          assignees={assignees}
          counts={statusCounts}
          statusOptions={statusOptions}
          priorityOptions={priorityOptions}
          onSearchChange={setSearchTerm}
          onStatusChange={setStatusFilter}
          onPriorityChange={setPriorityFilter}
          onSlaChange={setSlaFilter}
          onAssignedToChange={setAssignedToFilter}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : error ? (
          <HrmsEmptyState
            icon={AlertCircle}
            title="Unable to load the request queue"
            description={error}
            action={{ label: 'Retry', onClick: () => void refetchTickets() }}
          />
        ) : filteredTickets.length === 0 ? (
          <HrmsEmptyState
            icon={hasActiveFilters ? SlidersHorizontal : ShieldCheck}
            title={hasActiveFilters ? 'No requests match the current filters' : 'No requests in the queue yet'}
            description={
              hasActiveFilters
                ? 'Try adjusting the filters, or clear them to see all requests.'
                : 'New requests will appear here when submitted.'
            }
            action={hasActiveFilters ? { label: 'Clear filters', onClick: handleClearFilters } : undefined}
          />
        ) : (
          <StandardTable
            data={filteredTickets}
            columns={columns}
            rowKey="id"
            hideSearch
            mobileLayout="cards"
            serverSide
            totalCount={totalCount}
            currentPage={page}
            pageSizes={[REQUEST_QUEUE_PAGE_SIZE]}
            onPageChange={(next) => {
              setPage(next);
              setSelectedIds(new Set());
            }}
            selectable
            selected={selectedIds}
            onSelectionChange={setSelectedIds}
            bulkActions={() => (
              <>
                <Select value="" onValueChange={(value) => void handleBulkAssign(value)} disabled={bulkSaving}>
                  <SelectTrigger className="h-7 w-[150px] text-xs">
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {assignees.map((assignee) => (
                      <SelectItem key={assignee.id} value={assignee.id}>{assignee.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value="" onValueChange={(value) => void handleBulkStatus(value as TicketStatus)} disabled={bulkSaving}>
                  <SelectTrigger className="h-7 w-[150px] text-xs">
                    <SelectValue placeholder="Set status..." />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleBulkExportCsv} disabled={bulkSaving}>
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
              </>
            )}
            onRowClick={(ticket) => {
              setSelectedTicketId(ticket.id);
              void handleTicketOpen(ticket.id);
            }}
          />
        )}
      </div>

      {/* Request detail drawer */}
      <Sheet
        open={!!selectedTicket}
        onOpenChange={(open) => {
          if (!open) setSelectedTicketId(null);
        }}
      >
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
          {selectedTicket && (
            <>
              <SheetHeader className="sr-only">
                <SheetTitle>{selectedTicket.subject}</SheetTitle>
                <SheetDescription>Internal request detail</SheetDescription>
              </SheetHeader>
              <div className="px-4 py-4">
                <PanelErrorBoundary scope="request-queue:detail" resetKey={selectedTicket.id}>
                  {renderDetailPanel(selectedTicket, 'drawer')}
                </PanelErrorBoundary>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!reviewTarget} onOpenChange={(open) => {
        if (!open) {
          setReviewTarget(null);
          setReviewNote('');
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{reviewTarget?.decision === 'approved' ? 'Approve request' : 'Reject request'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {reviewTarget?.decision === 'approved'
                ? 'Record your approval decision for the current workflow step.'
                : 'Rejecting this approval will cancel the request and notify the requester.'}
            </p>
            <Textarea
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              rows={3}
              placeholder="Optional approval note"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button
              onClick={() => void handleApprovalReview()}
              disabled={!!reviewTarget && savingTicketId === reviewTarget.ticketId}
              variant={reviewTarget?.decision === 'rejected' ? 'destructive' : 'default'}
            >
              {!!reviewTarget && savingTicketId === reviewTarget.ticketId ? 'Saving...' : reviewTarget?.decision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
