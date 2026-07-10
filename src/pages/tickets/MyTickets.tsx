import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  MessageSquare,
  Plus,
  RefreshCcw,
  Search,
  Ticket,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/PageHeader';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { openTicketWorkspace } from '@/lib/ticketWorkspaceNavigation';
import { getTicketSlaSummary, formatSlaCompactLabel } from '@/lib/ticketSla';
import { cn } from '@/lib/utils';

import {
  listTicketChatSummaries,
  listMyTickets,
  type RequestTicketRecord,
  type TicketChatSummary,
} from '@/services/ticketService';

const PIZZA_STEPS = ['Submitted', 'Assigned', 'In Progress', 'Waiting on You', 'Resolved', 'Closed'];
const HUB_RETURN_FILTERS = { searchTerm: '', statusFilter: 'open' };

function getTicketStepIndex(ticket: RequestTicketRecord) {
  if (ticket.status === 'closed' || ticket.status === 'cancelled') return 5;
  if (ticket.status === 'completed_by_owner') return 4;
  if (ticket.status === 'pending_requester') return 3;
  if (ticket.status === 'in_progress' || ticket.status === 'pending_owner_review' || ticket.status === 'reopened') return 2;
  if (ticket.assigned_to) return 1;
  return 0; // open and unassigned
}

export default function MyTickets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { categories } = useRequestCategories(user?.company_id, true);
  const [chatSummariesByTicket, setChatSummariesByTicket] = useState<Record<string, TicketChatSummary>>({});
  const [catalogSearchTerm, setCatalogSearchTerm] = useState('');

  const myTicketsKey = ['my-tickets', user?.id, user?.company_id] as const;

  const { data: ticketsData, isLoading: loading, error: queryError } = useQuery({
    queryKey: myTicketsKey,
    queryFn: async () => {
      const { data, error: fetchError } = await listMyTickets(user!.id, user!.company_id);
      if (fetchError) throw new Error(fetchError.message || 'Unable to load requests.');
      const nextTickets = data ?? [];
      const ticketIds = nextTickets.map((t) => t.id);
      const { data: chatSummaryData } = await listTicketChatSummaries(ticketIds, user!.id, user!.company_id);
      setChatSummariesByTicket(chatSummaryData ?? {});
      return {
        tickets: nextTickets,
      };
    },
    enabled: !!user,
    staleTime: STALE.transactional,
  });

  const tickets = useMemo(() => ticketsData?.tickets ?? [], [ticketsData]);
  const displayError = queryError instanceof Error
    ? queryError.message
    : queryError
      ? 'Unable to load requests.'
      : null;

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

  const handleOpenTicket = useCallback((ticketId: string) => {
    openTicketWorkspace(navigate, ticketId, {
      source: 'pending',
      path: `${location.pathname}${location.search}`,
      filters: HUB_RETURN_FILTERS,
    });
  }, [location.pathname, location.search, navigate]);

  const handleOpenChat = useCallback((ticketId: string) => {
    openTicketWorkspace(navigate, ticketId, {
      source: 'pending',
      path: `${location.pathname}${location.search}`,
      filters: HUB_RETURN_FILTERS,
    }, 'activity');
  }, [location.pathname, location.search, navigate]);

  const handleCardKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>, ticketId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleOpenTicket(ticketId);
  }, [handleOpenTicket]);

  const activeTickets = useMemo(() => tickets.filter(t => t.status !== 'closed' && t.status !== 'cancelled'), [tickets]);

  return (
    <div className="flex h-full w-full flex-col gap-8 pb-10">
      <PageHeader
        title="Pending Requests"
        description="Track your active requests and request new services."
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
                Start new request
              </Link>
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="flex animate-pulse items-center justify-center p-10"><RefreshCcw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : displayError ? (
        <HrmsEmptyState
          icon={AlertCircle}
          title="Unable to load requests"
          description={displayError}
          action={{ label: 'Retry', onClick: () => void refreshTickets() }}
        />
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Active Requests Overview</h2>
            {activeTickets.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center bg-muted/20">
                <p className="text-muted-foreground">No requests yet.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {activeTickets.map(ticket => {
                  const stepIndex = getTicketStepIndex(ticket);
                  const isWaitingOnYou = ticket.status === 'pending_requester';
                  const summary = chatSummariesByTicket[ticket.id];
                  const sla = getTicketSlaSummary(ticket);

                  return (
                    <div
                      key={ticket.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md cursor-pointer",
                        isWaitingOnYou && "border-amber-300 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/20"
                      )}
                      onClick={() => handleOpenTicket(ticket.id)}
                      onKeyDown={(event) => handleCardKeyDown(event, ticket.id)}
                    >
                      <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                        <div>
                          <h3 className="font-semibold text-lg text-foreground">{ticket.subject}</h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
                            <span>{getRequestCategoryLabel(ticket.category, categories)}</span>
                            <span>•</span>
                            <span>{ticket.vso_number ? `VSO ${ticket.vso_number}` : formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatSlaCompactLabel(sla) || 'No SLA'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {isWaitingOnYou && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                              Waiting on You
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="relative"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenChat(ticket.id);
                            }}
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Discussion
                            {(summary?.unread_count ?? 0) > 0 && (
                              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                                {summary!.unread_count}
                              </span>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Pizza Tracker Stepper */}
                      <div className="relative pt-2">
                        <div className="absolute left-0 top-4 h-[2px] w-full bg-muted" />
                        <div
                          className="absolute left-0 top-4 h-[2px] bg-primary transition-all duration-500"
                          style={{ width: `${(stepIndex / (PIZZA_STEPS.length - 1)) * 100}%` }}
                        />

                        <div className="relative flex justify-between">
                          {PIZZA_STEPS.map((baseStep, i) => {
                            const step = (ticket.status === 'reopened' && i === 2) ? 'Reopened' : baseStep;
                            const completed = i <= stepIndex;
                            const current = i === stepIndex;
                            return (
                              <div key={baseStep} className="flex flex-col items-center gap-2">
                                <div className={cn(
                                  "flex h-4 w-4 items-center justify-center rounded-full border-2 bg-background z-10 transition-colors",
                                  completed ? "border-primary bg-primary text-primary-foreground" : "border-muted text-transparent",
                                  current && isWaitingOnYou ? "border-amber-500 bg-amber-500 text-white" : "",
                                  current && ticket.status === 'reopened' ? "border-amber-500 bg-amber-500 text-white" : ""
                                )}>
                                  {completed && <CheckCircle2 className="h-3 w-3" />}
                                </div>
                                <span className={cn(
                                  "text-[10px] md:text-xs font-medium text-center max-w-[60px] md:max-w-none leading-tight",
                                  current ? (isWaitingOnYou || ticket.status === 'reopened' ? "text-amber-700 dark:text-amber-400" : "text-foreground") : "text-muted-foreground"
                                )}>
                                  {step}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4 pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-lg font-semibold tracking-tight">Service Catalog</h2>
              {categories.length > 8 && (
                <div className="relative max-w-sm">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search services..."
                    value={catalogSearchTerm}
                    onChange={(e) => setCatalogSearchTerm(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {categories
                .filter(c => !catalogSearchTerm || c.label.toLowerCase().includes(catalogSearchTerm.toLowerCase()) || (c.description || '').toLowerCase().includes(catalogSearchTerm.toLowerCase()))
                .map(service => (
                <Link
                  key={service.id}
                  to={`/portal/tickets/new?category=${service.id}`}
                  className="flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Ticket className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{service.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground flex-1">{service.description || 'Submit a new request in this category.'}</p>
                  <div className="mt-4 flex items-center justify-between border-t pt-4">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Clock className="h-3 w-3" /> SLA: {service.resolution_sla_hours ? `${service.resolution_sla_hours} hours` : 'Not configured'}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
              {categories.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed p-8 text-center bg-muted/20">
                  <p className="text-muted-foreground">No service categories available.</p>
                </div>
              )}
              {categories.length > 0 && categories.filter(c => !catalogSearchTerm || c.label.toLowerCase().includes(catalogSearchTerm.toLowerCase()) || (c.description || '').toLowerCase().includes(catalogSearchTerm.toLowerCase())).length === 0 && (
                <div className="col-span-full py-8 text-center">
                  <p className="text-muted-foreground text-sm">No services match your search.</p>
                </div>
              )}
            </div>
          </section>

        </>
      )}
    </div>
  );
}
