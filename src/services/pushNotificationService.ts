import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';

// VAPID public key — must match the server's key
const VAPID_PUBLIC_KEY = 'BC3ZsgD9JAouX8KYywDsJlJ6-3tecFpkojk_w6SHzw8KpAGrvD8OD7-LX8DAD0nee86aB_odCALqBm3y5NKCBHQ';

// ============================================================
// Types
// ============================================================

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// ============================================================
// Helpers
// ============================================================

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// ============================================================
// Permission & Subscription
// ============================================================

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getPermissionStatus(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) {
    loggingService.error('Push notifications not supported');
    return 'denied';
  }
  return await Notification.requestPermission();
}

export async function subscribe(userId: string, companyId: string): Promise<{ error: Error | null }> {
  try {
    if (!isPushSupported()) {
      return { error: new Error('Push notifications not supported') };
    }

    const permission = await requestPermission();
    if (permission !== 'granted') {
      return { error: new Error('Notification permission denied') };
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // Already subscribed — update DB
      await saveSubscription(existing, userId, companyId);
      return { error: null };
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await saveSubscription(subscription, userId, companyId);
    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to subscribe');
    loggingService.error('Push subscribe failed', { error });
    return { error };
  }
}

export async function unsubscribe(userId: string): Promise<{ error: Error | null }> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      // Remove from DB
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', subscription.endpoint);
    }
    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to unsubscribe');
    return { error };
  }
}

export async function isSubscribed(): Promise<boolean> {
  try {
    if (!isPushSupported()) return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

// ============================================================
// Save subscription to DB
// ============================================================

async function saveSubscription(subscription: globalThis.PushSubscription, userId: string, companyId: string): Promise<void> {
  const p256dh = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');

  if (!p256dh || !auth) {
    throw new Error('Failed to get subscription keys');
  }

  const data: PushSubscriptionData = {
    endpoint: subscription.endpoint,
    p256dh: arrayBufferToBase64(p256dh),
    auth: arrayBufferToBase64(auth),
  };

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      company_id: companyId,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      user_agent: navigator.userAgent,
    }, { onConflict: 'user_id,endpoint' });

  if (error) {
    loggingService.error('Failed to save push subscription', { error });
    throw new Error(error.message);
  }
}

// ============================================================
// Send test notification (client-side only, for testing)
// ============================================================

export function sendTestNotification(): void {
  if (getPermissionStatus() !== 'granted') return;

  new Notification('FLC BI', {
    body: 'Push notifications are working!',
    icon: '/icons/logo.png',
    badge: '/icons/logo.png',
    tag: 'test',
  });
}
