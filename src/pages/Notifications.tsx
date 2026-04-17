import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { getNotifications, markAsRead, markAllAsRead, NotificationRow } from '@/services/notificationService';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCheck, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { TableSkeleton } from '@/components/shared/TableSkeleton';

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notifKey = ['notifications', user?.id ?? ''] as const;

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: notifKey,
    queryFn: () => getNotifications(user!.id).then(r => r.data),
    enabled: !!user,
    staleTime: 60_000,
  });

  // Realtime: prepend new notifications live without a full refetch.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`realtime:notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          queryClient.setQueryData<NotificationRow[]>(notifKey, prev =>
            [payload.new as NotificationRow, ...(prev ?? [])]
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          queryClient.setQueryData<NotificationRow[]>(notifKey, prev =>
            (prev ?? []).map(n => n.id === (payload.new as NotificationRow).id ? payload.new as NotificationRow : n)
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleMarkRead = async (id: string) => {
    const { error } = await markAsRead(id);
    if (error) { toast.error('Failed to mark as read'); return; }
    queryClient.setQueryData<NotificationRow[]>(notifKey, prev =>
      (prev ?? []).map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const { error } = await markAllAsRead(user.id);
    if (error) { toast.error('Failed to mark all as read'); return; }
    queryClient.setQueryData<NotificationRow[]>(notifKey, prev =>
      (prev ?? []).map(n => ({ ...n, read: true }))
    );
    toast.success('All notifications marked as read');
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Notifications" description="System alerts and updates" />
        <TableSkeleton rows={6} cols={1} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <PageHeader title="Notifications" description="System alerts and updates" />
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`glass-panel p-4 flex items-start gap-3 cursor-pointer transition-colors hover:bg-secondary/30 ${!n.read ? 'border-l-2 border-primary' : ''}`}
              onClick={() => !n.read && handleMarkRead(n.id)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-foreground">{n.title}</span>
                  <StatusBadge status={n.type} />
                </div>
                <p className="text-xs text-muted-foreground">{n.message}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
