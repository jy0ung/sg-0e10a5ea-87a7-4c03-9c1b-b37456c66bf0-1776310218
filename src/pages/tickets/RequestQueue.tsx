import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Loader2, RefreshCcw, ShieldCheck, UserRound } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listCompanyTickets,
  type CompanyTicketRecord,
  type TicketStatus,
  updateTicket,
} from '@/services/ticketService';

type StatusFilter = 'all' | TicketStatus;

const statusVariant: Record<TicketStatus, 'default' | 'secondary' | 'outline'> = {
  open: 'default',
  in_progress: 'secondary',
  resolved: 'outline',
  closed: 'outline',
};

const statusOptions: Array<{ value: TicketStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

function formatTicketLabel(value: string) {
  return value.replace(/_/g, ' ');
}

export default function RequestQueue() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<CompanyTicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await listCompanyTickets(user.company_id);
    if (fetchError) {
      setError(fetchError.message || 'Unable to load the request queue.');
    } else {
      setTickets(data ?? []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const filteredTickets = useMemo(() => {
    if (statusFilter === 'all') return tickets;
    return tickets.filter((ticket) => ticket.status === statusFilter);
  }, [statusFilter, tickets]);

  const counts = useMemo(() => {
    return tickets.reduce<Record<StatusFilter, number>>(
      (summary, ticket) => {
        summary[ticket.status] += 1;
        return summary;
      },
      { all: tickets.length, open: 0, in_progress: 0, resolved: 0, closed: 0 },
    );
  }, [tickets]);

  const handleStatusChange = async (ticketId: string, status: TicketStatus) => {
    if (!user) return;

    setSavingTicketId(ticketId);
    setError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { status },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setError(updateError?.message || 'Unable to update request status.');
      setSavingTicketId(null);
      return;
    }

    setTickets((current) => current.map((ticket) => {
      if (ticket.id !== ticketId) return ticket;
      return {
        ...ticket,
        status: data.status,
        priority: data.priority,
        updated_at: data.updated_at,
      };
    }));
    setSavingTicketId(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Request Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review every internal request in your company and move work through the queue.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All requests ({counts.all})</SelectItem>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} ({counts[option.value]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => void loadTickets()} className="gap-2" disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            Refresh queue
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open</CardDescription>
            <CardTitle>{counts.open}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In Progress</CardDescription>
            <CardTitle>{counts.in_progress}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Resolved</CardDescription>
            <CardTitle>{counts.resolved}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Closed</CardDescription>
            <CardTitle>{counts.closed}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading the request queue...</span>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Unable to load the request queue</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={() => void loadTickets()} variant="outline" className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : filteredTickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">No requests in this view</p>
              <p className="text-sm text-muted-foreground">
                Change the filter or refresh the queue when new requests arrive.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredTickets.map((ticket) => (
            <Card key={ticket.id}>
              <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{ticket.subject}</CardTitle>
                    <CardDescription>
                      Submitted {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant={statusVariant[ticket.status]}>{formatTicketLabel(ticket.status)}</Badge>
                    <Badge variant="outline">{formatTicketLabel(ticket.category)}</Badge>
                    <Badge variant="secondary">{ticket.priority} priority</Badge>
                  </div>
                </div>

                <div className="w-full max-w-[220px] space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Queue status
                  </p>
                  <Select
                    value={ticket.status}
                    onValueChange={(value) => void handleStatusChange(ticket.id, value as TicketStatus)}
                    disabled={savingTicketId === ticket.id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Set status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 text-foreground">
                    <UserRound className="h-4 w-4 text-primary" />
                    <span className="font-medium">{ticket.submitted_by_name ?? 'Unknown requestor'}</span>
                  </div>
                  {ticket.submitted_by_email && <span>{ticket.submitted_by_email}</span>}
                </div>

                <p className="text-sm text-foreground leading-6">{ticket.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}