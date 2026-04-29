import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@flc/supabase';
import type { Notification } from '@flc/types';
import { useAuth } from '@/contexts/AuthContext';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/services/hrmsService';

const TYPE_CLASSES: Record<Notification['type'], string> = {
  info:    'bg-primary/10 text-primary',
  warning: 'bg-yellow-900/30 text-yellow-400',
  success: 'bg-green-900/30 text-green-400',
  error:   'bg-red-900/30 text-red-400',
};

function formatTimestamp(value: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-MY', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}


function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id:        String(row.id ?? ''),
    title:     String(row.title ?? ''),
    message:   String(row.message ?? ''),
    type:      (row.type as Notification['type']) ?? 'info',
    read:      Boolean(row.read),
    createdAt: row.created_at ? String(row.created_at) : '',
    userId:    String(row.user_id ?? ''),
  };
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    listNotifications(user.id)
      .then(setNotifications)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load notifications.'))
      .finally(() => setLoading(false));
  }, [user?.id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`mobile:notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        payload => setNotifications(prev => [rowToNotification(payload.new as Record<string, unknown>), ...prev]),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        payload => setNotifications(prev => prev.map(item => (
          item.id === String((payload.new as Record<string, unknown>).id ?? '')
            ? rowToNotification(payload.new as Record<string, unknown>)
            : item
        ))),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const unreadCount = useMemo(() => notifications.filter(item => !item.read).length, [notifications]);

  async function handleMarkRead(item: Notification) {
    if (!user?.id || item.read) return;
    setError(null);
    setNotifications(prev => prev.map(current => current.id === item.id ? { ...current, read: true } : current));
    try {
      await markNotificationRead(item.id, user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark notification as read.');
      load();
    }
  }

  async function handleMarkAllRead() {
    if (!user?.id || unreadCount === 0) return;
    setSaving(true);
    setError(null);
    setNotifications(prev => prev.map(item => ({ ...item, read: true })));
    try {
      await markAllNotificationsRead(user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark notifications as read.');
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background safe-top safe-bottom">
      <header className="flex items-center justify-between gap-3 px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-muted-foreground">←</button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Notifications</h1>
            <p className="text-xs text-muted-foreground">Approvals, alerts, and HRMS updates</p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={saving}
            className="rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-foreground disabled:opacity-60"
          >
            Read all
          </button>
        )}
      </header>

      <main className="flex-1 px-5 pb-6">
        {error && <div className="mb-4 rounded-2xl bg-secondary p-4 text-sm text-destructive">{error}</div>}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : notifications.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-5 text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          <ul className="space-y-3">
            {notifications.map(item => (
              <li key={item.id}>
                <button
                  onClick={() => handleMarkRead(item)}
                  disabled={item.read}
                  className={`w-full rounded-2xl bg-secondary p-4 text-left transition-opacity active:opacity-70 ${item.read ? 'opacity-75' : 'ring-1 ring-primary/40'}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${TYPE_CLASSES[item.type] ?? TYPE_CLASSES.info}`}>
                      {item.type}
                    </span>
                    {!item.read && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">{item.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.message}</p>
                  {item.createdAt && (
                    <p className="mt-3 text-[11px] text-muted-foreground">{formatTimestamp(item.createdAt)}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}