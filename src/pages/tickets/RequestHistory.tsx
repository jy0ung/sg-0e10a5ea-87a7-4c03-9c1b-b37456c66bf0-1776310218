import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { STALE } from '@/lib/queryClient';
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
import { PageHeader } from '@/components/shared/PageHeader';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import {
  listCompanyTicketsPage,
  type TicketStatusFilter,
} from '@/services/ticketService';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { formatTicketLabel, priorityColorMap, statusColorMap } from '@/lib/requestFormatters';
import { openTicketWorkspace } from '@/lib/ticketWorkspaceNavigation';
import { formatDistanceToNow } from 'date-fns';

type HistoryStatusFilter = 'closed';

const HISTORY_PAGE_SIZE = 25;

const historyStatusOptions: Array<{ value: HistoryStatusFilter; label: string }> = [
  { value: 'closed', label: 'Closed' },
];

export default function RequestHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { categories } = useRequestCategories(user?.company_id, true);

  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('closed');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm]);

  const historyKey = ['request-history', user?.company_id, page, statusFilter, searchTerm] as const;

  const { data: historyData, isLoading: loading, error: queryError } = useQuery({
    queryKey: historyKey,
    queryFn: async () => {
      const statusParam: TicketStatusFilter = 'closed';
      const { data, error: fetchError } = await listCompanyTicketsPage(user!.company_id, { page, pageSize: HISTORY_PAGE_SIZE, status: statusParam, search: searchTerm });
      if (fetchError) throw new Error(fetchError.message || 'Unable to load request history.');
      const nextTickets = data?.rows ?? [];
      return {
        tickets: nextTickets,
        totalCount: data?.totalCount ?? 0,
      };
    },
    enabled: !!user,
    staleTime: STALE.transactional,
  });

  const error = queryError ? (queryError as Error).message : null;
  const tickets = useMemo(() => historyData?.tickets ?? [], [historyData]);
  const totalCount = historyData?.totalCount ?? 0;

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

  function handleSelectTicket(ticketId: string) {
    openTicketWorkspace(navigate, ticketId, {
      source: 'history',
      path: `${location.pathname}${location.search}`,
      page,
      filters: { statusFilter, searchTerm },
    });
  }

  const totalPages = Math.ceil(totalCount / HISTORY_PAGE_SIZE);

  return (
    <div className="flex h-full flex-col gap-4 p-4 lg:p-6">
      {/* Header + filters */}
      <div className="flex flex-col gap-3">
        <div className="[&>div]:mb-0">
          <PageHeader
            title="Completed Requests"
            description="Browse requester-confirmed closed requests."
            breadcrumbs={[{ label: 'Internal Requests', path: '/portal' }, { label: 'Completed Requests' }]}
            actions={
              <>
                <span className="text-sm text-muted-foreground">
                  {loading ? '…' : `${totalCount.toLocaleString()} record${totalCount !== 1 ? 's' : ''}`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void loadTickets()}
                  disabled={loading}
                >
                  <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </>
            }
          />
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
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading completed requests...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => void loadTickets()}>Retry</Button>
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Archive className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No completed requests found.</p>
            </div>
          ) : (
            <>
              {tickets.map((ticket) => {
                const categoryLabel = getRequestCategoryLabel(ticket.category, categories);
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => handleSelectTicket(ticket.id)}
                    className="w-full rounded-lg border bg-card p-3.5 text-left shadow-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      </div>
    </div>
  );
}
