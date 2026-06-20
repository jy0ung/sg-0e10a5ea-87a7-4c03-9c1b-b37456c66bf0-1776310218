import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  CheckCircle2,
  Inbox,
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
import { PageHeader } from '@/components/shared/PageHeader';
import { MetricCard } from '@/components/shared/MetricCard';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/tickets/RequestBadge';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { openTicketWorkspace } from '@/lib/ticketWorkspaceNavigation';

import {
  listTicketChatSummaries,
  listMyTickets,
  type RequestTicketRecord,
  type TicketChatSummary,
} from '@/services/ticketService';

type MyStatusFilter = 'all' | 'in_progress' | 'attention' | 'cancelled';

export default function MyTickets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { categories } = useRequestCategories(user?.company_id, true);
  const [chatSummariesByTicket, setChatSummariesByTicket] = useState<Record<string, TicketChatSummary>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<MyStatusFilter>('all');

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

  const handleOpenChat = useCallback((ticketId: string) => {
    openTicketWorkspace(navigate, ticketId, {
      source: 'pending',
      path: `${location.pathname}${location.search}`,
      filters: { searchTerm, statusFilter },
    }, 'chat');
  }, [location.pathname, location.search, navigate, searchTerm, statusFilter]);


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
          mobileLayout="table"
          emptyMessage="No requests match your search or filter."
          onRowClick={(ticket) => openTicketWorkspace(navigate, ticket.id, {
            source: 'pending',
            path: `${location.pathname}${location.search}`,
            filters: { searchTerm, statusFilter },
          })}
        />
      )}

    </div>
  );
}
