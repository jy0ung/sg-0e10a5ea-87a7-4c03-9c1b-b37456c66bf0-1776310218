import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Loader2,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RequestDetailPanel } from '@/components/tickets/RequestDetailPanel';
import { RequestQueueFilters, type PriorityFilter, type SlaFilter, type StatusFilter } from '@/components/tickets/RequestQueueFilters';
import { RequestQueueList } from '@/components/tickets/RequestQueueList';
import { RequestQueueMetricGrid } from '@/components/tickets/RequestQueueMetricGrid';
import { Textarea } from '@/components/ui/textarea';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import {
  Drawer,
  DrawerContent,
} from '@/components/ui/drawer';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  addTicketComment,
  listCompanyTicketsPage,
  listTicketActivity,
  type CompanyTicketRecord,
  type TicketActivityRecord,
  type TicketPriority,
  type TicketStatus,
  updateTicket,
} from '@/services/ticketService';
import { reviewInternalRequestApproval } from '@/services/requestApprovalService';
import { listAttachmentsForTickets, type TicketAttachmentRecord } from '@/services/ticketAttachmentService';
import { listProfiles, type ProfileRow } from '@/services/profileService';
import { ADMIN_ONLY } from '@/config/routeRoles';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { getRequestSubcategoryLabel } from '@/lib/requestSubcategories';
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

const requestOwnerRoles = new Set(ADMIN_ONLY);
const REQUEST_QUEUE_PAGE_SIZE = 25;

function useIsLargeScreen() {
  const [isLargeScreen, setIsLargeScreen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleChange = () => setIsLargeScreen(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isLargeScreen;
}

// formatTicketLabel, isOpenStatus, isApprovalAssignedToUser, csvCell, downloadCsv
// are now imported from '@/lib/requestFormatters'

export default function RequestQueue() {
  const { user } = useAuth();
  const isLargeScreen = useIsLargeScreen();
  const { categories } = useRequestCategories(user?.company_id, true);
  const { subcategories } = useRequestSubcategories(user?.company_id, { includeInactive: true });
  const { fields: formFields } = useRequestFormFields(user?.company_id, { includeInactive: true });
  const [tickets, setTickets] = useState<CompanyTicketRecord[]>([]);
  const [activitiesByTicket, setActivitiesByTicket] = useState<Record<string, TicketActivityRecord[]>>({});
  const [attachmentsByTicket, setAttachmentsByTicket] = useState<Record<string, TicketAttachmentRecord[]>>({});
  const [assignees, setAssignees] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [slaFilter, setSlaFilter] = useState<SlaFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [metricsExpanded, setMetricsExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('requestQueue.metricsExpanded') !== 'false';
  });
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ApprovalReviewTarget>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const customFieldLabelMap = useMemo(
    () => Object.fromEntries(formFields.map((field) => [`${field.category_key}:${field.key}`, field.label])),
    [formFields],
  );

  const loadTickets = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    const [{ data, error: fetchError }, profileResult] = await Promise.all([
      listCompanyTicketsPage(user.company_id, {
        page,
        pageSize: REQUEST_QUEUE_PAGE_SIZE,
        status: statusFilter,
        priority: priorityFilter,
        search: searchTerm,
      }),
      listProfiles(user.company_id),
    ]);

    if (fetchError) {
      setError(fetchError.message || 'Unable to load the request queue.');
    } else if (profileResult.error) {
      setError(profileResult.error || 'Unable to load request owners.');
    } else {
      const nextTickets = data?.rows ?? [];
      setTickets(nextTickets);
      setTotalCount(data?.totalCount ?? 0);
      setAssignees(
        profileResult.data
          .filter((profile) => profile.status === 'active' && requestOwnerRoles.has(profile.role))
          .sort((left, right) => left.name.localeCompare(right.name)),
      );
      setNoteDrafts(
        Object.fromEntries(nextTickets.map((ticket) => [ticket.id, ticket.resolution_note ?? ''])),
      );
      setCommentDrafts(
        Object.fromEntries(nextTickets.map((ticket) => [ticket.id, ''])),
      );

      const ticketIds = nextTickets.map((ticket) => ticket.id);
      const [{ data: activityData }, { data: attachmentData }] = await Promise.all([
        listTicketActivity(ticketIds, user.company_id),
        listAttachmentsForTickets(ticketIds, user.company_id),
      ]);
      setActivitiesByTicket(activityData ?? {});
      setAttachmentsByTicket(attachmentData ?? {});
    }

    setLoading(false);
  }, [page, priorityFilter, searchTerm, statusFilter, user]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    setPage(1);
  }, [priorityFilter, searchTerm, statusFilter]);

  useEffect(() => {
    if (isLargeScreen) setDetailDrawerOpen(false);
  }, [isLargeScreen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('requestQueue.metricsExpanded', String(metricsExpanded));
  }, [metricsExpanded]);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) return false;
      if (slaFilter !== 'all' && getTicketSlaSummary(ticket).overall !== slaFilter) return false;
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
  }, [categories, priorityFilter, searchTerm, slaFilter, statusFilter, subcategories, tickets]);

  const selectedTicket = useMemo(() => {
    return filteredTickets.find((ticket) => ticket.id === selectedTicketId) ?? filteredTickets[0] ?? null;
  }, [filteredTickets, selectedTicketId]);

  const totalPages = Math.max(1, Math.ceil(totalCount / REQUEST_QUEUE_PAGE_SIZE));

  useEffect(() => {
    if (!selectedTicket) {
      setSelectedTicketId(null);
      return;
    }
    if (selectedTicket.id !== selectedTicketId) {
      setSelectedTicketId(selectedTicket.id);
    }
  }, [selectedTicket, selectedTicketId]);

  const counts = useMemo(() => {
    return tickets.reduce<Record<StatusFilter, number>>(
      (summary, ticket) => {
        summary[ticket.status] += 1;
        return summary;
      },
      { all: tickets.length, open: 0, in_progress: 0, awaiting_requester: 0, resolved: 0, closed: 0, cancelled: 0 },
    );
  }, [tickets]);

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

  const handleStatusChange = async (ticketId: string, status: TicketStatus) => {
    if (!user) return;

    setSavingTicketId(ticketId);
    setError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { status },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setError(updateError?.message || 'Unable to update request status.');
      setSavingTicketId(null);
      return;
    }

    setTickets((current) => current.map((ticket) => {
      if (ticket.id !== ticketId) return ticket;
      return {
        ...ticket,
        status: data.status,
        priority: data.priority,
        assigned_to: data.assigned_to,
        assigned_at: data.assigned_at,
        resolved_at: data.resolved_at,
        resolution_note: data.resolution_note,
        updated_at: data.updated_at,
      };
    }));
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handleAssignmentChange = async (ticketId: string, value: string) => {
    if (!user) return;

    const assignedTo = value === 'unassigned' ? null : value;
    const assignee = assignees.find((profile) => profile.id === assignedTo) ?? null;

    setSavingTicketId(ticketId);
    setError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { assigned_to: assignedTo },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setError(updateError?.message || 'Unable to update request owner.');
      setSavingTicketId(null);
      return;
    }

    setTickets((current) => current.map((ticket) => {
      if (ticket.id !== ticketId) return ticket;
      return {
        ...ticket,
        assigned_to: data.assigned_to,
        assigned_at: data.assigned_at,
        resolved_at: data.resolved_at,
        resolution_note: data.resolution_note,
        updated_at: data.updated_at,
        assigned_to_name: assignee?.name ?? null,
        assigned_to_email: assignee?.email ?? null,
      };
    }));
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handlePriorityChange = async (ticketId: string, priority: TicketPriority) => {
    if (!user) return;

    setSavingTicketId(ticketId);
    setError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { priority },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setError(updateError?.message || 'Unable to update request priority.');
      setSavingTicketId(null);
      return;
    }

    setTickets((current) => current.map((ticket) => {
      if (ticket.id !== ticketId) return ticket;
      return {
        ...ticket,
        priority: data.priority,
        updated_at: data.updated_at,
      };
    }));
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handleResolutionNoteSave = async (ticketId: string) => {
    if (!user) return;

    setSavingTicketId(ticketId);
    setError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { resolution_note: noteDrafts[ticketId] ?? '' },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setError(updateError?.message || 'Unable to save the resolution note.');
      setSavingTicketId(null);
      return;
    }

    setTickets((current) => current.map((ticket) => {
      if (ticket.id !== ticketId) return ticket;
      return {
        ...ticket,
        resolution_note: data.resolution_note,
        resolved_at: data.resolved_at,
        updated_at: data.updated_at,
      };
    }));
    setNoteDrafts((current) => ({ ...current, [ticketId]: data.resolution_note ?? '' }));
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handleAddComment = async (ticketId: string) => {
    if (!user) return;
    const message = commentDrafts[ticketId]?.trim() ?? '';
    if (!message) return;

    setSavingTicketId(ticketId);
    setError(null);

    const { error: commentError } = await addTicketComment(
      ticketId,
      { message },
      { userId: user.id, companyId: user.company_id },
    );

    if (commentError) {
      setError(commentError.message || 'Unable to add comment.');
      setSavingTicketId(null);
      return;
    }

    setCommentDrafts((current) => ({ ...current, [ticketId]: '' }));
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
  };

  const handleApprovalReview = async () => {
    if (!user || !reviewTarget) return;

    setSavingTicketId(reviewTarget.ticketId);
    setError(null);
    const { error: reviewError } = await reviewInternalRequestApproval(
      reviewTarget.ticketId,
      reviewTarget.decision,
      reviewNote,
      { userId: user.id, companyId: user.company_id },
    );
    setSavingTicketId(null);

    if (reviewError) {
      setError(reviewError);
      return;
    }

    toast.success(reviewTarget.decision === 'approved' ? 'Request approval recorded' : 'Request rejected');
    setReviewTarget(null);
    setReviewNote('');
    await loadTickets();
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
      noteDraft={noteDrafts[ticket.id] ?? ''}
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

  return (
    <div className="flex h-full min-h-[720px] w-full flex-col gap-2 overflow-hidden lg:min-h-0">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2.5 shadow-sm">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-foreground">Request Workbench</h1>
          <p className="text-[11px] text-muted-foreground">Triage, assign, and resolve internal requests</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMetricsExpanded((current) => !current)}
            className="h-8 gap-1.5 text-xs"
            aria-expanded={metricsExpanded}
          >
            {metricsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Summary
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="h-8 gap-1.5 text-xs" disabled={loading || filteredTickets.length === 0}>
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadTickets()} className="h-8 gap-1.5 text-xs" disabled={loading}>
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {metricsExpanded && (
        <div className="shrink-0">
          <RequestQueueMetricGrid metrics={queueMetrics} />
        </div>
      )}

      <div className="shrink-0">
        <RequestQueueFilters
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
          slaFilter={slaFilter}
          counts={counts}
          statusOptions={statusOptions}
          priorityOptions={priorityOptions}
          onSearchChange={setSearchTerm}
          onStatusChange={setStatusFilter}
          onPriorityChange={setPriorityFilter}
          onSlaChange={setSlaFilter}
        />
      </div>

      {loading ? (
        <Card className="flex min-h-0 flex-1">
          <CardContent className="flex flex-1 items-center justify-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading the request queue...</span>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="flex min-h-0 flex-1">
          <CardContent className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Unable to load the request queue</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={() => void loadTickets()} variant="outline" className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : filteredTickets.length === 0 ? (
        <Card className="flex min-h-0 flex-1">
          <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">No requests match this view</p>
              <p className="text-sm text-muted-foreground">Adjust the filters or refresh when new requests arrive.</p>
            </div>
          </CardContent>
        </Card>
      ) : selectedTicket ? (
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[minmax(340px,0.9fr)_minmax(560px,1.6fr)] xl:grid-cols-[minmax(380px,0.8fr)_minmax(640px,1.7fr)]">
          <RequestQueueList
            tickets={filteredTickets}
            selectedTicketId={selectedTicket.id}
            openCount={counts.open}
            categories={categories}
            subcategories={subcategories}
            attachmentsByTicket={attachmentsByTicket}
            onSelectTicket={(ticketId) => {
              setSelectedTicketId(ticketId);
              if (!isLargeScreen) setDetailDrawerOpen(true);
            }}
          />

          <section className="hidden min-h-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:block">
            {renderDetailPanel(selectedTicket)}
          </section>
        </div>
      ) : null}

      {!loading && !error && totalCount > 0 && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          <span>
            {((page - 1) * REQUEST_QUEUE_PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * REQUEST_QUEUE_PAGE_SIZE, totalCount).toLocaleString()} of {totalCount.toLocaleString()}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Button>
            <span className="min-w-[70px] text-center text-[11px] text-foreground tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <Drawer open={!isLargeScreen && detailDrawerOpen && !!selectedTicket} onOpenChange={setDetailDrawerOpen}>
        <DrawerContent className="max-h-[92vh]">
          {selectedTicket && (
            <div className="overflow-y-auto px-4 pb-6 pt-3">
              {renderDetailPanel(selectedTicket, 'drawer')}
            </div>
          )}
        </DrawerContent>
      </Drawer>

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
