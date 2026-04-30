import { useCallback, useEffect, useState } from 'react';
import {
  listRequestCategories,
  type RequestCategoryRecord,
} from '@/services/requestCategoryService';

export function useRequestCategories(companyId?: string, includeInactive = false) {
  const [categories, setCategories] = useState<RequestCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!companyId) {
      setCategories([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await listRequestCategories(companyId, { includeInactive });
    setCategories(result.data);
    setError(result.error);
    setLoading(false);
  }, [companyId, includeInactive]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!companyId) {
        setCategories([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await listRequestCategories(companyId, { includeInactive });
      if (cancelled) return;
      setCategories(result.data);
      setError(result.error);
      setLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [companyId, includeInactive]);

  return {
    categories,
    loading,
    error,
    reload,
  };
}