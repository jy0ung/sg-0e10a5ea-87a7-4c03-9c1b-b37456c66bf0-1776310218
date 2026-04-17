import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Loader2, RefreshCcw, Ticket } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type TicketRecord = {
  id: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  description: string;
  created_at: string;
};

const statusVariant: Record<TicketRecord['status'], 'default' | 'secondary' | 'outline'> = {
  open: 'default',
  in_progress: 'secondary',
  resolved: 'outline',
  closed: 'outline',
};

const priorityVariant: Record<TicketRecord['priority'], 'default' | 'secondary' | 'destructive'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'destructive',
};

export default function MyTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
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

      try {
        // The generated database types have not been refreshed for the tickets table yet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: fetchError } = await (supabase as any)
          .from('tickets')
          .select('id, subject, category, priority, status, description, created_at')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;

        if (!cancelled) {
          setTickets((data ?? []) as TicketRecord[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load tickets.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadTickets();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Tickets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review the support requests you have already submitted.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading your tickets...</span>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Unable to load tickets</p>
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
              <p className="font-medium text-foreground">No tickets yet</p>
              <p className="text-sm text-muted-foreground">
                Submit a new support request from the Raise a Ticket page.
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
                    {ticket.status.replace('_', ' ')}
                  </Badge>
                  <Badge variant={priorityVariant[ticket.priority]}>
                    {ticket.priority} priority
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground capitalize">
                  Category: {ticket.category.replace('_', ' ')}
                </p>
                <p className="text-sm text-foreground leading-6">{ticket.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}