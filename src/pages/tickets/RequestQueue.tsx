import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Loader2, RefreshCcw, ShieldCheck, UserRound } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketActivityList } from '@/components/tickets/TicketActivityList';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listCompanyTickets,
  listTicketActivity,
  type CompanyTicketRecord,
  type TicketActivityRecord,
  type TicketStatus,
  updateTicket,
} from '@/services/ticketService';
import { listProfiles, type ProfileRow } from '@/services/profileService';
import { ADMIN_ONLY } from '@/config/routeRoles';
import { getRequestCategoryLabel } from '@/lib/requestCategories';

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

const requestOwnerRoles = new Set(ADMIN_ONLY);

function formatTicketLabel(value: string) {
  return value.replace(/_/g, ' ');
}

export default function RequestQueue() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<CompanyTicketRecord[]>([]);
  const [activitiesByTicket, setActivitiesByTicket] = useState<Record<string, TicketActivityRecord[]>>({});
  const [assignees, setAssignees] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const loadTickets = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    const [{ data, error: fetchError }, profileResult] = await Promise.all([
      listCompanyTickets(user.company_id),
      listProfiles(user.company_id),
    ]);

    if (fetchError) {
      setError(fetchError.message || 'Unable to load the request queue.');
    } else if (profileResult.error) {
      setError(profileResult.error || 'Unable to load request owners.');
    } else {
      const nextTickets = data ?? [];
      setTickets(nextTickets);
      setAssignees(
        profileResult.data
          .filter((profile) => profile.status === 'active' && requestOwnerRoles.has(profile.role))
          .sort((left, right) => left.name.localeCompare(right.name)),
      );
      setNoteDrafts(
        Object.fromEntries(nextTickets.map((ticket) => [ticket.id, ticket.resolution_note ?? ''])),
      );

      const { data: activityData } = await listTicketActivity(
        nextTickets.map((ticket) => ticket.id),
        user.company_id,
      );
      setActivitiesByTicket(activityData ?? {});
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
        assigned_to: data.assigned_to,
        assigned_at: data.assigned_at,
        resolved_at: data.resolved_at,
        resolution_note: data.resolution_note,
        updated_at: data.updated_at,
      };
    }));
    setSavingTicketId(null);
  };

  const handleAssignmentChange = async (ticketId: string, value: string) => {
    if (!user) return;

    const assignedTo = value === 'unassigned' ? null : value;
    const assignee = assignees.find((profile) => profile.id === assignedTo) ?? null;

    setSavingTicketId(ticketId);
    setError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { assigned_to: assignedTo },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setError(updateError?.message || 'Unable to update request owner.');
      setSavingTicketId(null);
      return;
    }

    setTickets((current) => current.map((ticket) => {
      if (ticket.id !== ticketId) return ticket;
      return {
        ...ticket,
        assigned_to: data.assigned_to,
        assigned_at: data.assigned_at,
        resolved_at: data.resolved_at,
        resolution_note: data.resolution_note,
        updated_at: data.updated_at,
        assigned_to_name: assignee?.name ?? null,
        assigned_to_email: assignee?.email ?? null,
      };
    }));
    setSavingTicketId(null);
  };

  const handleResolutionNoteSave = async (ticketId: string) => {
    if (!user) return;

    setSavingTicketId(ticketId);
    setError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { resolution_note: noteDrafts[ticketId] ?? '' },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setError(updateError?.message || 'Unable to save the resolution note.');
      setSavingTicketId(null);
      return;
    }

    setTickets((current) => current.map((ticket) => {
      if (ticket.id !== ticketId) return ticket;
      return {
        ...ticket,
        resolution_note: data.resolution_note,
        resolved_at: data.resolved_at,
        updated_at: data.updated_at,
      };
    }));
    setNoteDrafts((current) => ({ ...current, [ticketId]: data.resolution_note ?? '' }));
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
                    <Badge variant="outline">{getRequestCategoryLabel(ticket.category)}</Badge>
                    <Badge variant="secondary">{ticket.priority} priority</Badge>
                  </div>
                </div>

                <div className="grid w-full gap-3 lg:max-w-[460px] lg:grid-cols-2">
                  <div className="space-y-2">
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

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Request owner
                    </p>
                    <Select
                      value={ticket.assigned_to ?? 'unassigned'}
                      onValueChange={(value) => void handleAssignmentChange(ticket.id, value)}
                      disabled={savingTicketId === ticket.id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Assign owner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {assignees.map((assignee) => (
                          <SelectItem key={assignee.id} value={assignee.id}>
                            {assignee.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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

                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Owner
                  </span>
                  <span className="font-medium text-foreground">{ticket.assigned_to_name ?? 'Unassigned'}</span>
                  {ticket.assigned_to_email && <span>{ticket.assigned_to_email}</span>}
                  {ticket.assigned_at && (
                    <span>Assigned {formatDistanceToNow(new Date(ticket.assigned_at), { addSuffix: true })}</span>
                  )}
                  {ticket.resolved_at && (
                    <span>Resolved {formatDistanceToNow(new Date(ticket.resolved_at), { addSuffix: true })}</span>
                  )}
                </div>

                <p className="text-sm text-foreground leading-6">{ticket.description}</p>

                {(ticket.status === 'resolved' || ticket.status === 'closed' || ticket.resolution_note) && (
                  <div className="space-y-2 rounded-lg border border-border bg-secondary/20 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Resolution note
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleResolutionNoteSave(ticket.id)}
                        disabled={savingTicketId === ticket.id || (noteDrafts[ticket.id] ?? '') === (ticket.resolution_note ?? '')}
                      >
                        Save note
                      </Button>
                    </div>
                    <Textarea
                      value={noteDrafts[ticket.id] ?? ''}
                      onChange={(event) => setNoteDrafts((current) => ({
                        ...current,
                        [ticket.id]: event.target.value,
                      }))}
                      placeholder="Explain the outcome or next step visible to the requester."
                      rows={3}
                      disabled={savingTicketId === ticket.id}
                    />
                    <p className="text-xs text-muted-foreground">
                      This note is shown back to the requester when their request is resolved or closed.
                    </p>
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