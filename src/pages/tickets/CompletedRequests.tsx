import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Archive, MessageSquare, RefreshCcw, RotateCcw, Search } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { STALE } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/PageHeader';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/tickets/RequestBadge';
import { TicketActivityList } from '@/components/tickets/TicketActivityList';
import { TicketAttachmentList } from '@/components/tickets/TicketAttachmentList';
import { TicketChatPanel } from '@/components/tickets/TicketChatPanel';
import { TicketSlaSummary } from '@/components/tickets/TicketSlaSummary';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useTicketsRealtime } from '@/hooks/useTicketsRealtime';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import {
  listMyTickets,
  listTicketChatSummaries,
  listTicketActivity,
  markTicketChatRead,
  reopenTicketByRequester,
  type RequestTicketRecord,
  type TicketActivityRecord,
  type TicketChatSummary,
} from '@/services/ticketService';
import { listAttachmentsForTickets, type TicketAttachmentRecord } from '@flc/platform-services';

export default function CompletedRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { categories } = useRequestCategories(user?.company_id, true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [chatTicketId, setChatTicketId] = useState<string | null>(null);
  const [chatSummariesByTicket, setChatSummariesByTicket] = useState<Record<string, TicketChatSummary>>({});
  const [reopenTargetId, setReopenTargetId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [savingReopen, setSavingReopen] = useState(false);
  const completedKey = ['completed-requests', user?.id, user?.company_id] as const;

  const { data, isLoading, error } = useQuery({
    queryKey: completedKey,
    queryFn: async () => {
      const { data: ticketRows, error: fetchError } = await listMyTickets(user!.id, user!.company_id);
      if (fetchError) throw fetchError;
      const closedTickets = (ticketRows ?? []).filter((ticket) => ticket.status === 'closed');
      const ticketIds = closedTickets.map((ticket) => ticket.id);
      const [{ data: activityData }, { data: attachmentData }, { data: chatSummaryData }] = await Promise.all([
        listTicketActivity(ticketIds, user!.company_id),
        listAttachmentsForTickets(ticketIds, user!.company_id),
        listTicketChatSummaries(ticketIds, user!.id, user!.company_id),
      ]);
      setChatSummariesByTicket(chatSummaryData ?? {});
      return {
        tickets: closedTickets,
        activitiesByTicket: activityData ?? {} as Record<string, TicketActivityRecord[]>,
        attachmentsByTicket: attachmentData ?? {} as Record<string, TicketAttachmentRecord[]>,
      };
    },
    enabled: !!user,
    staleTime: STALE.transactional,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: completedKey });
  useTicketsRealtime({ companyId: user?.company_id, scope: 'completed-requests', onChange: refresh });

  const tickets = useMemo(() => data?.tickets ?? [], [data?.tickets]);
  const activitiesByTicket = useMemo(() => data?.activitiesByTicket ?? {}, [data?.activitiesByTicket]);
  const attachmentsByTicket = useMemo(() => data?.attachmentsByTicket ?? {}, [data?.attachmentsByTicket]);

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

  const selectedTicket = filteredTickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const chatTicket = filteredTickets.find((ticket) => ticket.id === chatTicketId) ?? null;

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

  const handleReopen = async () => {
    if (!user || !reopenTargetId) return;
    setSavingReopen(true);
    const { error: reopenError } = await reopenTicketByRequester(
      reopenTargetId,
      { reason: reopenReason },
      { userId: user.id, companyId: user.company_id },
    );
    setSavingReopen(false);
    if (reopenError) return;
    setReopenTargetId(null);
    setReopenReason('');
    await queryClient.invalidateQueries({ queryKey: completedKey });
  };

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
          mobileLayout="cards"
          emptyMessage="No completed requests match your search."
          onRowClick={(ticket) => setSelectedTicketId(ticket.id)}
        />
      )}

      <Sheet open={!!selectedTicket} onOpenChange={(open) => { if (!open) setSelectedTicketId(null); }}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
          {selectedTicket && (
            <>
              <SheetHeader className="space-y-2 border-b border-border px-5 py-4 text-left">
                <div className="flex flex-wrap items-center gap-1.5">
                  <RequestStatusBadge status={selectedTicket.status} />
                  <RequestPriorityBadge priority={selectedTicket.priority} />
                </div>
                <SheetTitle className="text-base leading-6">{selectedTicket.subject}</SheetTitle>
                <SheetDescription>{getRequestCategoryLabel(selectedTicket.category, categories)}</SheetDescription>
              </SheetHeader>
              <div className="space-y-3 px-5 py-4">
                <div className="rounded-md border bg-background px-3 py-2">
                  <p className="eyebrow mb-1">Description</p>
                  <p className="whitespace-pre-line text-sm leading-5 text-foreground">{selectedTicket.description}</p>
                </div>
                <TicketSlaSummary ticket={selectedTicket} />
                {selectedTicket.resolution_note && (
                  <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
                    <p className="eyebrow">Resolution note</p>
                    <p className="mt-1 text-sm leading-5 text-foreground">{selectedTicket.resolution_note}</p>
                  </div>
                )}
                <TicketAttachmentList attachments={attachmentsByTicket[selectedTicket.id] ?? []} />
                <TicketChatPanel
                  activities={activitiesByTicket[selectedTicket.id] ?? []}
                  currentUserId={user?.id}
                  draft=""
                  saving={false}
                  onDraftChange={() => undefined}
                  onSend={() => undefined}
                  readOnly
                />
                <Button type="button" size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setReopenTargetId(selectedTicket.id)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reopen request
                </Button>
                <TicketActivityList activities={activitiesByTicket[selectedTicket.id] ?? []} />
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
                  draft=""
                  saving={false}
                  onDraftChange={() => undefined}
                  onSend={() => undefined}
                  readOnly
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!reopenTargetId} onOpenChange={(open) => {
        if (!open) {
          setReopenTargetId(null);
          setReopenReason('');
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reopen request</DialogTitle>
            <DialogDescription>Provide a reason. Reopened requests return to Pending / Active Requests.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={reopenReason}
            onChange={(event) => setReopenReason(event.target.value)}
            rows={3}
            placeholder="Reason for reopening"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReopenTargetId(null)}>Cancel</Button>
            <Button onClick={() => void handleReopen()} disabled={savingReopen || !reopenReason.trim()}>
              {savingReopen ? 'Reopening...' : 'Reopen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
