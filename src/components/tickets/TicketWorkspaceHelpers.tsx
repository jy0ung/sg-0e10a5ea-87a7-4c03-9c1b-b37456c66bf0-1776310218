/* eslint-disable react-refresh/only-export-components */
import type { ElementType, ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TicketActivityList } from '@/components/tickets/TicketActivityList';
import type { TicketAuditEntryRecord, TicketStatus, TicketWorkspaceData } from '@/services/ticketService';

// ─── Shared layout primitives ────────────────────────────────────────────

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return String(value);
  }
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value ?? '—'}</p>
    </div>
  );
}

export function Section({ title, icon: Icon, children }: { title: string; icon?: ElementType; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-md border border-border bg-background px-3 py-2.5">
      <p className="eyebrow flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {title}
      </p>
      {children}
    </section>
  );
}

export function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border px-6 py-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

// ─── Workflow strip ──────────────────────────────────────────────────────

export function primaryActionLabel(ticket: CompanyTicketRecord, permissions: TicketWorkspaceData["permissions"]) {
  if (permissions.canManageWorkflow) {
    if (ticket.status === "open") return "Start Request";
    if (ticket.status === "in_progress" || ticket.status === "pending_owner_review" || ticket.status === "reopened") return "Mark as Completed";
    if (ticket.status === "pending_requester") return "Request More Info";
  }
  if (permissions.canCloseAsRequester) {
    if (ticket.status === "pending_requester") return "Submit Update";
    if (ticket.status === "completed_by_owner") return "Close Request";
    if (ticket.status === "closed") return "Reopen Request";
  }
  return null;
}

const workflowSteps: Array<{ status: TicketStatus; label: string }> = [
  { status: 'open', label: 'Open' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'pending_requester', label: 'Pending Requester' },
  { status: 'pending_owner_review', label: 'Owner Review' },
  { status: 'completed_by_owner', label: 'Completed by Owner' },
  { status: 'closed', label: 'Closed' },
];

export function WorkflowStrip({ status }: { status: TicketStatus }) {
  const activeIndex = workflowSteps.findIndex((step) => step.status === status);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {workflowSteps.map((step, index) => {
        const isActive = index === activeIndex;
        const isPast = index < activeIndex;
        return (
          <span key={step.status} className="flex items-center gap-1">
            {index > 0 && <span className="h-px w-6 bg-border" aria-hidden />}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                isActive ? 'bg-primary text-primary-foreground' : isPast ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}
            >
              <span className="text-[10px] opacity-70">{index + 1}</span>
              {step.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ─── Reusable message dialog ─────────────────────────────────────────────

export function MessageDialog({
  open,
  title,
  description,
  value,
  saving,
  onValueChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  value: string;
  saving: boolean;
  onValueChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea value={value} onChange={(event) => onValueChange(event.target.value)} rows={4} placeholder="Write a clear update" />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={saving || !value.trim()} onClick={onSubmit}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Audit trail ─────────────────────────────────────────────────────────

export function formatAuditChanges(changes: Record<string, unknown>) {
  const fieldLabels: Record<string, string> = {
    status: 'Status',
    assigned_to: 'Owner',
    assigned_to_name: 'Owner',
    priority: 'Priority',
    subject: 'Title',
    category: 'Category',
    subcategory: 'Subcategory',
    current_responsible_party: 'Responsible party',
    next_action: 'Next action',
    resolution_note: 'Resolution note',
    completion_category: 'Completion type',
    satisfaction_rating: 'Satisfaction rating',
    closure_confirmed: 'Closure confirmed',
    closed_at: 'Closed at',
    first_responded_at: 'First responded',
    resolved_at: 'Resolved at',
    sla_breach_reason: 'SLA breach reason',
    previous_owner_id: 'Previous owner',
  };

  return (
    <>
      {Object.entries(changes).map(([key, value]) => {
        if (value === null || value === undefined) return null;
        const label = fieldLabels[key] ?? key.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        const isBeforeAfter =
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          ('before' in (value as Record<string, unknown>) || 'after' in (value as Record<string, unknown>));

        if (isBeforeAfter) {
          const { before, after } = value as Record<string, unknown>;
          if (before === undefined && after === undefined) return null;
          const beforeStr = before === null || before === undefined ? '(empty)' : String(before);
          const afterStr = after === null || after === undefined ? '(empty)' : String(after);
          return (
            <p key={key} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{label}:</span>{' '}
              <span className="line-through opacity-60">{beforeStr}</span>{' '}
              <span aria-hidden>{'→'}</span>{' '}
              <span>{afterStr}</span>
            </p>
          );
        }

        return (
          <p key={key} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{label}:</span> {String(value)}
          </p>
        );
      })}
    </>
  );
}

export function AuditTrailPanel({
  entries,
  activities,
}: {
  entries: TicketAuditEntryRecord[];
  activities: TicketWorkspaceData['activities'];
}) {
  const systemActivities = activities.filter((activity) => activity.event_type !== 'comment_added');

  if (entries.length === 0 && systemActivities.length === 0) {
    return <EmptyPanel title="No audit trail yet" description="Auditable changes and workflow events will appear here." />;
  }

  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <Section title="Audit log">
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border bg-card px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">{entry.action}</Badge>
                  <p className="text-sm font-medium text-foreground">{entry.actor_name ?? 'User action'}</p>
                  <p className="text-xs text-muted-foreground">{entry.created_at ? formatDateTime(entry.created_at) : ''}</p>
                </div>
                {entry.changes && Object.keys(entry.changes).length > 0 && (
                  <div className="mt-2 space-y-1 rounded-md bg-muted/40 p-2">
                    {formatAuditChanges(entry.changes)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
      {systemActivities.length > 0 && (
        <Section title="Workflow activity">
          <TicketActivityList activities={activities} />
        </Section>
      )}
    </div>
  );
}
