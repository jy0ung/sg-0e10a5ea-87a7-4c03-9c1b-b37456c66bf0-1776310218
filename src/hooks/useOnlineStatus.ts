/**
 * useOnlineStatus — reports whether the browser is currently online and
 * keeps in sync with the `online` / `offline` window events.
 *
 * Works alongside the PWA service worker: the SW absorbs cached resources,
 * but the React tree still needs to know connectivity dropped so it can
 * show banners, disable mutations, etc. SSR-safe: returns true when no
 * `navigator` is available.
 */
import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Re-sync once on mount in case the value diverged before the listeners
    // attached.
    setOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}
