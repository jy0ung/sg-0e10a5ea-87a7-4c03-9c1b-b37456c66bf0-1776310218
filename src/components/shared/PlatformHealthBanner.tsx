import React from 'react';
import { ServerCrash } from 'lucide-react';
import { usePlatformHealth } from '@/hooks/usePlatformHealth';

/**
 * Sticky banner shown app-wide when the deployed app is calling database
 * objects (RPCs / tables) that the production schema cache doesn't know
 * about. Pairs with PageErrorState's `isPlatformMismatchError` branch so
 * users see a coherent story instead of seven different "Unable to load
 * data" cards across modules.
 *
 * Renders nothing on healthy environments — zero cost in the happy path.
 */
export function PlatformHealthBanner() {
  const { mismatch } = usePlatformHealth();

  if (!mismatch) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="platform-health-banner"
      className="sticky top-0 z-50 w-full bg-destructive text-destructive-foreground px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 shadow-sm"
    >
      <ServerCrash className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <span>
        Some platform features are temporarily unavailable while a deployment finishes. Reach out to your administrator if this persists.
      </span>
    </div>
  );
}
