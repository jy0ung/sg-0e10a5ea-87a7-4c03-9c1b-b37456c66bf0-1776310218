import { QueryClient } from '@tanstack/react-query';

/**
 * Differentiated staleTime constants for use in individual useQuery calls.
 * Reference/config data (deal stages, branches, categories) — 5 min
 * Transactional data (sales orders, invoices) — 60 s
 * Notifications / alerts — 30 s
 */
export const STALE = {
  reference: 5 * 60_000,
  transactional: 60_000,
  notifications: 30_000,
} as const;

export const APP_QUERY_DEFAULTS = {
  queries: {
    // Default covers most transactional data; override per-query where needed.
    staleTime: STALE.transactional,
    gcTime: 5 * 60_000,
    // Prevent background refetches from triggering while the user is in the
    // middle of editing a form.  Both options are false by default here so
    // that switching browser tabs or briefly losing network connectivity never
    // silently invalidates in-progress work.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  },
} as const;

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: APP_QUERY_DEFAULTS,
  });
}