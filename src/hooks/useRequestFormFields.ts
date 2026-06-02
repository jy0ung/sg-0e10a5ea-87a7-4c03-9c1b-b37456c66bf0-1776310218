import { useCallback, useEffect, useState } from 'react';
import {
  listRequestFormFields,
  type RequestFormFieldRecord,
} from '@flc/internal-requests';

export function useRequestFormFields(
  companyId?: string,
  options: { categoryKey?: string; includeInactive?: boolean } = {},
) {
  const [fields, setFields] = useState<RequestFormFieldRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const categoryKey = options.categoryKey;
  const includeInactive = options.includeInactive ?? false;

  const reload = useCallback(async () => {
    if (!companyId) {
      setFields([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await listRequestFormFields(companyId, { categoryKey, includeInactive });
    setFields(result.data);
    setError(result.error);
    setLoading(false);
  }, [categoryKey, companyId, includeInactive]);

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
      const result = await listRequestFormFields(companyId, { categoryKey, includeInactive });
      if (cancelled) return;
      setFields(result.data);
      setError(result.error);
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [categoryKey, companyId, includeInactive]);

  return { fields, loading, error, reload };
}
