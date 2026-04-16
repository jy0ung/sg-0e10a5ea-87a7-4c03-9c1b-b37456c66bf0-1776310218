import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { getNotifications, markAsRead, markAllAsRead, NotificationRow } from '@/services/notificationService';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCheck, Bell } from 'lucide-react';
import { toast } from 'sonner';

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await getNotifications(user.id);
    setNotifications(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleMarkRead = async (id: string) => {
    const { error } = await markAsRead(id);
    if (error) { toast.error('Failed to mark as read'); return; }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const { error } = await markAllAsRead(user.id);
    if (error) { toast.error('Failed to mark all as read'); return; }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast.success('All notifications marked as read');
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
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
