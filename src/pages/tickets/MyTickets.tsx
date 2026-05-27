import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
import { Badge } from '@/components/ui/badge';
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
import { TicketActivityList } from '@/components/tickets/TicketActivityList';
import { TicketAttachmentList } from '@/components/tickets/TicketAttachmentList';
import { TicketApprovalSummary } from '@/components/tickets/TicketApprovalSummary';
import { TicketSlaSummary } from '@/components/tickets/TicketSlaSummary';
import { Textarea } from '@/components/ui/textarea';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import { getRequestCategoryLabel } from '@/lib/requestCategories';

import {
  formatDueDate,
  formatTicketLabel,
  statusColorMap,
  priorityColorMap,
  customFieldEntries,
  isOpenStatus,
} from '@/lib/requestFormatters';
import {
  addTicketComment,
  cancelMyTicket,
  listMyTickets,
  listTicketActivity,
  type TicketActivityRecord,
} from '@/services/ticketService';
import { listAttachmentsForTickets, type TicketAttachmentRecord } from '@/services/ticketAttachmentService';

type MyStatusFilter = 'all' | 'active' | 'resolved' | 'cancelled';

export default function MyTickets() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { categories } = useRequestCategories(user?.company_id, true);
  useRequestSubcategories(user?.company_id, { includeInactive: true });
  const { fields: formFields } = useRequestFormFields(user?.company_id, { includeInactive: true });
  const [error, setError] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [cancellingTicketId, setCancellingTicketId] = useState<string | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
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

  // Initialise comment drafts when new tickets arrive; preserve in-progress drafts.
  useEffect(() => {
    setCommentDrafts((prev) => {
      const next = { ...prev };
      for (const t of tickets) {
        if (!(t.id in next)) next[t.id] = '';
      }
      return next;
    });
  }, [tickets]);

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

    setCommentDrafts((current) => ({ ...current, [ticketId]: '' }));
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

  const isExpanded = (ticketId: string) => expandedTicketId === ticketId;
  const toggleExpand = (ticketId: string) => {
    setExpandedTicketId((current) => (current === ticketId ? null : ticketId));
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full flex-col gap-2">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2.5 shadow-sm">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-foreground">My Requests</h1>
          <p className="text-[11px] text-muted-foreground">Track your submitted requests and follow up</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void refreshTickets()} disabled={loading}>
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
            <Link to="/portal/tickets/new">
              <Plus className="h-3.5 w-3.5" />
              New Request
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Summary stats ───────────────────────────────────── */}
      {!loading && !error && tickets.length > 0 && (
        <div className="flex flex-wrap items-stretch gap-2">
          {[
            { label: 'Total', value: counts.all, color: 'text-foreground' },
            { label: 'Active', value: counts.active, color: counts.active > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground' },
            { label: 'Resolved', value: counts.resolved, color: counts.resolved > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground' },
            { label: 'Cancelled', value: counts.cancelled, color: 'text-muted-foreground' },
          ].map((stat) => (
            <div key={stat.label} className="kpi-card flex min-w-[100px] flex-1 items-center gap-2.5 !p-2.5">
              <p className={`text-lg font-semibold tabular-nums leading-none ${stat.color}`}>{stat.value}</p>
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────── */}
      {!loading && !error && tickets.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-2.5 shadow-sm sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by subject, category, VSO..."
              className="h-9 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MyStatusFilter)}>
            <SelectTrigger className="h-9 w-[160px]">
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

      {/* ── Content ─────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-3 rounded-lg border bg-card py-16 text-muted-foreground shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading your requests...</span>
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border bg-card py-16 text-center shadow-sm">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Unable to load requests</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={() => void refreshTickets()} variant="outline" className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border bg-card py-16 text-center shadow-sm">
          <Ticket className="h-8 w-8 text-muted-foreground" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">No requests yet</p>
            <p className="text-sm text-muted-foreground">
              Submit a new internal request from the New Request page.
            </p>
          </div>
          <Button asChild size="sm" className="gap-2">
            <Link to="/portal/tickets/new">
              <Plus className="h-4 w-4" />
              New Request
            </Link>
          </Button>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border bg-card py-12 text-center shadow-sm">
          <Search className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No requests match your search or filter.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-lg border bg-card shadow-sm">
          {/* Table header */}
          <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 border-b bg-muted/50 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur sm:grid-cols-[1fr_120px_90px_100px_100px]">
            <span>Request</span>
            <span className="hidden sm:block">Category</span>
            <span className="hidden sm:block">Priority</span>
            <span className="hidden sm:block">Status</span>
            <span className="text-right">Date</span>
          </div>

          {/* Rows */}
          {filteredTickets.map((ticket) => {
            const expanded = isExpanded(ticket.id);
            const extraFields = customFieldEntries(ticket, customFieldLabelMap);
            const canCancel = ticket.status === 'open' && !ticket.assigned_to;

            return (
              <div key={ticket.id} className="border-b border-border last:border-b-0">
                {/* Compact row */}
                <button
                  type="button"
                  onClick={() => toggleExpand(ticket.id)}
                  className={`w-full grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2.5 text-left transition-colors sm:grid-cols-[1fr_120px_90px_100px_100px] ${
                    expanded ? 'bg-primary/[0.03]' : 'hover:bg-muted/40'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {expanded
                      ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    }
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{ticket.subject}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {ticket.assigned_to_name ? `Owner: ${ticket.assigned_to_name}` : 'Awaiting assignment'}
                        {ticket.vso_number ? ` · VSO ${ticket.vso_number}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="hidden truncate text-xs text-muted-foreground capitalize sm:block">
                    {getRequestCategoryLabel(ticket.category, categories)}
                  </span>
                  <span className="hidden sm:block">
                    <Badge variant="outline" className={`border text-[10px] capitalize ${priorityColorMap[ticket.priority]}`}>
                      {ticket.priority}
                    </Badge>
                  </span>
                  <span className="hidden sm:block">
                    <Badge variant="outline" className={`border text-[10px] capitalize ${statusColorMap[ticket.status]}`}>
                      {formatTicketLabel(ticket.status)}
                    </Badge>
                  </span>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                    </p>
                    {/* Mobile badges */}
                    <div className="mt-0.5 flex justify-end gap-1 sm:hidden">
                      <Badge variant="outline" className={`border text-[9px] capitalize ${statusColorMap[ticket.status]}`}>
                        {formatTicketLabel(ticket.status)}
                      </Badge>
                      <Badge variant="outline" className={`border text-[9px] capitalize ${priorityColorMap[ticket.priority]}`}>
                        {ticket.priority}
                      </Badge>
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {expanded && (
                  <div className="border-t border-border bg-muted/10 px-4 py-3 sm:pl-10">
                    <div className="space-y-3">
                      {/* Badges row */}
                      <div className="flex flex-wrap gap-1.5">
                        <TicketApprovalSummary ticket={ticket} compact />
                        <TicketSlaSummary ticket={ticket} compact />
                        {ticket.requested_due_date && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <CalendarDays className="h-3 w-3" />
                            Due {formatDueDate(ticket.requested_due_date)}
                          </Badge>
                        )}
                        {canCancel && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1 text-[10px] text-destructive hover:text-destructive"
                                disabled={cancellingTicketId === ticket.id}
                              >
                                {cancellingTicketId === ticket.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                                Cancel
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
                                  onClick={() => void handleCancelTicket(ticket.id)}
                                >
                                  Cancel request
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>

                      {/* Description */}
                      <div className="rounded-md border bg-background px-3 py-2">
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Description</p>
                        <p className="whitespace-pre-line text-sm leading-5 text-foreground">{ticket.description}</p>
                      </div>

                      <TicketSlaSummary ticket={ticket} />
                      <TicketApprovalSummary ticket={ticket} />

                      {/* Desired outcome / Business impact */}
                      {(ticket.desired_outcome || ticket.business_impact) && (
                        <div className="grid gap-2 md:grid-cols-2">
                          {ticket.desired_outcome && (
                            <div className="rounded-md border border-border bg-background px-3 py-2">
                              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                <CheckCircle2 className="h-3 w-3" />
                                Desired outcome
                              </p>
                              <p className="mt-1 text-sm leading-5 text-foreground">{ticket.desired_outcome}</p>
                            </div>
                          )}
                          {ticket.business_impact && (
                            <div className="rounded-md border border-border bg-background px-3 py-2">
                              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Business impact</p>
                              <p className="mt-1 text-sm leading-5 text-foreground">{ticket.business_impact}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Custom fields */}
                      {extraFields.length > 0 && (
                        <div className="rounded-md border border-border bg-background px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Additional details</p>
                          <div className="mt-1.5 grid gap-2 md:grid-cols-2">
                            {extraFields.map((field) => (
                              <div key={field.key} className="min-w-0">
                                <p className="text-[11px] text-muted-foreground">{field.label}</p>
                                <p className="truncate text-sm text-foreground">{field.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Resolution note */}
                      {ticket.resolution_note && (
                        <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Resolution note</p>
                          <p className="mt-1 text-sm leading-5 text-foreground">{ticket.resolution_note}</p>
                        </div>
                      )}

                      <TicketAttachmentList attachments={attachmentsByTicket[ticket.id] ?? []} />

                      {/* Discussion */}
                      {ticket.status !== 'closed' && ticket.status !== 'cancelled' && (
                        <div className="space-y-2 rounded-md border border-border bg-background px-3 py-2.5">
                          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            <MessageSquare className="h-3 w-3" />
                            Discussion
                          </p>
                          <Textarea
                            value={commentDrafts[ticket.id] ?? ''}
                            onChange={(event) => setCommentDrafts((current) => ({
                              ...current,
                              [ticket.id]: event.target.value,
                            }))}
                            placeholder="Add a clarification or follow-up note."
                            rows={3}
                            disabled={savingCommentId === ticket.id}
                          />
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                              onClick={() => void handleAddComment(ticket.id)}
                              disabled={savingCommentId === ticket.id || !commentDrafts[ticket.id]?.trim()}
                            >
                              {savingCommentId === ticket.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                              Add comment
                            </Button>
                          </div>
                        </div>
                      )}

                      <TicketActivityList activities={activitiesByTicket[ticket.id] ?? []} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}