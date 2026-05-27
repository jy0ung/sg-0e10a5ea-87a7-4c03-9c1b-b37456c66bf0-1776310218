import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { toast } from 'sonner';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCcw,
  Search,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RequestDetailPanel } from '@/components/tickets/RequestDetailPanel';
import {
  Drawer,
  DrawerContent,
} from '@/components/ui/drawer';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import {
  listCompanyTicketsPage,
  listTicketActivity,
  type CompanyTicketRecord,
  type TicketActivityRecord,
  type TicketPriority,
  type TicketStatus,
  type TicketStatusFilter,
  updateTicket,
  addTicketComment,
} from '@/services/ticketService';
import { listAttachmentsForTickets, type TicketAttachmentRecord } from '@/services/ticketAttachmentService';
import { listProfiles } from '@/services/profileService';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { formatTicketLabel, priorityColorMap, statusColorMap } from '@/lib/requestFormatters';
import { getRequestAssignees } from '@/lib/requestAssignees';
import { formatDistanceToNow } from 'date-fns';

type HistoryStatusFilter = 'archived' | TicketStatus;

const HISTORY_PAGE_SIZE = 25;

const historyStatusOptions: Array<{ value: HistoryStatusFilter; label: string }> = [
  { value: 'archived', label: 'All resolved' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const priorityOptions: Array<{ value: TicketPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const statusOptions: Array<{ value: TicketStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'awaiting_requester', label: 'Awaiting Requester' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function useIsLargeScreen() {
  const [isLargeScreen, setIsLargeScreen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsLargeScreen(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isLargeScreen;
}

export default function RequestHistory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isLargeScreen = useIsLargeScreen();
  const { categories } = useRequestCategories(user?.company_id, true);
  const { subcategories } = useRequestSubcategories(user?.company_id, { includeInactive: true });
  const { fields: formFields } = useRequestFormFields(user?.company_id, { includeInactive: true });

  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('archived');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);

  const customFieldLabelMap = useMemo(
    () => Object.fromEntries(formFields.map((f) => [`${f.category_key}:${f.key}`, f.label])),
    [formFields],
  );

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm]);

  const historyKey = ['request-history', user?.company_id, page, statusFilter, searchTerm] as const;

  const { data: historyData, isLoading: loading, error: queryError } = useQuery({
    queryKey: historyKey,
    queryFn: async () => {
      const statusParam: TicketStatusFilter = statusFilter === 'archived' ? 'archived' : statusFilter;
      const [{ data, error: fetchError }, profileResult] = await Promise.all([
        listCompanyTicketsPage(user!.company_id, { page, pageSize: HISTORY_PAGE_SIZE, status: statusParam, search: searchTerm }),
        listProfiles(user!.company_id),
      ]);
      if (fetchError) throw new Error(fetchError.message || 'Unable to load request history.');
      if (profileResult.error) throw new Error(profileResult.error || 'Unable to load profiles.');
      const nextTickets = data?.rows ?? [];
      const ticketIds = nextTickets.map((t) => t.id);
      const [{ data: activityData }, { data: attachmentData }] = await Promise.all([
        listTicketActivity(ticketIds, user!.company_id),
        listAttachmentsForTickets(ticketIds, user!.company_id),
      ]);
      return {
        tickets: nextTickets,
        totalCount: data?.totalCount ?? 0,
        assignees: getRequestAssignees(profileResult.data),
        activitiesByTicket: activityData ?? {} as Record<string, TicketActivityRecord[]>,
        attachmentsByTicket: attachmentData ?? {} as Record<string, TicketAttachmentRecord[]>,
      };
    },
    enabled: !!user,
    staleTime: STALE.transactional,
  });

  const error = queryError ? (queryError as Error).message : null;
  const tickets = useMemo(() => historyData?.tickets ?? [], [historyData]);
  const totalCount = historyData?.totalCount ?? 0;
  const assignees = useMemo(() => historyData?.assignees ?? [], [historyData]);
  const activitiesByTicket = useMemo(() => historyData?.activitiesByTicket ?? {}, [historyData]);
  const attachmentsByTicket = useMemo(() => historyData?.attachmentsByTicket ?? {}, [historyData]);

  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setNoteDrafts((prev) => {
      const next = { ...prev };
      for (const t of tickets) {
        if (!(t.id in next)) next[t.id] = t.resolution_note ?? '';
      }
      return next;
    });
    setCommentDrafts((prev) => {
      const next = { ...prev };
      for (const t of tickets) {
        if (!(t.id in next)) next[t.id] = '';
      }
      return next;
    });
  }, [tickets]);

  const loadTickets = () => void queryClient.invalidateQueries({ queryKey: historyKey });

  // Realtime: a ticket moving from active → resolved/closed/cancelled, or any
  // late activity on an archived ticket (e.g. a manager updating a resolution
  // note), should appear here without a manual refresh. Scoped channel name
  // keeps it independent of the Queue's subscription.
  const invalidateHistory = useCallback(() => {
    if (!user?.company_id) return;
    void queryClient.invalidateQueries({ queryKey: ['request-history', user.company_id] });
  }, [queryClient, user?.company_id]);
  useTicketsRealtime({
    companyId: user?.company_id,
    scope: 'history',
    onChange: invalidateHistory,
  });

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId],
  );

  function handleSelectTicket(ticketId: string) {
    setSelectedTicketId(ticketId);
    if (!isLargeScreen) setDetailDrawerOpen(true);
  }

  async function handleUpdateTicket(ticketId: string, updates: Parameters<typeof updateTicket>[1]) {
    if (!user) return;
    setSavingTicketId(ticketId);
    const result = await updateTicket(ticketId, updates, { userId: user.id, companyId: user.company_id });
    if (result.error) {
      toast.error('Failed to update request', { description: result.error.message });
    } else {
      await loadTickets();
      toast.success('Request updated');
    }
    setSavingTicketId(null);
  }

  async function handleAddComment(ticketId: string) {
    if (!user) return;
    const message = commentDrafts[ticketId]?.trim();
    if (!message) return;

    setSavingTicketId(ticketId);
    const result = await addTicketComment(ticketId, { message }, { userId: user.id, companyId: user.company_id });
    if (result.error) {
      toast.error('Failed to add comment', { description: result.error.message });
    } else {
      setCommentDrafts((prev) => ({ ...prev, [ticketId]: '' }));
      // Activity is owned by the historyKey query — invalidate to refetch the
      // ticket's updated activity timeline alongside everything else.
      await queryClient.invalidateQueries({ queryKey: historyKey });
    }
    setSavingTicketId(null);
  }

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
      canReviewApproval={false}
      variant={variant}
      onStatusChange={(ticketId, status) => void handleUpdateTicket(ticketId, { status })}
      onPriorityChange={(ticketId, priority) => void handleUpdateTicket(ticketId, { priority })}
      onAssignmentChange={(ticketId, value) =>
        void handleUpdateTicket(ticketId, { assigned_to: value === 'unassigned' ? null : value })
      }
      onResolutionNoteChange={(ticketId, value) => setNoteDrafts((prev) => ({ ...prev, [ticketId]: value }))}
      onResolutionNoteSave={(ticketId) =>
        void handleUpdateTicket(ticketId, { resolution_note: noteDrafts[ticketId] ?? '' })
      }
      onCommentChange={(ticketId, value) => setCommentDrafts((prev) => ({ ...prev, [ticketId]: value }))}
      onAddComment={(ticketId) => void handleAddComment(ticketId)}
      onReviewApproval={() => undefined}
    />
  );

  const totalPages = Math.ceil(totalCount / HISTORY_PAGE_SIZE);

  return (
    <div className="flex h-full flex-col gap-4 p-4 lg:p-6">
      {/* Header + filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Archive className="h-4 w-4" />
            <span className="text-sm font-medium">
              {loading ? '…' : `${totalCount.toLocaleString()} record${totalCount !== 1 ? 's' : ''}`}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void loadTickets()} disabled={loading} aria-label="Refresh request history">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-2.5 shadow-sm lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search subject, requester, category, VSO..."
              className="h-9 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as HistoryStatusFilter)}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {historyStatusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left: ticket list */}
        <div className={`flex flex-col gap-2 overflow-y-auto ${isLargeScreen && selectedTicketId ? 'w-[420px] flex-shrink-0' : 'flex-1'}`}>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading history…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => void loadTickets()}>Retry</Button>
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Archive className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No resolved requests found.</p>
            </div>
          ) : (
            <>
              {tickets.map((ticket) => {
                const categoryLabel = getRequestCategoryLabel(ticket.category, categories);
                const isSelected = ticket.id === selectedTicketId;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => handleSelectTicket(ticket.id)}
                    className={`w-full rounded-lg border bg-card p-3.5 text-left shadow-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSelected ? 'border-primary/50 bg-accent/60 ring-1 ring-primary/30' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColorMap[ticket.status] ?? 'bg-muted text-muted-foreground'}`}>
                            {formatTicketLabel(ticket.status)}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityColorMap[ticket.priority] ?? 'bg-muted text-muted-foreground'}`}>
                            {ticket.priority}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground line-clamp-2">{ticket.subject}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{categoryLabel}</span>
                          {ticket.submitted_by_name && <span>· {ticket.submitted_by_name}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        {ticket.resolved_at
                          ? <span title={new Date(ticket.resolved_at).toLocaleString()}>
                              {formatDistanceToNow(new Date(ticket.resolved_at), { addSuffix: true })}
                            </span>
                          : <span>{formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}</span>
                        }
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline" size="icon" className="h-7 w-7"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1 || loading}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline" size="icon" className="h-7 w-7"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages || loading}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: detail panel (large screens) */}
        {isLargeScreen && selectedTicket && (
          <div className="flex-1 overflow-y-auto rounded-lg border bg-card shadow-sm">
            {renderDetailPanel(selectedTicket)}
          </div>
        )}
      </div>

      {/* Mobile drawer */}
      {!isLargeScreen && selectedTicket && (
        <Drawer open={detailDrawerOpen} onOpenChange={setDetailDrawerOpen}>
          <DrawerContent className="max-h-[90vh]">
            <div className="overflow-y-auto p-4">
              {renderDetailPanel(selectedTicket, 'drawer')}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
