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
} from '@flc/platform-services';
import { useAuth } from '@/contexts/AuthContext';

interface BrandingContextValue {
  branding: ResolvedBranding;
  loading: boolean;
  error: string | null;
  /** Imperatively re-fetch branding (call after saving changes). */
  refresh: () => void;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: BRANDING_DEFAULTS,
  loading: false,
  error: null,
  refresh: () => {},
});

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = user?.company_id ?? null;

  const { data: rawBranding, isLoading, error } = useQuery({
    queryKey: ['company_branding', companyId],
    queryFn: async () => {
      const result = await fetchBranding(companyId!);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: Boolean(companyId),
    staleTime: 5 * 60 * 1000, // 5 min — branding changes infrequently
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const [resolved, setResolved] = useState<ResolvedBranding>(BRANDING_DEFAULTS);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (rawBranding === undefined) return; // still loading — keep defaults
    let cancelled = false;
    setResolving(true);
    void resolveBranding(rawBranding ?? null).then(r => {
      if (cancelled) return;
      setResolved(r);
      setResolvedCompanyId(companyId);
      setResolving(false);
    }).catch(() => {
      if (cancelled) return;
      setResolved(BRANDING_DEFAULTS);
      setResolvedCompanyId(companyId);
      setResolving(false);
    });
    return () => { cancelled = true; };
  }, [rawBranding, companyId]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['company_branding', companyId] });
  }, [queryClient, companyId]);

  const value = useMemo<BrandingContextValue>(
    () => ({ branding: resolvedCompanyId === companyId ? resolved : BRANDING_DEFAULTS, loading: isLoading || resolving || (Boolean(companyId) && resolvedCompanyId !== companyId && !error), error: error?.message ?? null, refresh }),
    [resolved, resolvedCompanyId, companyId, isLoading, resolving, error, refresh],
  );

  return (
    <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
