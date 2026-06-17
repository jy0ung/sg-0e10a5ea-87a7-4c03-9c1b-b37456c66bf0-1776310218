import type { ElementType } from 'react';

import { cn } from '@/lib/utils';
import { toneClass, type Tone } from '@/lib/statusTones';
import {
  requestPriorityLabel,
  requestPriorityTone,
  requestStatusLabel,
  requestStatusTone,
} from '@/lib/requestTones';
import type { TicketPriority, TicketStatus } from '@/services/ticketService';

interface RequestBadgeProps {
  tone: Tone;
  label: string;
  icon?: ElementType;
  className?: string;
}

/**
 * Tone-driven status pill for the Internal Request module. Built on the shared
 * {@link toneClass} system so status/priority/SLA badges stay consistent with
 * the rest of the suite instead of each call site hand-writing Tailwind colour
 * pairs.
 */
export function RequestBadge({ tone, label, icon: Icon, className }: RequestBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-none',
        toneClass(tone),
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {label}
    </span>
  );
}

export function RequestStatusBadge({
  status,
  icon,
  className,
}: {
  status: TicketStatus;
  icon?: ElementType;
  className?: string;
}) {
  return (
    <RequestBadge tone={requestStatusTone(status)} label={requestStatusLabel(status)} icon={icon} className={className} />
  );
}

export function RequestPriorityBadge({
  priority,
  icon,
  className,
}: {
  priority: TicketPriority;
  icon?: ElementType;
  className?: string;
}) {
  return (
    <RequestBadge
      tone={requestPriorityTone(priority)}
      label={requestPriorityLabel(priority)}
      icon={icon}
      className={className}
    />
  );
}
