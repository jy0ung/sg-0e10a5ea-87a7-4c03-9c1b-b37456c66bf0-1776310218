import React from 'react';
import { formatDistanceToNow } from 'date-fns';

import type { TicketActivityRecord } from '@/services/ticketService';

export function TicketActivityList({ activities }: { activities: TicketActivityRecord[] }) {
  if (activities.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Recent activity
      </p>

      <div className="space-y-2">
        {activities.slice(0, 3).map((activity) => (
          <div key={activity.id} className="rounded-lg border border-border px-4 py-3">
            <p className="text-sm text-foreground">{activity.message}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activity.actor_name ? `${activity.actor_name} • ` : ''}
              {activity.created_at ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true }) : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}