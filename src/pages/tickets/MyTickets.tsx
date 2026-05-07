import React, { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CalendarDays, CheckCircle2, Loader2, RefreshCcw, Ticket } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TicketActivityList } from '@/components/tickets/TicketActivityList';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { getRequestSubcategoryLabel } from '@/lib/requestSubcategories';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const customFieldLabelMap = useMemo(
    () => Object.fromEntries(formFields.map((field) => [`${field.category_key}:${field.key}`, field.label])),
    [formFields],
  );

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
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">My Requests</h1>
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
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const extraFields = customFieldEntries(ticket, customFieldLabelMap);

            return (
            <Card key={ticket.id}>
              <CardHeader className="gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">
                    {ticket.subject}
                  </CardTitle>
                  <CardDescription>
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
                </div>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-4">
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

                <p className="whitespace-pre-line text-sm leading-5 text-foreground">{ticket.description}</p>

                {(ticket.desired_outcome || ticket.business_impact) && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {ticket.desired_outcome && (
                      <div className="rounded-lg border border-border px-3 py-2">
                        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Desired outcome
                        </p>
                        <p className="mt-1 text-sm leading-5 text-foreground">{ticket.desired_outcome}</p>
                      </div>
                    )}
                    {ticket.business_impact && (
                      <div className="rounded-lg border border-border px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Business impact
                        </p>
                        <p className="mt-1 text-sm leading-5 text-foreground">{ticket.business_impact}</p>
                      </div>
                    )}
                  </div>
                )}

                {extraFields.length > 0 && (
                  <div className="rounded-lg border border-border px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Resolution note
                    </p>
                    <p className="mt-1 text-sm leading-5 text-foreground">{ticket.resolution_note}</p>
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