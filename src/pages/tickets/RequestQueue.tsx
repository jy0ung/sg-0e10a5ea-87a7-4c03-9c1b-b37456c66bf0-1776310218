import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Inbox,
  Loader2,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TicketActivityList } from '@/components/tickets/TicketActivityList';
import { Textarea } from '@/components/ui/textarea';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
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
  type TicketPriority,
  type TicketStatus,
  updateTicket,
} from '@/services/ticketService';
import { listProfiles, type ProfileRow } from '@/services/profileService';
import { ADMIN_ONLY } from '@/config/routeRoles';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { getRequestSubcategoryLabel } from '@/lib/requestSubcategories';

type StatusFilter = 'all' | TicketStatus;
type PriorityFilter = 'all' | TicketPriority;

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

const priorityOptions: Array<{ value: TicketPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const priorityVariant: Record<TicketPriority, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'destructive',
};

const requestOwnerRoles = new Set(ADMIN_ONLY);

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

function isOpenStatus(status: TicketStatus) {
  return status === 'open' || status === 'in_progress';
}

function isOverdue(ticket: CompanyTicketRecord) {
  if (!ticket.requested_due_date || !isOpenStatus(ticket.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${ticket.requested_due_date}T00:00:00`) < today;
}

export default function RequestQueue() {
  const { user } = useAuth();
  const { categories } = useRequestCategories(user?.company_id, true);
  const { subcategories } = useRequestSubcategories(user?.company_id, { includeInactive: true });
  const [tickets, setTickets] = useState<CompanyTicketRecord[]>([]);
  const [activitiesByTicket, setActivitiesByTicket] = useState<Record<string, TicketActivityRecord[]>>({});
  const [assignees, setAssignees] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
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
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        ticket.subject,
        ticket.description,
        ticket.desired_outcome,
        ticket.business_impact,
        ticket.vso_number,
        ticket.submitted_by_name,
        ticket.submitted_by_email,
        ticket.assigned_to_name,
        getRequestCategoryLabel(ticket.category, categories),
        ticket.subcategory ? getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories) : '',
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [categories, priorityFilter, searchTerm, statusFilter, subcategories, tickets]);

  const selectedTicket = useMemo(() => {
    return filteredTickets.find((ticket) => ticket.id === selectedTicketId) ?? filteredTickets[0] ?? null;
  }, [filteredTickets, selectedTicketId]);

  useEffect(() => {
    if (!selectedTicket) {
      setSelectedTicketId(null);
      return;
    }
    if (selectedTicket.id !== selectedTicketId) {
      setSelectedTicketId(selectedTicket.id);
    }
  }, [selectedTicket, selectedTicketId]);

  const counts = useMemo(() => {
    return tickets.reduce<Record<StatusFilter, number>>(
      (summary, ticket) => {
        summary[ticket.status] += 1;
        return summary;
      },
      { all: tickets.length, open: 0, in_progress: 0, resolved: 0, closed: 0 },
    );
  }, [tickets]);

  const queueMetrics = useMemo(() => ({
    unassigned: tickets.filter((ticket) => isOpenStatus(ticket.status) && !ticket.assigned_to).length,
    overdue: tickets.filter(isOverdue).length,
    highPriority: tickets.filter((ticket) => isOpenStatus(ticket.status) && ticket.priority === 'high').length,
    active: tickets.filter((ticket) => isOpenStatus(ticket.status)).length,
  }), [tickets]);

  const refreshTicketActivity = useCallback(async (ticketId: string) => {
    if (!user) return;
    const { data: updatedActivity } = await listTicketActivity([ticketId], user.company_id);
    if (updatedActivity) {
      setActivitiesByTicket((current) => ({ ...current, ...updatedActivity }));
    }
  }, [user]);

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
    void refreshTicketActivity(ticketId);
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
    void refreshTicketActivity(ticketId);
  };

  const handlePriorityChange = async (ticketId: string, priority: TicketPriority) => {
    if (!user) return;

    setSavingTicketId(ticketId);
    setError(null);

    const { data, error: updateError } = await updateTicket(
      ticketId,
      { priority },
      { userId: user.id, companyId: user.company_id },
    );

    if (updateError || !data) {
      setError(updateError?.message || 'Unable to update request priority.');
      setSavingTicketId(null);
      return;
    }

    setTickets((current) => current.map((ticket) => {
      if (ticket.id !== ticketId) return ticket;
      return {
        ...ticket,
        priority: data.priority,
        updated_at: data.updated_at,
      };
    }));
    setSavingTicketId(null);
    void refreshTicketActivity(ticketId);
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
    void refreshTicketActivity(ticketId);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Internal Requests</p>
          <h1 className="text-2xl font-bold text-foreground">Request Workbench</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Triage demand, assign accountable owners, and close the loop with requester-visible outcomes.
          </p>
        </div>

        <Button variant="outline" onClick={() => void loadTickets()} className="gap-2" disabled={loading}>
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Active work</CardDescription>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{queueMetrics.active}</p>
            <p className="text-xs text-muted-foreground">Open and in progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Unassigned</CardDescription>
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{queueMetrics.unassigned}</p>
            <p className="text-xs text-muted-foreground">Needs an owner</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>Overdue</CardDescription>
            <Clock3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{queueMetrics.overdue}</p>
            <p className="text-xs text-muted-foreground">Past requested date</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription>High priority</CardDescription>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{queueMetrics.highPriority}</p>
            <p className="text-xs text-muted-foreground">Active escalations</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search title, requester, owner, impact, VSO, category..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <SelectTrigger className="lg:w-[190px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses ({counts.all})</SelectItem>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label} ({counts[option.value]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as PriorityFilter)}>
          <SelectTrigger className="lg:w-[170px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {priorityOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              <p className="font-medium text-foreground">No requests match this view</p>
              <p className="text-sm text-muted-foreground">Adjust the filters or refresh when new requests arrive.</p>
            </div>
          </CardContent>
        </Card>
      ) : selectedTicket ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.3fr)]">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Queue</h2>
                <p className="text-xs text-muted-foreground">{filteredTickets.length} requests in view</p>
              </div>
              <Badge variant="outline">{counts.open} open</Badge>
            </div>

            <div className="max-h-[720px] overflow-y-auto">
              {filteredTickets.map((ticket) => {
                const selected = ticket.id === selectedTicket.id;
                const categoryLabel = getRequestCategoryLabel(ticket.category, categories);
                const subcategoryLabel = ticket.subcategory
                  ? getRequestSubcategoryLabel(ticket.subcategory, ticket.category, subcategories)
                  : null;

                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`w-full border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 ${
                      selected ? 'bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-medium text-foreground">{ticket.subject}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {ticket.submitted_by_name ?? 'Unknown requester'} · {categoryLabel}{subcategoryLabel ? ` / ${subcategoryLabel}` : ''}
                        </p>
                      </div>
                      <Badge variant={statusVariant[ticket.status]} className="shrink-0 capitalize">
                        {formatTicketLabel(ticket.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={priorityVariant[ticket.priority]} className="capitalize">
                        {ticket.priority}
                      </Badge>
                      <span>{ticket.assigned_to_name ?? 'Unassigned'}</span>
                      {ticket.requested_due_date && (
                        <span className={isOverdue(ticket) ? 'font-medium text-destructive' : ''}>
                          Needed {formatDueDate(ticket.requested_due_date)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={statusVariant[selectedTicket.status]} className="capitalize">
                      {formatTicketLabel(selectedTicket.status)}
                    </Badge>
                    <Badge variant={priorityVariant[selectedTicket.priority]} className="capitalize">
                      {selectedTicket.priority} priority
                    </Badge>
                    {isOverdue(selectedTicket) && <Badge variant="destructive">Overdue</Badge>}
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">{selectedTicket.subject}</h2>
                  <p className="text-sm text-muted-foreground">
                    Submitted {formatDistanceToNow(new Date(selectedTicket.created_at), { addSuffix: true })}
                    {selectedTicket.vso_number ? ` · VSO ${selectedTicket.vso_number}` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                  <Select
                    value={selectedTicket.status}
                    onValueChange={(value) => void handleStatusChange(selectedTicket.id, value as TicketStatus)}
                    disabled={savingTicketId === selectedTicket.id}
                  >
                    <SelectTrigger><SelectValue placeholder="Set status" /></SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Priority</p>
                  <Select
                    value={selectedTicket.priority}
                    onValueChange={(value) => void handlePriorityChange(selectedTicket.id, value as TicketPriority)}
                    disabled={savingTicketId === selectedTicket.id}
                  >
                    <SelectTrigger><SelectValue placeholder="Set priority" /></SelectTrigger>
                    <SelectContent>
                      {priorityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Owner</p>
                  <Select
                    value={selectedTicket.assigned_to ?? 'unassigned'}
                    onValueChange={(value) => void handleAssignmentChange(selectedTicket.id, value)}
                    disabled={savingTicketId === selectedTicket.id}
                  >
                    <SelectTrigger><SelectValue placeholder="Assign owner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {assignees.map((assignee) => (
                        <SelectItem key={assignee.id} value={assignee.id}>{assignee.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border px-4 py-3">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <UserRound className="h-3.5 w-3.5" />
                    Requester
                  </p>
                  <p className="mt-2 text-sm font-medium text-foreground">{selectedTicket.submitted_by_name ?? 'Unknown requester'}</p>
                  {selectedTicket.submitted_by_email && <p className="mt-1 truncate text-xs text-muted-foreground">{selectedTicket.submitted_by_email}</p>}
                </div>
                <div className="rounded-lg border border-border px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{getRequestCategoryLabel(selectedTicket.category, categories)}</p>
                  {selectedTicket.subcategory && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {getRequestSubcategoryLabel(selectedTicket.subcategory, selectedTicket.category, subcategories)}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border px-4 py-3">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Timing
                  </p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {selectedTicket.requested_due_date ? formatDueDate(selectedTicket.requested_due_date) : 'No target date'}
                  </p>
                  {selectedTicket.resolved_at && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Resolved {formatDistanceToNow(new Date(selectedTicket.resolved_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Request detail</p>
                <p className="whitespace-pre-line text-sm leading-6 text-foreground">{selectedTicket.description}</p>
              </div>

              {(selectedTicket.desired_outcome || selectedTicket.business_impact) && (
                <div className="grid gap-3 md:grid-cols-2">
                  {selectedTicket.desired_outcome && (
                    <div className="rounded-lg border border-border px-4 py-3">
                      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Desired outcome
                      </p>
                      <p className="mt-2 text-sm leading-6 text-foreground">{selectedTicket.desired_outcome}</p>
                    </div>
                  )}
                  {selectedTicket.business_impact && (
                    <div className="rounded-lg border border-border px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Business impact</p>
                      <p className="mt-2 text-sm leading-6 text-foreground">{selectedTicket.business_impact}</p>
                    </div>
                  )}
                </div>
              )}

              {(selectedTicket.status === 'resolved' || selectedTicket.status === 'closed' || selectedTicket.resolution_note) && (
                <div className="space-y-2 rounded-lg border border-border bg-secondary/20 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resolution note</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleResolutionNoteSave(selectedTicket.id)}
                      disabled={savingTicketId === selectedTicket.id || (noteDrafts[selectedTicket.id] ?? '') === (selectedTicket.resolution_note ?? '')}
                    >
                      Save note
                    </Button>
                  </div>
                  <Textarea
                    value={noteDrafts[selectedTicket.id] ?? ''}
                    onChange={(event) => setNoteDrafts((current) => ({
                      ...current,
                      [selectedTicket.id]: event.target.value,
                    }))}
                    placeholder="Explain the outcome or next step visible to the requester."
                    rows={3}
                    disabled={savingTicketId === selectedTicket.id}
                  />
                  <p className="text-xs text-muted-foreground">Shown to the requester when their request is resolved or closed.</p>
                </div>
              )}

              <TicketActivityList activities={activitiesByTicket[selectedTicket.id] ?? []} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
