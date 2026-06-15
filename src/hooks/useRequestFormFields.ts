import { useCallback, useEffect, useState } from 'react';
import {
  listRequestFormFields,
  type RequestFormFieldRecord,
} from '@flc/internal-requests';

export function useRequestFormFields(
  companyId?: string,
  options: { categoryKey?: string; subcategoryKey?: string; includeInactive?: boolean } = {},
) {
  const [fields, setFields] = useState<RequestFormFieldRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const categoryKey = options.categoryKey;
  const subcategoryKey = options.subcategoryKey;
  const includeInactive = options.includeInactive ?? false;

  const reload = useCallback(async () => {
    if (!companyId) {
      setFields([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await listRequestFormFields(companyId, { categoryKey, subcategoryKey, includeInactive });
    setFields(result.data);
    setError(result.error);
    setLoading(false);
  }, [categoryKey, companyId, includeInactive, subcategoryKey]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!companyId) {
        setFields([]);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const result = await listRequestFormFields(companyId, { categoryKey, subcategoryKey, includeInactive });
      if (cancelled) return;
      setFields(result.data);
      setError(result.error);
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [categoryKey, companyId, includeInactive, subcategoryKey]);

  return { fields, loading, error, reload };
}
