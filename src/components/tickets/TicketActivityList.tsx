import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import type { TicketActivityRecord } from '@/services/ticketService';

export function TicketActivityList({ activities }: { activities: TicketActivityRecord[] }) {
  const [expanded, setExpanded] = useState(false);
  const systemActivities = activities.filter((activity) => activity.event_type !== 'comment_added');
  if (systemActivities.length === 0) return null;

  const visibleActivities = expanded ? systemActivities : systemActivities.slice(0, 5);
  const hiddenCount = systemActivities.length - visibleActivities.length;

  return (
    <div className="space-y-2">
      <p className="eyebrow">
        Activity timeline
      </p>

      <div className="space-y-2">
        {visibleActivities.map((activity) => (
          <div key={activity.id} className="rounded-lg border border-border px-4 py-3">
            <div className="flex items-start gap-2">
              <p className="whitespace-pre-line text-sm text-foreground">{activity.message}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {activity.actor_name ? `${activity.actor_name} • ` : ''}
              {activity.created_at ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true }) : ''}
            </p>
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => setExpanded(true)}>
          Show {hiddenCount} older {hiddenCount === 1 ? 'event' : 'events'}
        </Button>
      )}
    </div>
  );
}
