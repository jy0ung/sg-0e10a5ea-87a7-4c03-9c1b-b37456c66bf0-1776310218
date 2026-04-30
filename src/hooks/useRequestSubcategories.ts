import { useCallback, useEffect, useState } from 'react';
import {
  listRequestSubcategories,
  type ListRequestSubcategoriesOptions,
  type RequestSubcategoryRecord,
} from '@/services/requestSubcategoryService';

export function useRequestSubcategories(
  companyId?: string,
  options: ListRequestSubcategoriesOptions = {},
) {
  const includeInactive = options.includeInactive ?? false;
  const categoryKey = options.categoryKey;

  const [subcategories, setSubcategories] = useState<RequestSubcategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!companyId) {
      setSubcategories([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await listRequestSubcategories(companyId, { includeInactive, categoryKey });
    setSubcategories(result.data);
    setError(result.error);
    setLoading(false);
  }, [categoryKey, companyId, includeInactive]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!companyId) {
        setSubcategories([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await listRequestSubcategories(companyId, { includeInactive, categoryKey });
      if (cancelled) return;
      setSubcategories(result.data);
      setError(result.error);
      setLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [categoryKey, companyId, includeInactive]);

  return {
    subcategories,
    loading,
    error,
    reload,
  };
}