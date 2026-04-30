import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Loader2, RefreshCcw, Ticket } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TicketActivityList } from '@/components/tickets/TicketActivityList';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import {
  listMyTickets,
  listTicketActivity,
  type RequestTicketRecord,
  type TicketActivityRecord,
} from '@/services/ticketService';

const statusVariant: Record<RequestTicketRecord['status'], 'default' | 'secondary' | 'outline'> = {
  open: 'default',
  in_progress: 'secondary',
  resolved: 'outline',
  closed: 'outline',
};

const priorityVariant: Record<RequestTicketRecord['priority'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'destructive',
};

function formatTicketLabel(value: string) {
  return value.replace(/_/g, ' ');
}

export default function MyTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<RequestTicketRecord[]>([]);
  const [activitiesByTicket, setActivitiesByTicket] = useState<Record<string, TicketActivityRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const { data: activityData } = await listTicketActivity(
          nextTickets.map((ticket) => ticket.id),
          user.company_id,
        );
        if (cancelled) return;
        setActivitiesByTicket(activityData ?? {});
      }
      setLoading(false);
    };

    void loadTickets();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review the internal requests you have already submitted.
        </p>
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
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <Card key={ticket.id}>
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{ticket.subject}</CardTitle>
                  <CardDescription>
                    {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusVariant[ticket.status]}>
                    {formatTicketLabel(ticket.status)}
                  </Badge>
                  <Badge variant={priorityVariant[ticket.priority]}>
                    {ticket.priority} priority
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground capitalize">
                  Category: {getRequestCategoryLabel(ticket.category)}
                </p>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>
                    {ticket.assigned_to_name ? `Assigned to ${ticket.assigned_to_name}` : 'Awaiting assignment'}
                  </span>
                  {ticket.assigned_at && (
                    <span>Assigned {formatDistanceToNow(new Date(ticket.assigned_at), { addSuffix: true })}</span>
                  )}
                  {ticket.resolved_at && (
                    <span>Resolved {formatDistanceToNow(new Date(ticket.resolved_at), { addSuffix: true })}</span>
                  )}
                </div>

                <p className="text-sm text-foreground leading-6">{ticket.description}</p>

                {ticket.resolution_note && (
                  <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Resolution note
                    </p>
                    <p className="mt-2 text-sm text-foreground leading-6">{ticket.resolution_note}</p>
                  </div>
                )}

                <TicketActivityList activities={activitiesByTicket[ticket.id] ?? []} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}