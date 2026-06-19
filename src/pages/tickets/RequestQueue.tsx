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
  MessageSquare,
  Bell,
  Archive,
  RefreshCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  User,
  UserX,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { STALE } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PanelErrorBoundary } from '@/components/shared/PanelErrorBoundary';
import { PageHeader } from '@/components/shared/PageHeader';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { RequestDetailPanel } from '@/components/tickets/RequestDetailPanel';
import { RequestStatusBadge } from '@/components/tickets/RequestBadge';
import { TicketApprovalSummary } from '@/components/tickets/TicketApprovalSummary';
import { TicketOperationalBadges } from '@/components/tickets/TicketOperationalIndicators';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { TicketChatPanel } from '@/components/tickets/TicketChatPanel';
import {
  addTicketInternalNote,
  addTicketComment,
  closeTicketByRequester,
  getCompanyTicketStatusCounts,
  listTicketChatSummaries,
  listTicketInternalNotes,
  listCompanyTicketsPage,
  listTicketActivity,
  markTicketChatRead,
  markTicketCompletedByOwner,
  requestTicketMoreInformation,
  type CompanyTicketRecord,
  type PaginatedTicketResult,
  type TicketActivityRecord,
  type TicketChatSummary,
  type TicketCompletionCategory,
  type TicketInternalNoteRecord,
  type TicketPriority,
  type TicketResponsibleParty,
  type TicketStatus,
  type TicketStatusCounts,
  updateTicket,
} from '@/services/ticketService';
import {
  buildRequestOperationalIndicators,
  bulkArchiveRequests,
  bulkNotifyRequestParticipants,
  bulkUpdateRequestPriority,
  deleteRequestSavedFilter,
  listRequestSavedFilters,
  saveRequestFilter,
  type RequestOperationalIndicator,
  type RequestSavedFilterRecord,
} from '@/services/requestManagementService';
import { uploadTicketAttachment } from '@flc/platform-services';
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
  { value: 'pending_requester', label: 'Pending Requester' },
  { value: 'pending_owner_review', label: 'Pending Owner Review' },
  { value: 'completed_by_owner', label: 'Completed by Owner' },
  { value: 'closed', label: 'Closed' },
  { value: 'reopened', label: 'Reopened' },
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
  const [chatSummariesByTicket, setChatSummariesByTicket] = useState<Record<string, TicketChatSummary>>({});
  const [internalNotesByTicket, setInternalNotesByTicket] = useState<Record<string, TicketInternalNoteRecord[]>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [slaFilter, setSlaFilter] = useState<SlaFilter>('all');
  const [assignedToFilter, setAssignedToFilter] = useState<AssigneeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [subcategoryFilter, setSubcategoryFilter] = useState('all');
  const [responsiblePartyFilter, setResponsiblePartyFilter] = useState<TicketResponsibleParty | 'all'>('all');
  const [submittedFrom, setSubmittedFrom] = useState('');
  const [submittedTo, setSubmittedTo] = useState('');
  const [updatedFrom, setUpdatedFrom] = useState('');
  const [updatedTo, setUpdatedTo] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [reopenedOnly, setReopenedOnly] = useState(false);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
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
  const [completionTargetId, setCompletionTargetId] = useState<string | null>(null);
  const [completionCategory, setCompletionCategory] = useState<TicketCompletionCategory>('resolved');
  const [completionChecklistConfirmed, setCompletionChecklistConfirmed] = useState(false);
  const [chatTicketId, setChatTicketId] = useState<string | null>(null);
  const [savedFilterName, setSavedFilterName] = useState('');
  const [bulkPriorityDialogOpen, setBulkPriorityDialogOpen] = useState(false);
  const [bulkPriority, setBulkPriority] = useState<TicketPriority>('medium');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkNotifyDialogOpen, setBulkNotifyDialogOpen] = useState(false);
  const [bulkNotifyAudience, setBulkNotifyAudience] = useState<'requesters' | 'owners'>('requesters');
  const [bulkNotifyMessage, setBulkNotifyMessage] = useState('');
  const [bulkArchiveDialogOpen, setBulkArchiveDialogOpen] = useState(false);
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
  const [internalNoteDrafts, setInternalNoteDrafts, clearInternalNoteDraft] = usePersistedDraftMap(
    'queue:internal-note',
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
    { id: 'all_active',    label: 'Pending / Active',   Icon: Inbox,          status: 'active',              priority: 'all',  sla: 'all',      assignedTo: 'all' },
    { id: 'my_queue',      label: 'My Queue',            Icon: User,           status: 'active',              priority: 'all',  sla: 'all',      assignedTo: user?.id ?? 'all' },
    { id: 'unassigned',    label: 'Unassigned',          Icon: UserX,          status: 'active',              priority: 'all',  sla: 'all',      assignedTo: 'unassigned' },
    { id: 'high_priority', label: 'High Priority',       Icon: AlertCircle,    status: 'active',              priority: 'high', sla: 'all',      assignedTo: 'all' },
    { id: 'awaiting',      label: 'Pending Requester',   Icon: Clock,          status: 'pending_requester',   priority: 'all',  sla: 'all',      assignedTo: 'all' },
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
    {
      page,
      statusFilter,
      priorityFilter,
      slaFilter,
      searchTerm,
      assignedToFilter,
      categoryFilter,
      subcategoryFilter,
      responsiblePartyFilter,
      submittedFrom,
      submittedTo,
      updatedFrom,
      updatedTo,
      reopenedOnly,
    },
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
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        subcategory: subcategoryFilter !== 'all' ? subcategoryFilter : undefined,
        responsibleParty: responsiblePartyFilter !== 'all' ? responsiblePartyFilter : undefined,
        submittedFrom: submittedFrom || undefined,
        submittedTo: submittedTo || undefined,
        updatedFrom: updatedFrom || undefined,
        updatedTo: updatedTo || undefined,
        reopenedOnly,
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

  const savedFiltersQueryKey = ['requestSavedFilters', user?.company_id, user?.id, 'queue'] as const;
  const { data: savedFilters = [] } = useQuery<RequestSavedFilterRecord[]>({
    queryKey: savedFiltersQueryKey,
    queryFn: async () => {
      const result = await listRequestSavedFilters(user!.company_id, user!.id, 'queue');
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!user?.company_id && !!user?.id,
    staleTime: STALE.transactional,
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
    all: 0, open: 0, in_progress: 0, pending_requester: 0, pending_owner_review: 0, completed_by_owner: 0, closed: 0, reopened: 0, cancelled: 0,
  };

  // ─── Reset page + clear selection when filters change ──────────────────────
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [
    priorityFilter,
    searchTerm,
    statusFilter,
    slaFilter,
    assignedToFilter,
    categoryFilter,
    subcategoryFilter,
    responsiblePartyFilter,
    submittedFrom,
    submittedTo,
    updatedFrom,
    updatedTo,
    unreadOnly,
    reopenedOnly,
  ]);

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
      setChatSummariesByTicket({});
      setInternalNotesByTicket({});
      return;
    }
    void Promise.all([
      listTicketActivity(ticketIds, user.company_id),
      listAttachmentsForTickets(ticketIds, user.company_id),
      listTicketChatSummaries(ticketIds, user.id, user.company_id),
      listTicketInternalNotes(ticketIds, user.company_id),
    ]).then(([{ data: activityData }, { data: attachmentData }, { data: chatSummaryData }, { data: internalNoteData }]) => {
      setActivitiesByTicket(activityData ?? {});
      setAttachmentsByTicket(attachmentData ?? {});
      setChatSummariesByTicket(chatSummaryData ?? {});
      setInternalNotesByTicket(internalNoteData ?? {});
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
      if (categoryFilter !== 'all' && ticket.category !== categoryFilter) return false;
      if (subcategoryFilter !== 'all' && ticket.subcategory !== subcategoryFilter) return false;
      if (responsiblePartyFilter !== 'all' && ticket.current_responsible_party !== responsiblePartyFilter) return false;
      if (unreadOnly && (chatSummariesByTicket[ticket.id]?.unread_count ?? 0) === 0) return false;
      if (reopenedOnly && ticket.status !== 'reopened' && ticket.reopen_count === 0) return false;
      if (submittedFrom && new Date(ticket.created_at) < new Date(`${submittedFrom}T00:00:00`)) return false;
      if (submittedTo && new Date(ticket.created_at) > new Date(`${submittedTo}T23:59:59`)) return false;
      if (updatedFrom && new Date(ticket.updated_at) < new Date(`${updatedFrom}T00:00:00`)) return false;
      if (updatedTo && new Date(ticket.updated_at) > new Date(`${updatedTo}T23:59:59`)) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        ticket.id,
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
  }, [
    categories,
    categoryFilter,
    chatSummariesByTicket,
    responsiblePartyFilter,
    reopenedOnly,
    searchTerm,
    subcategories,
    subcategoryFilter,
    submittedFrom,
    submittedTo,
    tickets,
    unreadOnly,
    updatedFrom,
    updatedTo,
  ]);

  const indicatorsByTicket = useMemo<Record<string, RequestOperationalIndicator>>(
    () => buildRequestOperationalIndicators(filteredTickets, activitiesByTicket, chatSummariesByTicket),
    [activitiesByTicket, chatSummariesByTicket, filteredTickets],
  );

  const selectedTicket = useMemo(
    () => filteredTickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [filteredTickets, selectedTicketId],
  );
  const chatTicket = useMemo(
    () => filteredTickets.find((ticket) => ticket.id === chatTicketId) ?? null,
    [chatTicketId, filteredTickets],
  );

  const queueMetrics = useMemo(() => ({
    unassigned: tickets.filter((ticket) => isOpenStatus(ticket.status) && !ticket.assigned_to).length,
    slaBreached: tickets.filter((ticket) => getTicketSlaSummary(ticket).overall === 'breached').length,
    slaAtRisk: tickets.filter((ticket) => getTicketSlaSummary(ticket).overall === 'at_risk').length,
    inProgress: tickets.filter((ticket) => ticket.status === 'in_progress' || ticket.status === 'pending_owner_review').length,
    pendingRequester: tickets.filter((ticket) => ticket.status === 'pending_requester').length,
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

  const handleStatusChange = async (_ticketId: string, _status: TicketStatus) => {
    setQueueError('Manual status updates are restricted. Use the workflow actions in the request detail panel.');
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

  const handleAddInternalNote = async (ticketId: string) => {
    if (!user) return;
    const note = internalNoteDrafts[ticketId]?.trim() ?? '';
    if (!note) return;

    setSavingTicketId(ticketId);
    setQueueError(null);
    const { error: noteError } = await addTicketInternalNote(
      ticketId,
      { note },
      { userId: user.id, companyId: user.company_id },
    );
    if (noteError) {
      setQueueError(noteError.message || 'Unable to add internal note.');
      setSavingTicketId(null);
      return;
    }
    clearInternalNoteDraft(ticketId);
    setSavingTicketId(null);
    const [{ data: notes }, { data: activity }] = await Promise.all([
      listTicketInternalNotes([ticketId], user.company_id),
      listTicketActivity([ticketId], user.company_id),
    ]);
    if (notes) setInternalNotesByTicket((current) => ({ ...current, ...notes }));
    if (activity) setActivitiesByTicket((current) => ({ ...current, ...activity }));
  };

  const handleOpenChat = async (ticketId: string) => {
    if (!user) return;
    setChatTicketId(ticketId);
    await markTicketChatRead(ticketId, { userId: user.id, companyId: user.company_id });
    setChatSummariesByTicket((current) => ({
      ...current,
      [ticketId]: {
        ticket_id: ticketId,
        message_count: current[ticketId]?.message_count ?? 0,
        unread_count: 0,
        latest_message_at: current[ticketId]?.latest_message_at ?? null,
      },
    }));
  };

  const handleRequestMoreInformation = async (ticketId: string) => {
    if (!user) return;
    const message = commentDrafts[ticketId]?.trim() ?? '';
    if (!message) {
      setQueueError('Add a chat message before requesting more information.');
      return;
    }
    setSavingTicketId(ticketId);
    setQueueError(null);
    const { data, error: workflowError } = await requestTicketMoreInformation(
      ticketId,
      { message },
      { userId: user.id, companyId: user.company_id },
    );
    if (workflowError || !data) {
      setQueueError(workflowError?.message || 'Unable to request more information.');
      setSavingTicketId(null);
      return;
    }
    clearCommentDraft(ticketId);
    applyOptimisticTicketUpdate(ticketId, {
      status: data.status,
      current_responsible_party: data.current_responsible_party,
      next_action: data.next_action,
      updated_at: data.updated_at,
      status_changed_at: data.status_changed_at,
    });
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handleMarkCompleted = async (ticketId: string) => {
    setCompletionTargetId(ticketId);
    setCompletionCategory('resolved');
    setCompletionChecklistConfirmed(false);
  };

  const submitCompletion = async () => {
    if (!user) return;
    const ticketId = completionTargetId;
    if (!ticketId) return;
    const ticket = tickets.find((row) => row.id === ticketId);
    const resolutionNote = noteDrafts[ticketId] ?? ticket?.resolution_note ?? '';
    setSavingTicketId(ticketId);
    setQueueError(null);
    const { data, error: workflowError } = await markTicketCompletedByOwner(
      ticketId,
      {
        resolutionNote,
        completionCategory,
        checklistConfirmed: completionChecklistConfirmed,
        slaBreachReason: ticket?.sla_breach_reason ?? null,
      },
      { userId: user.id, companyId: user.company_id },
    );
    if (workflowError || !data) {
      setQueueError(workflowError?.message || 'Unable to mark request completed.');
      setSavingTicketId(null);
      return;
    }
    clearNoteDraft(ticketId);
    applyOptimisticTicketUpdate(ticketId, {
      status: data.status,
      resolution_note: data.resolution_note,
      current_responsible_party: data.current_responsible_party,
      next_action: data.next_action,
      updated_at: data.updated_at,
      status_changed_at: data.status_changed_at,
    });
    setSavingTicketId(null);
    setCompletionTargetId(null);
    setCompletionChecklistConfirmed(false);
    void refreshTicketActivity(ticketId);
  };

  const handleCloseRequest = async (ticketId: string) => {
    if (!user) return;
    setSavingTicketId(ticketId);
    setQueueError(null);
    const { data, error: workflowError } = await closeTicketByRequester(
      ticketId,
      { confirmedResolved: true, satisfactionRating: 5 },
      { userId: user.id, companyId: user.company_id },
    );
    if (workflowError || !data) {
      setQueueError(workflowError?.message || 'Unable to close request.');
      setSavingTicketId(null);
      return;
    }
    applyOptimisticTicketUpdate(ticketId, {
      status: data.status,
      current_responsible_party: data.current_responsible_party,
      next_action: data.next_action,
      updated_at: data.updated_at,
      status_changed_at: data.status_changed_at,
      resolved_at: data.resolved_at,
    });
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handleChatFilesSelected = async (ticketId: string, files: File[]) => {
    if (!user || files.length === 0) return;
    setSavingTicketId(ticketId);
    setQueueError(null);
    const results = await Promise.all(files.map((file) => uploadTicketAttachment(file, ticketId, user.company_id, user.id)));
    const failed = results.filter((result) => result.error);
    const uploadedNames = files.filter((_, index) => !results[index].error).map((file) => file.name);
    if (uploadedNames.length > 0) {
      await addTicketComment(
        ticketId,
        { message: `Attached ${uploadedNames.length} file${uploadedNames.length === 1 ? '' : 's'}.`, attachmentNames: uploadedNames },
        { userId: user.id, companyId: user.company_id },
      );
    }
    if (failed.length > 0) setQueueError(`${failed.length} attachment${failed.length === 1 ? '' : 's'} failed to upload.`);
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
      internalNotes={internalNotesByTicket[ticket.id] ?? []}
      operationalIndicator={indicatorsByTicket[ticket.id]}
      attachments={attachmentsByTicket[ticket.id] ?? []}
      customFieldLabelMap={customFieldLabelMap}
      statusOptions={statusOptions}
      priorityOptions={priorityOptions}
      currentUserId={user?.id}
      saving={savingTicketId === ticket.id}
      // Drafts overlay the server state — see usePersistedDraftMap.
      noteDraft={noteDrafts[ticket.id] ?? ticket.resolution_note ?? ''}
      commentDraft={commentDrafts[ticket.id] ?? ''}
      internalNoteDraft={internalNoteDrafts[ticket.id] ?? ''}
      canReviewApproval={isApprovalAssignedToUser(ticket, user)}
      canManageWorkflow={ticket.submitted_by !== user?.id}
      canCloseAsRequester={ticket.submitted_by === user?.id}
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
      onInternalNoteChange={(ticketId, value) => setInternalNoteDrafts((current) => ({
        ...current,
        [ticketId]: value,
      }))}
      onAddInternalNote={(ticketId) => void handleAddInternalNote(ticketId)}
      onRequestMoreInformation={(ticketId) => void handleRequestMoreInformation(ticketId)}
      onMarkCompleted={(ticketId) => void handleMarkCompleted(ticketId)}
      onCloseRequest={(ticketId) => void handleCloseRequest(ticketId)}
      onChatFilesSelected={(ticketId, files) => void handleChatFilesSelected(ticketId, files)}
      onReviewApproval={(ticketId, decision) => setReviewTarget({ ticketId, decision })}
    />
  );

  const hasActiveFilters =
    statusFilter !== 'active'
    || priorityFilter !== 'all'
    || slaFilter !== 'all'
    || assignedToFilter !== 'all'
    || categoryFilter !== 'all'
    || subcategoryFilter !== 'all'
    || responsiblePartyFilter !== 'all'
    || submittedFrom !== ''
    || submittedTo !== ''
    || updatedFrom !== ''
    || updatedTo !== ''
    || unreadOnly
    || reopenedOnly
    || searchTerm.trim() !== '';

  const handleClearFilters = () => {
    setStatusFilter('active');
    setPriorityFilter('all');
    setSlaFilter('all');
    setAssignedToFilter('all');
    setCategoryFilter('all');
    setSubcategoryFilter('all');
    setResponsiblePartyFilter('all');
    setSubmittedFrom('');
    setSubmittedTo('');
    setUpdatedFrom('');
    setUpdatedTo('');
    setUnreadOnly(false);
    setReopenedOnly(false);
    setSearchTerm('');
  };

  const currentFilterPayload = useMemo(() => ({
    statusFilter,
    priorityFilter,
    slaFilter,
    assignedToFilter,
    categoryFilter,
    subcategoryFilter,
    responsiblePartyFilter,
    submittedFrom,
    submittedTo,
    updatedFrom,
    updatedTo,
    unreadOnly,
    reopenedOnly,
    searchTerm,
  }), [
    assignedToFilter,
    categoryFilter,
    priorityFilter,
    reopenedOnly,
    responsiblePartyFilter,
    searchTerm,
    slaFilter,
    statusFilter,
    subcategoryFilter,
    submittedFrom,
    submittedTo,
    unreadOnly,
    updatedFrom,
    updatedTo,
  ]);

  const applySavedFilter = (filter: RequestSavedFilterRecord) => {
    const filters = filter.filters as Partial<typeof currentFilterPayload>;
    setStatusFilter((filters.statusFilter as StatusFilter) ?? 'active');
    setPriorityFilter((filters.priorityFilter as PriorityFilter) ?? 'all');
    setSlaFilter((filters.slaFilter as SlaFilter) ?? 'all');
    setAssignedToFilter((filters.assignedToFilter as AssigneeFilter) ?? 'all');
    setCategoryFilter(filters.categoryFilter ?? 'all');
    setSubcategoryFilter(filters.subcategoryFilter ?? 'all');
    setResponsiblePartyFilter((filters.responsiblePartyFilter as TicketResponsibleParty | 'all') ?? 'all');
    setSubmittedFrom(filters.submittedFrom ?? '');
    setSubmittedTo(filters.submittedTo ?? '');
    setUpdatedFrom(filters.updatedFrom ?? '');
    setUpdatedTo(filters.updatedTo ?? '');
    setUnreadOnly(Boolean(filters.unreadOnly));
    setReopenedOnly(Boolean(filters.reopenedOnly));
    setSearchTerm(filters.searchTerm ?? '');
    setAdvancedFiltersOpen(true);
  };

  const handleSaveCurrentFilter = async () => {
    if (!user || !savedFilterName.trim()) return;
    const result = await saveRequestFilter(user.company_id, user.id, {
      name: savedFilterName,
      scope: 'queue',
      filters: currentFilterPayload,
    });
    if (result.error) {
      toast.error('Failed to save filter', { description: result.error.message });
      return;
    }
    setSavedFilterName('');
    await queryClient.invalidateQueries({ queryKey: savedFiltersQueryKey });
    toast.success('Saved filter created');
  };

  const handleDeleteSavedFilter = async (filterId: string) => {
    if (!user) return;
    const result = await deleteRequestSavedFilter(user.company_id, user.id, filterId);
    if (result.error) {
      toast.error('Failed to delete filter', { description: result.error.message });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: savedFiltersQueryKey });
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

  const selectedTickets = useMemo(
    () => filteredTickets.filter((ticket) => selectedIds.has(ticket.id)),
    [filteredTickets, selectedIds],
  );

  const handleBulkPriorityUpdate = async () => {
    if (!user || selectedTickets.length === 0) return;
    setBulkSaving(true);
    const result = await bulkUpdateRequestPriority(
      selectedTickets.map((ticket) => ticket.id),
      bulkPriority,
      bulkReason,
      { userId: user.id, companyId: user.company_id },
    );
    setBulkSaving(false);
    if (result.error) {
      toast.error('Bulk priority update failed', { description: result.error.message });
      return;
    }
    setBulkPriorityDialogOpen(false);
    setBulkReason('');
    setSelectedIds(new Set());
    await queryClient.invalidateQueries({ queryKey: ['ticketQueue', user.company_id] });
    toast.success(`${result.updated} request${result.updated === 1 ? '' : 's'} updated`);
  };

  const handleBulkArchive = async () => {
    if (!user || selectedTickets.length === 0) return;
    setBulkSaving(true);
    const result = await bulkArchiveRequests(
      selectedTickets.map((ticket) => ticket.id),
      bulkReason,
      { userId: user.id, companyId: user.company_id },
    );
    setBulkSaving(false);
    if (result.error) {
      toast.error('Bulk archive failed', { description: result.error.message });
      return;
    }
    setBulkArchiveDialogOpen(false);
    setBulkReason('');
    setSelectedIds(new Set());
    await queryClient.invalidateQueries({ queryKey: ['ticketQueue', user.company_id] });
    toast.success(`${result.updated} request${result.updated === 1 ? '' : 's'} archived`);
  };

  const handleBulkNotify = async () => {
    if (!user || selectedTickets.length === 0) return;
    setBulkSaving(true);
    const result = await bulkNotifyRequestParticipants(
      selectedTickets,
      { audience: bulkNotifyAudience, message: bulkNotifyMessage },
      { userId: user.id, companyId: user.company_id },
    );
    setBulkSaving(false);
    if (result.error) {
      toast.error('Bulk notification failed', { description: result.error.message });
      return;
    }
    setBulkNotifyDialogOpen(false);
    setBulkNotifyMessage('');
    setSelectedIds(new Set());
    await queryClient.invalidateQueries({ queryKey: ['ticketQueue', user.company_id] });
    toast.success(`${result.notified} notification${result.notified === 1 ? '' : 's'} queued`);
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
          <TicketOperationalBadges indicator={indicatorsByTicket[ticket.id]} />
        </div>
      ),
    },
    {
      key: 'submitted_by_name',
      label: 'Requester',
      render: (ticket) => (
        <span className="text-sm text-foreground">{ticket.submitted_by_name ?? ticket.submitted_by_email ?? 'Unknown'}</span>
      ),
    },
    {
      key: 'assigned_to_name',
      label: 'Owner',
      render: (ticket) =>
        ticket.assigned_to_name
          ? <span className="text-sm text-foreground">{ticket.assigned_to_name}</span>
          : <span className="text-sm text-muted-foreground">{ticket.responsible_queue}</span>,
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
      key: 'chat',
      label: '',
      sortable: false,
      className: 'w-[56px] text-center',
      render: (ticket) => {
        const summary = chatSummariesByTicket[ticket.id];
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative h-8 w-8"
            onClick={(event) => {
              event.stopPropagation();
              void handleOpenChat(ticket.id);
            }}
            aria-label={`Open discussion for ${ticket.subject}`}
          >
            <MessageSquare className="h-4 w-4" />
            {(summary?.unread_count ?? 0) > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
                {summary!.unread_count}
              </span>
            )}
          </Button>
        );
      },
    },
    {
      key: 'sla',
      label: 'SLA',
      sortable: false,
      render: (ticket) => <TicketSlaSummary ticket={ticket} compact />,
    },
    {
      key: 'updated_at',
      label: 'Last Updated',
      className: 'text-right',
      render: (ticket) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
        </span>
      ),
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
        title="Pending / Active Requests"
        description="Triage ownership, next action, SLA risk, and active request workflow."
        breadcrumbs={[{ label: 'Internal Requests', path: '/portal' }, { label: 'Pending / Active Requests' }]}
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
        {savedFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => applySavedFilter(filter)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <Save className="h-3 w-3" />
            {filter.name}
          </button>
        ))}
      </div>

      <div className="shrink-0">
        <RequestQueueFilters
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
          slaFilter={slaFilter}
          assignedToFilter={assignedToFilter}
          categoryFilter={categoryFilter}
          subcategoryFilter={subcategoryFilter}
          responsiblePartyFilter={responsiblePartyFilter}
          submittedFrom={submittedFrom}
          submittedTo={submittedTo}
          updatedFrom={updatedFrom}
          updatedTo={updatedTo}
          unreadOnly={unreadOnly}
          reopenedOnly={reopenedOnly}
          advancedOpen={advancedFiltersOpen}
          assignees={assignees}
          categories={categories.map((category) => ({ key: category.key, label: category.label }))}
          subcategories={subcategories.map((subcategory) => ({ key: subcategory.key, label: subcategory.label, category_key: subcategory.category_key }))}
          counts={statusCounts}
          statusOptions={statusOptions}
          priorityOptions={priorityOptions}
          onSearchChange={setSearchTerm}
          onStatusChange={setStatusFilter}
          onPriorityChange={setPriorityFilter}
          onSlaChange={setSlaFilter}
          onAssignedToChange={setAssignedToFilter}
          onCategoryChange={(value) => {
            setCategoryFilter(value);
            setSubcategoryFilter('all');
          }}
          onSubcategoryChange={setSubcategoryFilter}
          onResponsiblePartyChange={setResponsiblePartyFilter}
          onSubmittedFromChange={setSubmittedFrom}
          onSubmittedToChange={setSubmittedTo}
          onUpdatedFromChange={setUpdatedFrom}
          onUpdatedToChange={setUpdatedTo}
          onUnreadOnlyChange={setUnreadOnly}
          onReopenedOnlyChange={setReopenedOnly}
          onAdvancedOpenChange={setAdvancedFiltersOpen}
        />
        <div className="mt-2 flex flex-col gap-2 rounded-lg border bg-card p-2.5 shadow-sm md:flex-row md:items-center">
          <Input
            value={savedFilterName}
            onChange={(event) => setSavedFilterName(event.target.value)}
            placeholder="Name this filter"
            className="h-9 md:max-w-xs"
          />
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void handleSaveCurrentFilter()} disabled={!savedFilterName.trim()}>
            <Save className="h-4 w-4" />
            Save filter
          </Button>
          {savedFilters.length > 0 && (
            <Select value="" onValueChange={(value) => void handleDeleteSavedFilter(value)}>
              <SelectTrigger className="h-9 md:w-[220px]">
                <SelectValue placeholder="Delete saved filter" />
              </SelectTrigger>
              <SelectContent>
                {savedFilters.map((filter) => (
                  <SelectItem key={filter.id} value={filter.id}>
                    {filter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
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
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleBulkExportCsv} disabled={bulkSaving}>
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setBulkPriorityDialogOpen(true)} disabled={bulkSaving}>
                  <SlidersHorizontal className="h-3 w-3" />
                  Priority
                </Button>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setBulkNotifyDialogOpen(true)} disabled={bulkSaving}>
                  <Bell className="h-3 w-3" />
                  Notify
                </Button>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setBulkArchiveDialogOpen(true)} disabled={bulkSaving}>
                  <Archive className="h-3 w-3" />
                  Archive
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

      <Sheet open={!!chatTicket} onOpenChange={(open) => { if (!open) setChatTicketId(null); }}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
          {chatTicket && (
            <>
              <SheetHeader className="space-y-1 border-b border-border px-5 py-4 text-left">
                <SheetTitle className="text-base leading-6">Discussion</SheetTitle>
                <SheetDescription>{chatTicket.subject}</SheetDescription>
              </SheetHeader>
              <div className="px-5 py-4">
                <TicketChatPanel
                  activities={activitiesByTicket[chatTicket.id] ?? []}
                  currentUserId={user?.id}
                  draft={commentDrafts[chatTicket.id] ?? ''}
                  saving={savingTicketId === chatTicket.id}
                  onDraftChange={(value) => setCommentDrafts((current) => ({ ...current, [chatTicket.id]: value }))}
                  onSend={() => void handleAddComment(chatTicket.id)}
                  onAttachFiles={(files) => void handleChatFilesSelected(chatTicket.id, files)}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!completionTargetId} onOpenChange={(open) => {
        if (!open) {
          setCompletionTargetId(null);
          setCompletionChecklistConfirmed(false);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark request completed</DialogTitle>
            <DialogDescription>Confirm the owner completion details before the requester closes the request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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
            <label htmlFor="request-completion-checklist" className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <Checkbox
                id="request-completion-checklist"
                checked={completionChecklistConfirmed}
                onCheckedChange={(checked) => setCompletionChecklistConfirmed(Boolean(checked))}
              />
              <span>Resolution summary, attachments, checklist items, and breach reason are complete where required.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompletionTargetId(null)}>Cancel</Button>
            <Button onClick={() => void submitCompletion()} disabled={!completionChecklistConfirmed || (!!completionTargetId && savingTicketId === completionTargetId)}>
              {!!completionTargetId && savingTicketId === completionTargetId ? 'Saving...' : 'Mark completed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkPriorityDialogOpen} onOpenChange={(open) => {
        setBulkPriorityDialogOpen(open);
        if (!open) setBulkReason('');
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bulk update priority</DialogTitle>
            <DialogDescription>Reason is required and will be recorded in the request activity trail.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={bulkPriority} onValueChange={(value) => setBulkPriority(value as TicketPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {priorityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} rows={3} placeholder="Reason for priority change" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkPriorityDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleBulkPriorityUpdate()} disabled={bulkSaving || !bulkReason.trim()}>Update {selectedTickets.length}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkArchiveDialogOpen} onOpenChange={(open) => {
        setBulkArchiveDialogOpen(open);
        if (!open) setBulkReason('');
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bulk archive requests</DialogTitle>
            <DialogDescription>Selected active requests will be cancelled with an admin override reason.</DialogDescription>
          </DialogHeader>
          <Textarea value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} rows={3} placeholder="Reason for archiving" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkArchiveDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleBulkArchive()} disabled={bulkSaving || !bulkReason.trim()}>Archive {selectedTickets.length}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkNotifyDialogOpen} onOpenChange={(open) => {
        setBulkNotifyDialogOpen(open);
        if (!open) setBulkNotifyMessage('');
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bulk notify participants</DialogTitle>
            <DialogDescription>Send a request notification to the selected audience and record the action.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={bulkNotifyAudience} onValueChange={(value) => setBulkNotifyAudience(value as 'requesters' | 'owners')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="requesters">Requesters</SelectItem>
                <SelectItem value="owners">Owners</SelectItem>
              </SelectContent>
            </Select>
            <Textarea value={bulkNotifyMessage} onChange={(event) => setBulkNotifyMessage(event.target.value)} rows={3} placeholder="Notification message" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkNotifyDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleBulkNotify()} disabled={bulkSaving || !bulkNotifyMessage.trim()}>Notify {selectedTickets.length}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
