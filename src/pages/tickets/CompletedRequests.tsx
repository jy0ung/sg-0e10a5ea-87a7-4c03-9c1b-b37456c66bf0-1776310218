import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Archive, MessageSquare, RefreshCcw, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { STALE } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/PageHeader';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/tickets/RequestBadge';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { openTicketWorkspace } from '@/lib/ticketWorkspaceNavigation';
import {
  listMyTickets,
  listTicketChatSummaries,
  type RequestTicketRecord,
  type TicketChatSummary,
} from '@/services/ticketService';

export default function CompletedRequests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { categories } = useRequestCategories(user?.company_id, true);
  const [searchTerm, setSearchTerm] = useState('');
  const [chatSummariesByTicket, setChatSummariesByTicket] = useState<Record<string, TicketChatSummary>>({});
  const completedKey = ['completed-requests', user?.id, user?.company_id] as const;

  const { data, isLoading, error } = useQuery({
    queryKey: completedKey,
    queryFn: async () => {
      const { data: ticketRows, error: fetchError } = await listMyTickets(user!.id, user!.company_id);
      if (fetchError) throw fetchError;
      const closedTickets = (ticketRows ?? []).filter((ticket) => ticket.status === 'closed');
      const ticketIds = closedTickets.map((ticket) => ticket.id);
      const { data: chatSummaryData } = await listTicketChatSummaries(ticketIds, user!.id, user!.company_id);
      setChatSummariesByTicket(chatSummaryData ?? {});
      return {
        tickets: closedTickets,
      };
    },
    enabled: !!user,
    staleTime: STALE.transactional,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: completedKey });
  useTicketsRealtime({ companyId: user?.company_id, scope: 'completed-requests', onChange: refresh });

  const tickets = useMemo(() => data?.tickets ?? [], [data?.tickets]);

  const filteredTickets = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return tickets;
    return tickets.filter((ticket) => [
      ticket.subject,
      ticket.description,
      getRequestCategoryLabel(ticket.category, categories),
      ticket.assigned_to_name,
    ].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [categories, searchTerm, tickets]);

  const handleOpenChat = useCallback((ticketId: string) => {
    openTicketWorkspace(navigate, ticketId, {
      source: 'completed',
      path: `${location.pathname}${location.search}`,
      filters: { searchTerm },
    }, 'chat');
  }, [location.pathname, location.search, navigate, searchTerm]);

  const columns = useMemo<StandardTableColumn<RequestTicketRecord>[]>(() => [
    {
      key: 'subject',
      label: 'Request',
      className: 'min-w-[240px] max-w-[420px]',
      render: (ticket) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{ticket.subject}</p>
          <p className="truncate text-xs text-muted-foreground">{getRequestCategoryLabel(ticket.category, categories)}</p>
        </div>
      ),
    },
    { key: 'category', label: 'Category', render: (ticket) => <span className="text-sm">{getRequestCategoryLabel(ticket.category, categories)}</span> },
    { key: 'priority', label: 'Priority', render: (ticket) => <RequestPriorityBadge priority={ticket.priority} /> },
    { key: 'status', label: 'Status', render: (ticket) => <RequestStatusBadge status={ticket.status} /> },
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
      key: 'created_at',
      label: 'Submitted',
      className: 'text-right',
      render: (ticket) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}</span>,
    },
    {
      key: 'updated_at',
      label: 'Last Updated',
      className: 'text-right',
      render: (ticket) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}</span>,
    },
    { key: 'assigned_to_name', label: 'Owner / PIC', render: (ticket) => <span className="text-sm">{ticket.assigned_to_name ?? ticket.responsible_queue}</span> },
  ], [categories, chatSummariesByTicket, handleOpenChat]);

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader
        title="Completed Requests"
        description="Closed requests confirmed by the requester."
        breadcrumbs={[{ label: 'Internal Requests', path: '/portal' }, { label: 'Completed Requests' }]}
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh} disabled={isLoading}>
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {!isLoading && !error && tickets.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-2.5 shadow-sm sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search completed requests..." className="h-9 pl-9" />
          </div>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : error ? (
        <HrmsEmptyState icon={AlertCircle} title="Unable to load completed requests" description={(error as Error).message} action={{ label: 'Retry', onClick: refresh }} />
      ) : tickets.length === 0 ? (
        <HrmsEmptyState icon={Archive} title="No completed requests" description="Closed requests will appear here after requester confirmation." />
      ) : (
        <StandardTable
          data={filteredTickets}
          columns={columns}
          rowKey="id"
          hideSearch
          mobileLayout="table"
          emptyMessage="No completed requests match your search."
          onRowClick={(ticket) => openTicketWorkspace(navigate, ticket.id, {
            source: 'completed',
            path: `${location.pathname}${location.search}`,
            filters: { searchTerm },
          })}
        />
      )}

    </div>
  );
}
