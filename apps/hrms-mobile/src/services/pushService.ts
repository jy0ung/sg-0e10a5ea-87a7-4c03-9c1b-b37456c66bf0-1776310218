/**
 * Push notification service for the HRMS mobile app.
 *
 * Handles:
 *  - Permission request on first launch
 *  - FCM/APNs token registration → persisted to Supabase `profiles`
 *  - Foreground notification display (via capacitor listener)
 *  - Tap handling to deep-link into the correct screen
 *
 * Usage: call `initPushNotifications(userId, navigate)` once after login inside
 * a `useEffect`.  All listeners are returned so you can clean them up on logout.
 */
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase }  from '@flc/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushHandlerCleanup {
  /** Call this on logout / component unmount to remove all listeners. */
  remove: () => Promise<void>;
}

export interface NotificationPayload {
  title: string;
  body:  string;
  /** Optional deep-link path, e.g. '/leave/history' */
  path?: string;
}

// ─── Permission Request ───────────────────────────────────────────────────────

/**
 * Request push notification permission.
 * On Android 13+ and iOS this shows the system dialog on first call.
 * Returns whether permission was granted.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  let permStatus = await PushNotifications.checkPermissions();

  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions();
  }

  return permStatus.receive === 'granted';
}

// ─── Token Persistence ────────────────────────────────────────────────────────

/**
 * Save the device push token to the user's profile so the server can
 * target push notifications to specific users.
 */
async function persistToken(userId: string, token: string): Promise<void> {
  try {
    await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, platform: Capacitor.getPlatform() as 'ios' | 'android' | 'web', updated_at: new Date().toISOString() });
  } catch {
    // Non-fatal if the table is unavailable.
  }
}

// ─── Initialise ──────────────────────────────────────────────────────────────

/**
 * Set up all push notification listeners.
 * Call once after the user is authenticated.
 *
 * @param userId   Supabase user id (for token persistence)
 * @param navigate React Router navigate function (for deep-linking on tap)
 */
export async function initPushNotifications(
  userId: string,
  navigate: (path: string) => void,
): Promise<PushHandlerCleanup> {
  if (!Capacitor.isNativePlatform()) {
    return { remove: async () => {} };
  }

  const granted = await requestPushPermission();
  if (!granted) {
    return { remove: async () => {} };
  }

  // Register with FCM / APNs
  await PushNotifications.register();

  // Collect listener handles for cleanup
  const registrationListener = await PushNotifications.addListener(
    'registration',
    (token: Token) => {
      void persistToken(userId, token.value);
    },
  );

  const registrationErrorListener = await PushNotifications.addListener(
    'registrationError',
    (err) => {
      console.error('[Push] Registration error:', err);
    },
  );

  // Foreground: notification received while app is open
  const foregroundListener = await PushNotifications.addListener(
    'pushNotificationReceived',
    (notification: PushNotificationSchema) => {
      console.info('[Push] Foreground notification:', notification.title);
      // Could dispatch to a toast/banner system here.
      // For now we log; implement in-app toasts in a follow-up.
    },
  );

  // Background/tap: user tapped a notification
  const tapListener = await PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action: ActionPerformed) => {
      const data = action.notification.data as Record<string, string> | undefined;
      const path = data?.path;
      if (path) {
        navigate(path);
      }
    },
  );

  return {
    async remove() {
      await registrationListener.remove();
      await registrationErrorListener.remove();
      await foregroundListener.remove();
      await tapListener.remove();
    },
  };
}
