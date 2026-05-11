import { Search, SlidersHorizontal } from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TicketPriority, TicketStatus } from '@/services/ticketService';
import type { TicketSlaState } from '@/lib/ticketSla';

type StatusFilter = 'all' | TicketStatus;
type PriorityFilter = 'all' | TicketPriority;
type SlaFilter = 'all' | Exclude<TicketSlaState, 'met' | 'pending'>;

interface RequestQueueFiltersProps {
  searchTerm: string;
  statusFilter: StatusFilter;
  priorityFilter: PriorityFilter;
  slaFilter: SlaFilter;
  counts: Record<StatusFilter, number>;
  statusOptions: Array<{ value: TicketStatus; label: string }>;
  priorityOptions: Array<{ value: TicketPriority; label: string }>;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  onPriorityChange: (value: PriorityFilter) => void;
  onSlaChange: (value: SlaFilter) => void;
}

export function RequestQueueFilters({
  searchTerm,
  statusFilter,
  priorityFilter,
  slaFilter,
  counts,
  statusOptions,
  priorityOptions,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onSlaChange,
}: RequestQueueFiltersProps) {
  return (
    <div className="sticky top-0 z-10 rounded-lg border bg-card p-3 shadow-sm backdrop-blur">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-foreground">Queue filters</p>
            <p className="text-[11px] leading-tight text-muted-foreground">Search, segment, and prioritize the active queue</p>
          </div>
        </div>
        <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground tabular-nums">{counts.all} requests</span>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search title, requester, owner, impact, VSO, category..."
          className="pl-9"
        />
      </div>
      <Select value={statusFilter} onValueChange={(value) => onStatusChange(value as StatusFilter)}>
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
      <Select value={priorityFilter} onValueChange={(value) => onPriorityChange(value as PriorityFilter)}>
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
      <Select value={slaFilter} onValueChange={(value) => onSlaChange(value as SlaFilter)}>
        <SelectTrigger className="lg:w-[170px]">
          <SelectValue placeholder="SLA" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All SLA states</SelectItem>
          <SelectItem value="breached">Breached</SelectItem>
          <SelectItem value="at_risk">Due soon</SelectItem>
          <SelectItem value="not_configured">No SLA</SelectItem>
        </SelectContent>
      </Select>
      </div>
    </div>
  );
}

export type { PriorityFilter, SlaFilter, StatusFilter };