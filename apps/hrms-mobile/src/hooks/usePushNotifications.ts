/**
 * usePushNotifications
 *
 * Initialises push notifications once the user is signed in and
 * cleans up listeners on sign-out / unmount.
 *
 * Usage:
 *   const { permissionState } = usePushNotifications();
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate }                 from 'react-router-dom';
import { useAuth }                     from '@/contexts/AuthContext';
import { initPushNotifications, type PushHandlerCleanup } from '@/services/pushService';

export type PushPermissionState = 'unknown' | 'granted' | 'denied';

export function usePushNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cleanupRef = useRef<PushHandlerCleanup | null>(null);
  const [permissionState, setPermissionState] = useState<PushPermissionState>('unknown');

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    initPushNotifications(user.id, navigate).then(cleanup => {
      if (cancelled) {
        void cleanup.remove();
        return;
      }
      cleanupRef.current = cleanup;
      setPermissionState('granted');
    }).catch(() => {
      setPermissionState('denied');
    });

    return () => {
      cancelled = true;
      void cleanupRef.current?.remove();
      cleanupRef.current = null;
    };
  }, [user?.id]);

  return { permissionState };
}
