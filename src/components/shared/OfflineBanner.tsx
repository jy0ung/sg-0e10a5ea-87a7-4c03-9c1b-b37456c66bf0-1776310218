import React from 'react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

/**
 * Sticky banner shown when the browser is offline. Lives at the top of the
 * shell so users notice immediately and read-only views can continue from
 * cache without confusion.
 *
 * Gated by phase4.pwa-offline so the rollout can be paused if the banner
 * misfires on flaky networks.
 */
export function OfflineBanner() {
  const canShowBanner = useFeatureFlag('phase4.pwa-offline', false);
  const online = useOnlineStatus();

  if (!canShowBanner || online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      className="sticky top-0 z-50 w-full bg-amber-500 text-amber-950 dark:bg-amber-600 dark:text-amber-50 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 shadow-sm"
    >
      <WifiOff className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <span>You're offline. Some data may be stale until your connection returns.</span>
    </div>
  );
}
