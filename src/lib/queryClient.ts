import { QueryClient } from '@tanstack/react-query';

export const APP_QUERY_DEFAULTS = {
  queries: {
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  },
} as const;

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: APP_QUERY_DEFAULTS,
  });
}