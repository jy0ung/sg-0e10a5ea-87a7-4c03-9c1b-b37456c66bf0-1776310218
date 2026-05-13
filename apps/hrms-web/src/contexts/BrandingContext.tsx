/**
 * BrandingContext — provides ResolvedBranding to the entire React tree.
 *
 * Usage:
 *   const { branding, loading, refresh } = useBranding();
 *
 * Mount <BrandingProvider> once in each app root, AFTER <AuthProvider> so the
 * user's company_id is available.  Falls back to static defaults immediately
 * while data loads, so the app never renders with blank brand values.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchBranding,
  resolveBranding,
  BRANDING_DEFAULTS,
  type ResolvedBranding,
} from '@/services/brandingService';
import { useAuth } from '@/contexts/AuthContext';

interface BrandingContextValue {
  branding: ResolvedBranding;
  loading: boolean;
  /** Imperatively re-fetch branding (call after saving changes). */
  refresh: () => void;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: BRANDING_DEFAULTS,
  loading: false,
  refresh: () => {},
});

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = user?.company_id ?? null;

  const { data: rawBranding, isLoading } = useQuery({
    queryKey: ['company_branding', companyId],
    queryFn: () => fetchBranding().then(r => r.data),
    enabled: Boolean(companyId),
    staleTime: 5 * 60 * 1000, // 5 min — branding changes infrequently
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const [resolved, setResolved] = useState<ResolvedBranding>(BRANDING_DEFAULTS);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (rawBranding === undefined) return; // still loading — keep defaults
    setResolving(true);
    void resolveBranding(rawBranding ?? null).then(r => {
      setResolved(r);
      setResolving(false);
    });
  }, [rawBranding]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['company_branding', companyId] });
  }, [queryClient, companyId]);

  const value = useMemo<BrandingContextValue>(
    () => ({ branding: resolved, loading: isLoading || resolving, refresh }),
    [resolved, isLoading, resolving, refresh],
  );

  return (
    <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
