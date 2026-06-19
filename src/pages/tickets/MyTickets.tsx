import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Inbox,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCcw,
  Search,
  Ticket,
  XCircle,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/PageHeader';
import { MetricCard } from '@/components/shared/MetricCard';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { RequestBadge, RequestPriorityBadge, RequestStatusBadge } from '@/components/tickets/RequestBadge';
import { TicketActivityList } from '@/components/tickets/TicketActivityList';
import { TicketAttachmentList } from '@/components/tickets/TicketAttachmentList';
import { TicketApprovalSummary } from '@/components/tickets/TicketApprovalSummary';
import { TicketSlaSummary } from '@/components/tickets/TicketSlaSummary';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import { usePersistedDraftMap } from '@/hooks/usePersistedDraftMap';
import { getRequestCategoryLabel } from '@/lib/requestCategories';

import {
  formatDueDate,
  customFieldEntries,
} from '@/lib/requestFormatters';
import {
  addTicketComment,
  closeTicketByRequester,
  cancelMyTicket,
  listTicketChatSummaries,
  listMyTickets,
  listTicketActivity,
  markTicketChatRead,
  submitRequesterTicketUpdate,
  type RequestTicketRecord,
  type TicketActivityRecord,
  type TicketChatSummary,
} from '@/services/ticketService';
import { listAttachmentsForTickets, uploadTicketAttachment, type TicketAttachmentRecord } from '@flc/platform-services';
import { TicketChatPanel } from '@/components/tickets/TicketChatPanel';

type MyStatusFilter = 'all' | 'in_progress' | 'attention' | 'cancelled';

export default function MyTickets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { categories } = useRequestCategories(user?.company_id, true);
  useRequestSubcategories(user?.company_id, { includeInactive: true });
  const { fields: formFields } = useRequestFormFields(user?.company_id, { includeInactive: true });
  const [error, setError] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts, clearCommentDraft] = usePersistedDraftMap(
    'my-tickets:comment',
    user?.company_id,
    user?.id,
  );
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [cancellingTicketId, setCancellingTicketId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [chatTicketId, setChatTicketId] = useState<string | null>(null);
  const [chatSummariesByTicket, setChatSummariesByTicket] = useState<Record<string, TicketChatSummary>>({});
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [satisfactionRating, setSatisfactionRating] = useState('5');
  const [closureFeedback, setClosureFeedback] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<MyStatusFilter>('all');

  const customFieldLabelMap = useMemo(
    () => Object.fromEntries(formFields.map((field) => [`${field.category_key}:${field.key}`, field.label])),
    [formFields],
  );

  const myTicketsKey = ['my-tickets', user?.id, user?.company_id] as const;

  const { data: ticketsData, isLoading: loading, error: queryError } = useQuery({
    queryKey: myTicketsKey,
    queryFn: async () => {
      const { data, error: fetchError } = await listMyTickets(user!.id, user!.company_id);
      if (fetchError) throw new Error(fetchError.message || 'Unable to load requests.');
      const nextTickets = data ?? [];
      const ticketIds = nextTickets.map((t) => t.id);
      const [{ data: activityData }, { data: attachmentData }, { data: chatSummaryData }] = await Promise.all([
        listTicketActivity(ticketIds, user!.company_id),
        listAttachmentsForTickets(ticketIds, user!.company_id),
        listTicketChatSummaries(ticketIds, user!.id, user!.company_id),
      ]);
      setChatSummariesByTicket(chatSummaryData ?? {});
      return {
        tickets: nextTickets,
        activitiesByTicket: activityData ?? {} as Record<string, TicketActivityRecord[]>,
        attachmentsByTicket: attachmentData ?? {} as Record<string, TicketAttachmentRecord[]>,
      };
    },
    enabled: !!user,
    staleTime: STALE.transactional,
  });

  const tickets = useMemo(() => ticketsData?.tickets ?? [], [ticketsData]);
  const activitiesByTicket = useMemo(() => ticketsData?.activitiesByTicket ?? {}, [ticketsData]);
  const attachmentsByTicket = useMemo(() => ticketsData?.attachmentsByTicket ?? {}, [ticketsData]);
  const displayError = error ?? (
    queryError instanceof Error
      ? queryError.message
      : queryError
        ? 'Unable to load requests.'
        : null
  );

  // Seed effect removed: usePersistedDraftMap returns the same shape and
  // every consumer already falls back to '' via `commentDrafts[id] ?? ''`,
  // so we no longer need to pre-populate empty entries for every ticket.

  const refreshTickets = useCallback(
    () => { void queryClient.invalidateQueries({ queryKey: myTicketsKey }); },
    // myTicketsKey is a readonly tuple — spread its primitive members so the
    // memoization tracks values, not the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, ...myTicketsKey],
  );

  // Realtime: queue managers may assign, comment on, or resolve the user's
  // ticket while they have this page open. We subscribe to the full tenant
  // (other people's tickets too) and let invalidateQueries refetch only
  // listMyTickets — the cost is a few extra refetches per company-wide
  // change in exchange for not maintaining a compound filter expression
  // that supabase realtime doesn't natively support.
  useTicketsRealtime({
    companyId: user?.company_id,
    scope: 'my-tickets',
    onChange: refreshTickets,
  });

  const handleAddComment = async (ticketId: string) => {
    if (!user) return;
    const message = commentDrafts[ticketId]?.trim() ?? '';
    if (!message) return;

    setSavingCommentId(ticketId);
    setError(null);
    const target = tickets.find((ticket) => ticket.id === ticketId);
    const { error: commentError } = target?.status === 'pending_requester'
      ? await submitRequesterTicketUpdate(ticketId, { message }, { userId: user.id, companyId: user.company_id })
      : await addTicketComment(ticketId, { message }, { userId: user.id, companyId: user.company_id });
    setSavingCommentId(null);

    if (commentError) {
      setError(commentError.message || 'Unable to add comment.');
      return;
    }

    clearCommentDraft(ticketId);
    // The activity timeline is fetched as part of the myTicketsKey query —
    // invalidate so the new comment shows up without manual state plumbing.
    await queryClient.invalidateQueries({ queryKey: myTicketsKey });
  };

  const handleOpenChat = useCallback(async (ticketId: string) => {
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
  }, [user]);

  const handleChatFilesSelected = async (ticketId: string, files: File[]) => {
    if (!user || files.length === 0) return;
    setSavingCommentId(ticketId);
    setError(null);
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
    if (failed.length > 0) setError(`${failed.length} attachment${failed.length === 1 ? '' : 's'} failed to upload.`);
    setSavingCommentId(null);
    await queryClient.invalidateQueries({ queryKey: myTicketsKey });
  };

  const handleCloseTicket = async () => {
    if (!user) return;
    const ticketId = closeTargetId;
    if (!ticketId) return;
    setSavingCommentId(ticketId);
    setError(null);
    const { error: closeError } = await closeTicketByRequester(
      ticketId,
      {
        confirmedResolved: closeConfirmed,
        satisfactionRating: Number(satisfactionRating),
        feedbackComment: closureFeedback,
      },
      { userId: user.id, companyId: user.company_id },
    );
    setSavingCommentId(null);
    if (closeError) {
      setError(closeError.message || 'Unable to close request.');
      return;
    }
    setCloseTargetId(null);
    setCloseConfirmed(false);
    setSatisfactionRating('5');
    setClosureFeedback('');
    await queryClient.invalidateQueries({ queryKey: myTicketsKey });
  };

  const handleCancelTicket = async (ticketId: string) => {
    if (!user) return;
    setCancellingTicketId(ticketId);
    setError(null);

    const { data, error: cancelError } = await cancelMyTicket(
      ticketId,
      { reason: 'Cancelled by requester.' },
      { userId: user.id, companyId: user.company_id },
    );

    setCancellingTicketId(null);
    if (cancelError || !data) {
      setError(cancelError?.message || 'Unable to cancel request.');
      return;
    }

    queryClient.setQueryData<typeof ticketsData>(myTicketsKey, (old) => old ? {
      ...old,
      tickets: old.tickets.map((ticket) => ticket.id === ticketId ? {
        ...ticket,
        status: data.status,
        resolved_at: data.resolved_at,
        resolution_note: data.resolution_note,
        updated_at: data.updated_at,
      } : ticket),
    } : old);
    refreshTickets();
  };


  // ── Derived state ─────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const pendingTickets = tickets.filter((ticket) => ticket.status !== 'closed');
    const c = { all: pendingTickets.length, in_progress: 0, attention: 0, cancelled: 0 };
    for (const t of pendingTickets) {
      if (t.status === 'in_progress' || t.status === 'pending_owner_review') c.in_progress++;
      else if (t.status === 'pending_requester' || t.status === 'completed_by_owner') c.attention++;
      else if (t.status === 'cancelled') c.cancelled++;
    }
    return c;
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return tickets.filter((ticket) => {
      // Status filter
      if (ticket.status === 'closed') return false;
      if (statusFilter === 'in_progress' && ticket.status !== 'in_progress' && ticket.status !== 'pending_owner_review') return false;
      if (statusFilter === 'attention' && ticket.status !== 'pending_requester' && ticket.status !== 'completed_by_owner') return false;
      if (statusFilter === 'cancelled' && ticket.status !== 'cancelled') return false;

      // Search
      if (!search) return true;
      const haystack = [
        ticket.subject,
        ticket.description,
        ticket.vso_number,
        getRequestCategoryLabel(ticket.category, categories),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }, [tickets, searchTerm, statusFilter, categories]);

  const selectedTicket = useMemo(
    () => filteredTickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [filteredTickets, selectedTicketId],
  );
  const chatTicket = useMemo(
    () => filteredTickets.find((ticket) => ticket.id === chatTicketId) ?? null,
    [chatTicketId, filteredTickets],
  );

  const columns = useMemo<StandardTableColumn<RequestTicketRecord>[]>(() => [
    {
      key: 'subject',
      label: 'Request',
      className: 'min-w-[240px] max-w-[420px]',
      render: (ticket) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{ticket.subject}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ticket.assigned_to_name ? `Owner: ${ticket.assigned_to_name}` : 'Awaiting assignment'}
            {ticket.vso_number ? ` · VSO ${ticket.vso_number}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (ticket) => (
        <span className="text-sm text-foreground">{getRequestCategoryLabel(ticket.category, categories)}</span>
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
      render: (ticket) => <RequestStatusBadge status={ticket.status} />,
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
    {
      key: 'assigned_to_name',
      label: 'Owner / PIC',
      render: (ticket) => (
        <span className="text-sm text-foreground">{ticket.assigned_to_name ?? ticket.responsible_queue}</span>
      ),
    },
  ], [categories, chatSummariesByTicket, handleOpenChat]);

  const metrics: Array<{ key: MyStatusFilter; label: string; value: number; icon: React.ElementType; tone: 'slate' | 'blue' | 'emerald' | 'amber'; hint?: string }> = [
    { key: 'all', label: 'Total', value: counts.all, icon: Ticket, tone: 'slate' },
    { key: 'in_progress', label: 'In Progress', value: counts.in_progress, icon: Inbox, tone: 'blue' },
    { key: 'attention', label: 'Need Your Attention', value: counts.attention, icon: CheckCircle2, tone: 'amber' },
    { key: 'cancelled', label: 'Cancelled', value: counts.cancelled, icon: XCircle, tone: 'slate' },
  ];

  const selectedExtraFields = selectedTicket ? customFieldEntries(selectedTicket, customFieldLabelMap) : [];
  const selectedCanCancel = selectedTicket?.status === 'open' && !selectedTicket.assigned_to;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader
        title="Pending Requests"
        description="Track active requests, requester actions, and owner follow-up."
        breadcrumbs={[{ label: 'Internal Requests', path: '/portal' }, { label: 'Pending Requests' }]}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void refreshTickets()} disabled={loading}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/portal/tickets/new">
                <Plus className="h-4 w-4" />
                New request
              </Link>
            </Button>
          </>
        }
      />

      {/* Metric strip — also acts as a status filter */}
      {!loading && !displayError && tickets.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard
              key={metric.key}
              label={metric.label}
              value={metric.value}
              icon={metric.icon}
              tone={metric.tone}
              hint={metric.hint}
              onClick={() => setStatusFilter(metric.key)}
            />
          ))}
        </div>
      )}

      {/* Filter bar */}
      {!loading && !displayError && tickets.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by subject, category, VSO..."
              className="h-9 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as MyStatusFilter)}>
            <SelectTrigger className="h-9 w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({counts.all})</SelectItem>
              <SelectItem value="in_progress">In progress ({counts.in_progress})</SelectItem>
              <SelectItem value="attention">Need your attention ({counts.attention})</SelectItem>
              <SelectItem value="cancelled">Cancelled ({counts.cancelled})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : displayError ? (
        <HrmsEmptyState
          icon={AlertCircle}
          title="Unable to load requests"
          description={displayError}
          action={{ label: 'Retry', onClick: () => void refreshTickets() }}
        />
      ) : tickets.length === 0 ? (
        <HrmsEmptyState
          icon={Ticket}
          title="No requests yet"
          description="Submit a new internal request to get started."
          action={{ label: 'New request', onClick: () => navigate('/portal/tickets/new') }}
        />
      ) : (
        <StandardTable
          data={filteredTickets}
          columns={columns}
          rowKey="id"
          hideSearch
          mobileLayout="cards"
          emptyMessage="No requests match your search or filter."
          onRowClick={(ticket) => setSelectedTicketId(ticket.id)}
        />
      )}

      {/* Request detail drawer */}
      <Sheet
        open={!!selectedTicket}
        onOpenChange={(open) => {
          if (!open) setSelectedTicketId(null);
        }}
      >
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
          {selectedTicket && (
            <>
              <SheetHeader className="space-y-2 border-b border-border px-5 py-4 text-left">
                <div className="flex flex-wrap items-center gap-1.5">
                  <RequestStatusBadge status={selectedTicket.status} />
                  <RequestPriorityBadge priority={selectedTicket.priority} />
                  {selectedTicket.requested_due_date && (
                    <RequestBadge
                      tone="slate"
                      icon={CalendarDays}
                      label={`Due ${formatDueDate(selectedTicket.requested_due_date)}`}
                    />
                  )}
                </div>
                <SheetTitle className="text-base leading-6">{selectedTicket.subject}</SheetTitle>
                <SheetDescription>
                  {getRequestCategoryLabel(selectedTicket.category, categories)}
                  {' · Submitted '}
                  {formatDistanceToNow(new Date(selectedTicket.created_at), { addSuffix: true })}
                  {selectedTicket.vso_number ? ` · VSO ${selectedTicket.vso_number}` : ''}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-3 px-5 py-4">
                <div className="rounded-md border bg-background px-3 py-2">
                  <p className="eyebrow mb-1">Description</p>
                  <p className="whitespace-pre-line text-sm leading-5 text-foreground">{selectedTicket.description}</p>
                </div>

                <TicketSlaSummary ticket={selectedTicket} />
                <TicketApprovalSummary ticket={selectedTicket} />

                {(selectedTicket.desired_outcome || selectedTicket.business_impact) && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedTicket.desired_outcome && (
                      <div className="rounded-md border border-border bg-background px-3 py-2">
                        <p className="eyebrow flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3" />
                          Desired outcome
                        </p>
                        <p className="mt-1 text-sm leading-5 text-foreground">{selectedTicket.desired_outcome}</p>
                      </div>
                    )}
                    {selectedTicket.business_impact && (
                      <div className="rounded-md border border-border bg-background px-3 py-2">
                        <p className="eyebrow">Business impact</p>
                        <p className="mt-1 text-sm leading-5 text-foreground">{selectedTicket.business_impact}</p>
                      </div>
                    )}
                  </div>
                )}

                {selectedExtraFields.length > 0 && (
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <p className="eyebrow">Additional details</p>
                    <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                      {selectedExtraFields.map((field) => (
                        <div key={field.key} className="min-w-0">
                          <p className="text-xs text-muted-foreground">{field.label}</p>
                          <p className="truncate text-sm text-foreground">{field.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTicket.resolution_note && (
                  <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
                    <p className="eyebrow">Resolution note</p>
                    <p className="mt-1 text-sm leading-5 text-foreground">{selectedTicket.resolution_note}</p>
                  </div>
                )}

                <TicketAttachmentList attachments={attachmentsByTicket[selectedTicket.id] ?? []} />

                {selectedTicket.status !== 'closed' && selectedTicket.status !== 'cancelled' && (
                  <div className="space-y-2 rounded-md border border-border bg-background px-3 py-2.5">
                    <p className="eyebrow flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" />
                      Discussion
                    </p>
                    <TicketChatPanel
                      activities={activitiesByTicket[selectedTicket.id] ?? []}
                      currentUserId={user?.id}
                      draft={commentDrafts[selectedTicket.id] ?? ''}
                      saving={savingCommentId === selectedTicket.id}
                      onDraftChange={(value) => setCommentDrafts((current) => ({ ...current, [selectedTicket.id]: value }))}
                      onSend={() => void handleAddComment(selectedTicket.id)}
                      onAttachFiles={(files) => void handleChatFilesSelected(selectedTicket.id, files)}
                    />
                  </div>
                )}

                {selectedTicket.status === 'completed_by_owner' && (
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    disabled={savingCommentId === selectedTicket.id}
                    onClick={() => setCloseTargetId(selectedTicket.id)}
                  >
                    Close request
                  </Button>
                )}

                <TicketActivityList activities={activitiesByTicket[selectedTicket.id] ?? []} />

                {selectedCanCancel && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5 text-destructive hover:text-destructive"
                        disabled={cancellingTicketId === selectedTicket.id}
                      >
                        {cancellingTicketId === selectedTicket.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                        Cancel request
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel request?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This request is still open and unassigned. Cancelling it will close the request and remove it from the active queue.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep request</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => void handleCancelTicket(selectedTicket.id)}
                        >
                          Cancel request
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
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
                  saving={savingCommentId === chatTicket.id}
                  onDraftChange={(value) => setCommentDrafts((current) => ({ ...current, [chatTicket.id]: value }))}
                  onSend={() => void handleAddComment(chatTicket.id)}
                  onAttachFiles={(files) => void handleChatFilesSelected(chatTicket.id, files)}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!closeTargetId} onOpenChange={(open) => {
        if (!open) {
          setCloseTargetId(null);
          setCloseConfirmed(false);
          setSatisfactionRating('5');
          setClosureFeedback('');
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close request</DialogTitle>
            <DialogDescription>Confirm the outcome and share feedback before this request moves to Completed Requests.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label htmlFor="request-close-confirmed" className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <Checkbox id="request-close-confirmed" checked={closeConfirmed} onCheckedChange={(checked) => setCloseConfirmed(Boolean(checked))} />
              <span>The issue was resolved and this request can be closed.</span>
            </label>
            <div className="space-y-1.5">
              <Label>Satisfaction rating</Label>
              <Select value={satisfactionRating} onValueChange={setSatisfactionRating}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 - Very satisfied</SelectItem>
                  <SelectItem value="4">4 - Satisfied</SelectItem>
                  <SelectItem value="3">3 - Neutral</SelectItem>
                  <SelectItem value="2">2 - Unsatisfied</SelectItem>
                  <SelectItem value="1">1 - Very unsatisfied</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={closureFeedback}
              onChange={(event) => setClosureFeedback(event.target.value)}
              rows={3}
              placeholder="Optional feedback"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseTargetId(null)}>Cancel</Button>
            <Button onClick={() => void handleCloseTicket()} disabled={!closeConfirmed || (!!closeTargetId && savingCommentId === closeTargetId)}>
              {!!closeTargetId && savingCommentId === closeTargetId ? 'Closing...' : 'Close request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
