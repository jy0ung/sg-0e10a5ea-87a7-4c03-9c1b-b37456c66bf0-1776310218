import { Search, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TicketPriority, TicketResponsibleParty, TicketStatus, TicketStatusFilter } from '@/services/ticketService';
import type { TicketSlaState } from '@/lib/ticketSla';

type StatusFilter = TicketStatusFilter;
type PriorityFilter = 'all' | TicketPriority;
type SlaFilter = 'all' | Exclude<TicketSlaState, 'met' | 'pending'>;
type AssigneeFilter = 'all' | 'unassigned' | string;

interface AssigneeOption {
  id: string;
  name: string;
}

interface KeyLabelOption {
  key: string;
  label: string;
  category_key?: string;
}

interface RequestQueueFiltersProps {
  searchTerm: string;
  statusFilter: StatusFilter;
  priorityFilter: PriorityFilter;
  slaFilter: SlaFilter;
  assignedToFilter: AssigneeFilter;
  categoryFilter?: string;
  subcategoryFilter?: string;
  responsiblePartyFilter?: TicketResponsibleParty | 'all';
  submittedFrom?: string;
  submittedTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  unreadOnly?: boolean;
  reopenedOnly?: boolean;
  advancedOpen?: boolean;
  assignees: AssigneeOption[];
  categories?: KeyLabelOption[];
  subcategories?: KeyLabelOption[];
  counts: Record<TicketStatus | 'all', number>;
  statusOptions: Array<{ value: TicketStatus; label: string }>;
  priorityOptions: Array<{ value: TicketPriority; label: string }>;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  onPriorityChange: (value: PriorityFilter) => void;
  onSlaChange: (value: SlaFilter) => void;
  onAssignedToChange: (value: AssigneeFilter) => void;
  onCategoryChange?: (value: string) => void;
  onSubcategoryChange?: (value: string) => void;
  onResponsiblePartyChange?: (value: TicketResponsibleParty | 'all') => void;
  onSubmittedFromChange?: (value: string) => void;
  onSubmittedToChange?: (value: string) => void;
  onUpdatedFromChange?: (value: string) => void;
  onUpdatedToChange?: (value: string) => void;
  onUnreadOnlyChange?: (value: boolean) => void;
  onReopenedOnlyChange?: (value: boolean) => void;
  onAdvancedOpenChange?: (value: boolean) => void;
}

export function RequestQueueFilters({
  searchTerm,
  statusFilter,
  priorityFilter,
  slaFilter,
  assignedToFilter,
  categoryFilter = 'all',
  subcategoryFilter = 'all',
  responsiblePartyFilter = 'all',
  submittedFrom = '',
  submittedTo = '',
  updatedFrom = '',
  updatedTo = '',
  unreadOnly = false,
  reopenedOnly = false,
  advancedOpen = false,
  assignees,
  categories = [],
  subcategories = [],
  counts,
  statusOptions,
  priorityOptions,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onSlaChange,
  onAssignedToChange,
  onCategoryChange,
  onSubcategoryChange,
  onResponsiblePartyChange,
  onSubmittedFromChange,
  onSubmittedToChange,
  onUpdatedFromChange,
  onUpdatedToChange,
  onUnreadOnlyChange,
  onReopenedOnlyChange,
  onAdvancedOpenChange,
}: RequestQueueFiltersProps) {
  const filteredSubcategories = categoryFilter === 'all'
    ? subcategories
    : subcategories.filter((subcategory) => subcategory.category_key === categoryFilter);

  return (
    <div className="space-y-2 rounded-lg border bg-card p-2.5 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search ID, title, requester, category, VSO..."
            className="h-9 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(value) => onStatusChange(value as StatusFilter)}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">
                Pending / active ({(counts.open ?? 0) + (counts.in_progress ?? 0) + (counts.pending_requester ?? 0) + (counts.pending_owner_review ?? 0) + (counts.completed_by_owner ?? 0) + (counts.reopened ?? 0)})
              </SelectItem>
              <SelectItem value="archived">Completed / archived</SelectItem>
              <SelectItem value="all">All statuses ({counts.all})</SelectItem>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} ({counts[option.value]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(value) => onPriorityChange(value as PriorityFilter)}>
            <SelectTrigger className="h-9 w-[150px]">
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
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="SLA" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All SLA states</SelectItem>
              <SelectItem value="breached">Breached</SelectItem>
              <SelectItem value="at_risk">Due soon</SelectItem>
              <SelectItem value="not_configured">No SLA</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assignedToFilter} onValueChange={(value) => onAssignedToChange(value as AssigneeFilter)}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {assignees.map((assignee) => (
                <SelectItem key={assignee.id} value={assignee.id}>{assignee.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => onAdvancedOpenChange?.(!advancedOpen)}>
            <SlidersHorizontal className="h-4 w-4" />
            Advanced
          </Button>
        </div>
      </div>

      {advancedOpen && (
        <div className="grid gap-2 border-t border-border pt-2 md:grid-cols-2 xl:grid-cols-4">
          <Select value={categoryFilter} onValueChange={(value) => onCategoryChange?.(value)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.key} value={category.key}>{category.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={subcategoryFilter} onValueChange={(value) => onSubcategoryChange?.(value)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Subcategory" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subcategories</SelectItem>
              {filteredSubcategories.map((subcategory) => (
                <SelectItem key={subcategory.key} value={subcategory.key}>{subcategory.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={responsiblePartyFilter} onValueChange={(value) => onResponsiblePartyChange?.(value as TicketResponsibleParty | 'all')}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Responsible party" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any responsible party</SelectItem>
              {['Owner', 'Requester', 'Backup Owner', 'Manager', 'Escalation Owner', 'Admin', 'None'].map((party) => (
                <SelectItem key={party} value={party}>{party}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={unreadOnly ? 'default' : 'outline'} size="sm" className="h-9" onClick={() => onUnreadOnlyChange?.(!unreadOnly)}>
              Unread chat
            </Button>
            <Button type="button" variant={reopenedOnly ? 'default' : 'outline'} size="sm" className="h-9" onClick={() => onReopenedOnlyChange?.(!reopenedOnly)}>
              Reopened
            </Button>
          </div>
          <Input type="date" value={submittedFrom} onChange={(event) => onSubmittedFromChange?.(event.target.value)} aria-label="Submitted from" className="h-9" />
          <Input type="date" value={submittedTo} onChange={(event) => onSubmittedToChange?.(event.target.value)} aria-label="Submitted to" className="h-9" />
          <Input type="date" value={updatedFrom} onChange={(event) => onUpdatedFromChange?.(event.target.value)} aria-label="Updated from" className="h-9" />
          <Input type="date" value={updatedTo} onChange={(event) => onUpdatedToChange?.(event.target.value)} aria-label="Updated to" className="h-9" />
        </div>
      )}
    </div>
  );
}

export type { AssigneeFilter, PriorityFilter, SlaFilter, StatusFilter };
