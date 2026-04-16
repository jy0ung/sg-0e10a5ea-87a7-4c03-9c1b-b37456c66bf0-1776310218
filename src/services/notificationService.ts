import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  created_at: string | null;
}

export async function getNotifications(userId: string): Promise<{ data: NotificationRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    loggingService.error('Failed to fetch notifications', { error: error.message }, 'NotificationService');
    return { data: [], error: new Error(error.message) };
  }

  return { data: (data ?? []) as unknown as NotificationRow[], error: null };
}

export async function markAsRead(notificationId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);

  if (error) {
    loggingService.error('Failed to mark notification as read', { error: error.message }, 'NotificationService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function markAllAsRead(userId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    loggingService.error('Failed to mark all notifications as read', { error: error.message }, 'NotificationService');
    return { error: new Error(error.message) };
  }
  return { error: null };
}
