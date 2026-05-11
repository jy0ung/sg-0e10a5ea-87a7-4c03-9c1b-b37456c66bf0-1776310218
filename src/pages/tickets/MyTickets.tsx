import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CalendarDays, CheckCircle2, Loader2, MessageSquare, Plus, RefreshCcw, Send, Ticket, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { getRequestSubcategoryLabel } from '@/lib/requestSubcategories';
import {
  addTicketComment,
  cancelMyTicket,
  listMyTickets,
  listTicketActivity,
  type RequestTicketRecord,
  type TicketActivityRecord,
} from '@/services/ticketService';
import { listAttachmentsForTickets, type TicketAttachmentRecord } from '@/services/ticketAttachmentService';

const statusVariant: Record<RequestTicketRecord['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'default',
  in_progress: 'secondary',
  awaiting_requester: 'outline',
  resolved: 'outline',
  closed: 'outline',
  cancelled: 'outline',
};

const priorityVariant: Record<RequestTicketRecord['priority'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'destructive',
};

function formatTicketLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function formatDueDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function customFieldEntries(
  ticket: RequestTicketRecord,
  labelMap: Record<string, string>,
) {
  return Object.entries(ticket.custom_fields ?? {})
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .map(([key, value]) => ({
      key,
      label: labelMap[`${ticket.category}:${key}`] ?? formatTicketLabel(key),
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }));
}

export default function MyTickets() {
  const { user } = useAuth();
  const { categories } = useRequestCategories(user?.company_id, true);
  const { subcategories } = useRequestSubcategories(user?.company_id, { includeInactive: true });
  const { fields: formFields } = useRequestFormFields(user?.company_id, { includeInactive: true });
  const [tickets, setTickets] = useState<RequestTicketRecord[]>([]);
  const [activitiesByTicket, setActivitiesByTicket] = useState<Record<string, TicketActivityRecord[]>>({});
  const [attachmentsByTicket, setAttachmentsByTicket] = useState<Record<string, TicketAttachmentRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [cancellingTicketId, setCancellingTicketId] = useState<string | null>(null);

  const customFieldLabelMap = useMemo(
    () => Object.fromEntries(formFields.map((field) => [`${field.category_key}:${field.key}`, field.label])),
    [formFields],
  );

  const refreshTicketActivity = async (ticketId: string) => {
    if (!user) return;
    const { data } = await listTicketActivity([ticketId], user.company_id);
    if (data) {
      setActivitiesByTicket((current) => ({ ...current, ...data }));
    }
  };

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
    await refreshTicketActivity(ticketId);
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

    setTickets((current) => current.map((ticket) => (
      ticket.id === ticketId
        ? {
          ...ticket,
          status: data.status,
          resolved_at: data.resolved_at,
          resolution_note: data.resolution_note,
          updated_at: data.updated_at,
        }
        : ticket
    )));
    await refreshTicketActivity(ticketId);
  };

  useEffect(() => {
    let cancelled = false;

    const loadTickets = async () => {
      if (!user) {
        if (!cancelled) {
          setTickets([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await listMyTickets(user.id, user.company_id);
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message || 'Unable to load requests.');
      } else {
        const nextTickets = data ?? [];
        setTickets(nextTickets);
        setCommentDrafts(Object.fromEntries(nextTickets.map((ticket) => [ticket.id, ''])));

        const ticketIds = nextTickets.map((ticket) => ticket.id);
        const [{ data: activityData }, { data: attachmentData }] = await Promise.all([
          listTicketActivity(ticketIds, user.company_id),
          listAttachmentsForTickets(ticketIds, user.company_id),
        ]);
        if (cancelled) return;
        setActivitiesByTicket(activityData ?? {});
        setAttachmentsByTicket(attachmentData ?? {});
      }
      setLoading(false);
    };

    void loadTickets();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="w-full space-y-4">
      <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Internal Requests</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">My Requests</h1>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
              Review submitted requests, add follow-up notes, and track requester-visible outcomes.
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link to="/portal/tickets/new">
              <Plus className="h-3.5 w-3.5" />
              New Request
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading your requests...</span>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Unable to load requests</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Ticket className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">No requests yet</p>
              <p className="text-sm text-muted-foreground">
                Submit a new internal request from the New Request page.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {tickets.map((ticket) => {
            const extraFields = customFieldEntries(ticket, customFieldLabelMap);
            const canCancel = ticket.status === 'open' && !ticket.assigned_to;

            return (
            <Card key={ticket.id} className="overflow-hidden shadow-sm">
              <CardHeader className="gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="truncate text-base">
                    {ticket.subject}
                  </CardTitle>
                  <CardDescription className="truncate">
                    {user?.name} · {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                    {ticket.vso_number && <> · VSO {ticket.vso_number}</>}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusVariant[ticket.status]}>
                    {formatTicketLabel(ticket.status)}
                  </Badge>
                  <Badge variant={priorityVariant[ticket.priority]}>
                    {ticket.priority} priority
                  </Badge>
                  <TicketApprovalSummary ticket={ticket} compact />
                  <TicketSlaSummary ticket={ticket} compact />
                  {canCancel && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 text-destructive hover:text-destructive"
                          disabled={cancellingTicketId === ticket.id}
                        >
                          {cancellingTicketId === ticket.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
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
              </CardHeader>
              <CardContent className="space-y-3 px-4 py-4">
                <p className="text-sm text-muted-foreground capitalize">
                  Category: {getRequestCategoryLabel(ticket.category, categories)}
                  {ticket.subcategory ? ` / ${getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories)}` : ''}
                </p>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>
                    {ticket.assigned_to_name ? `Assigned to ${ticket.assigned_to_name}` : 'Awaiting assignment'}
                  </span>
                  {ticket.requested_due_date && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Needed by {formatDueDate(ticket.requested_due_date)}
                    </span>
                  )}
                  {ticket.assigned_at && (
                    <span>Assigned {formatDistanceToNow(new Date(ticket.assigned_at), { addSuffix: true })}</span>
                  )}
                  {ticket.resolved_at && (
                    <span>Resolved {formatDistanceToNow(new Date(ticket.resolved_at), { addSuffix: true })}</span>
                  )}
                </div>

                <div className="rounded-lg border bg-background px-3 py-2.5">
                  <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Request detail</p>
                  <p className="whitespace-pre-line text-sm leading-5 text-foreground">{ticket.description}</p>
                </div>

                <TicketSlaSummary ticket={ticket} />

                <TicketApprovalSummary ticket={ticket} />

                {(ticket.desired_outcome || ticket.business_impact) && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {ticket.desired_outcome && (
                      <div className="rounded-lg border border-border bg-background px-3 py-2">
                        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Desired outcome
                        </p>
                        <p className="mt-1 text-sm leading-5 text-foreground">{ticket.desired_outcome}</p>
                      </div>
                    )}
                    {ticket.business_impact && (
                      <div className="rounded-lg border border-border bg-background px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          Business impact
                        </p>
                        <p className="mt-1 text-sm leading-5 text-foreground">{ticket.business_impact}</p>
                      </div>
                    )}
                  </div>
                )}

                {extraFields.length > 0 && (
                  <div className="rounded-lg border border-border bg-background px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Additional details
                    </p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {extraFields.map((field) => (
                        <div key={field.key} className="min-w-0">
                          <p className="text-xs text-muted-foreground">{field.label}</p>
                          <p className="truncate text-sm text-foreground">{field.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ticket.resolution_note && (
                  <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Resolution note
                    </p>
                    <p className="mt-1 text-sm leading-5 text-foreground">{ticket.resolution_note}</p>
                  </div>
                )}

                <TicketAttachmentList attachments={attachmentsByTicket[ticket.id] ?? []} />

                {ticket.status !== 'closed' && ticket.status !== 'cancelled' && (
                  <div className="space-y-2 rounded-lg border border-border bg-background px-3 py-3">
                    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Discussion
                    </p>
                    <Textarea
                      value={commentDrafts[ticket.id] ?? ''}
                      onChange={(event) => setCommentDrafts((current) => ({
                        ...current,
                        [ticket.id]: event.target.value,
                      }))}
                      placeholder="Add a clarification or follow-up note for the request owner."
                      rows={3}
                      disabled={savingCommentId === ticket.id}
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        onClick={() => void handleAddComment(ticket.id)}
                        disabled={savingCommentId === ticket.id || !commentDrafts[ticket.id]?.trim()}
                      >
                        {savingCommentId === ticket.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Add comment
                      </Button>
                    </div>
                  </div>
                )}

                <TicketActivityList activities={activitiesByTicket[ticket.id] ?? []} />
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}