/**
 * useAppLifecycle
 *
 * Handles Capacitor App plugin events:
 *  - `backButton`    — Android hardware back-button (navigate back or confirm exit)
 *  - `appStateChange` — resumed from background (useful to refresh stale data)
 *  - `appUrlOpen`    — handles deep-links opened from push taps / universal links
 *
 * Usage: mount once at the App root inside <BrowserRouter>.
 */
import { useEffect }   from 'react';
import { useNavigate } from 'react-router-dom';
import { App }         from '@capacitor/app';
import { Capacitor }   from '@capacitor/core';

export function useAppLifecycle(onResume?: () => void) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let backListener:        Awaited<ReturnType<typeof App.addListener>> | null = null;
    let appStateListener:    Awaited<ReturnType<typeof App.addListener>> | null = null;
    let appUrlOpenListener:  Awaited<ReturnType<typeof App.addListener>> | null = null;

    (async () => {
      // ── Android back button ──────────────────────────────────────────────────
      backListener = await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          navigate(-1);
        } else {
          // At the root — ask the OS to minimise
          void App.minimizeApp();
        }
      });

      // ── App resumed from background ──────────────────────────────────────────
      appStateListener = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && onResume) {
          onResume();
        }
      });

      // ── Deep-link / universal link ───────────────────────────────────────────
      // URL format expected: com.flc.hrms://app/leave/history
      appUrlOpenListener = await App.addListener('appUrlOpen', ({ url }) => {
        try {
          const parsed = new URL(url);
          // Support both custom scheme (com.flc.hrms://app/...) and https universal links
          const path = parsed.pathname;
          if (path) navigate(path);
        } catch {
          // ignore malformed URLs
        }
      });
    })();

    return () => {
      void backListener?.remove();
      void appStateListener?.remove();
      void appUrlOpenListener?.remove();
    };
  }, [navigate, onResume]);
}
