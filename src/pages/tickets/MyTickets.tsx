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
  Send,
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
  isOpenStatus,
} from '@/lib/requestFormatters';
import {
  addTicketComment,
  cancelMyTicket,
  listMyTickets,
  listTicketActivity,
  type RequestTicketRecord,
  type TicketActivityRecord,
} from '@/services/ticketService';
import { listAttachmentsForTickets, type TicketAttachmentRecord } from '@flc/platform-services';

type MyStatusFilter = 'all' | 'active' | 'resolved' | 'cancelled';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<MyStatusFilter>('all');

  const customFieldLabelMap = useMemo(
    () => Object.fromEntries(formFields.map((field) => [`${field.category_key}:${field.key}`, field.label])),
    [formFields],
  );

  const myTicketsKey = ['my-tickets', user?.id, user?.company_id] as const;

  const { data: ticketsData, isLoading: loading } = useQuery({
    queryKey: myTicketsKey,
    queryFn: async () => {
      const { data, error: fetchError } = await listMyTickets(user!.id, user!.company_id);
      if (fetchError) throw new Error(fetchError.message || 'Unable to load requests.');
      const nextTickets = data ?? [];
      const ticketIds = nextTickets.map((t) => t.id);
      const [{ data: activityData }, { data: attachmentData }] = await Promise.all([
        listTicketActivity(ticketIds, user!.company_id),
        listAttachmentsForTickets(ticketIds, user!.company_id),
      ]);
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
    const { error: commentError } = await addTicketComment(
      ticketId,
      { message },
      { userId: user.id, companyId: user.company_id },
    );
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
    const c = { all: tickets.length, active: 0, resolved: 0, cancelled: 0 };
    for (const t of tickets) {
      if (isOpenStatus(t.status)) c.active++;
      else if (t.status === 'resolved' || t.status === 'closed') c.resolved++;
      else if (t.status === 'cancelled') c.cancelled++;
    }
    return c;
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return tickets.filter((ticket) => {
      // Status filter
      if (statusFilter === 'active' && !isOpenStatus(ticket.status)) return false;
      if (statusFilter === 'resolved' && ticket.status !== 'resolved' && ticket.status !== 'closed') return false;
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
      key: 'created_at',
      label: 'Submitted',
      className: 'text-right',
      render: (ticket) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
        </span>
      ),
    },
  ], [categories]);

  const metrics: Array<{ key: MyStatusFilter; label: string; value: number; icon: React.ElementType; tone: 'slate' | 'blue' | 'emerald'; hint?: string }> = [
    { key: 'all', label: 'Total', value: counts.all, icon: Ticket, tone: 'slate' },
    { key: 'active', label: 'Active', value: counts.active, icon: Inbox, tone: 'blue', hint: 'In progress or awaiting you' },
    { key: 'resolved', label: 'Resolved', value: counts.resolved, icon: CheckCircle2, tone: 'emerald' },
    { key: 'cancelled', label: 'Cancelled', value: counts.cancelled, icon: XCircle, tone: 'slate' },
  ];

  const selectedExtraFields = selectedTicket ? customFieldEntries(selectedTicket, customFieldLabelMap) : [];
  const selectedCanCancel = selectedTicket?.status === 'open' && !selectedTicket.assigned_to;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader
        title="My Requests"
        description="Track your submitted requests and follow up"
        breadcrumbs={[{ label: 'Internal Requests', path: '/portal' }, { label: 'My Requests' }]}
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
      {!loading && !error && tickets.length > 0 && (
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
      {!loading && !error && tickets.length > 0 && (
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
              <SelectItem value="active">Active ({counts.active})</SelectItem>
              <SelectItem value="resolved">Resolved ({counts.resolved})</SelectItem>
              <SelectItem value="cancelled">Cancelled ({counts.cancelled})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : error ? (
        <HrmsEmptyState
          icon={AlertCircle}
          title="Unable to load requests"
          description={error}
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
                    <Textarea
                      value={commentDrafts[selectedTicket.id] ?? ''}
                      onChange={(event) =>
                        setCommentDrafts((current) => ({ ...current, [selectedTicket.id]: event.target.value }))
                      }
                      placeholder="Add a clarification or follow-up note."
                      rows={3}
                      disabled={savingCommentId === selectedTicket.id}
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => void handleAddComment(selectedTicket.id)}
                        disabled={savingCommentId === selectedTicket.id || !commentDrafts[selectedTicket.id]?.trim()}
                      >
                        {savingCommentId === selectedTicket.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Add comment
                      </Button>
                    </div>
                  </div>
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
    </div>
  );
}