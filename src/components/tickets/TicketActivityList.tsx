import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { TicketActivityRecord } from '@/services/ticketService';

export function TicketActivityList({ activities }: { activities: TicketActivityRecord[] }) {
  const [expanded, setExpanded] = useState(false);
  if (activities.length === 0) return null;

  const visibleActivities = expanded ? activities : activities.slice(0, 5);
  const hiddenCount = activities.length - visibleActivities.length;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Activity timeline
      </p>

      <div className="space-y-2">
        {visibleActivities.map((activity) => (
          <div key={activity.id} className="rounded-lg border border-border px-4 py-3">
            <div className="flex items-start gap-2">
              {activity.event_type === 'comment_added' && <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
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