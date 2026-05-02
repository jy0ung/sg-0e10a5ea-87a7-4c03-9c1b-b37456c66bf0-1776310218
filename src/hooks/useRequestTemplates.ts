import { useCallback, useEffect, useState } from 'react';
import {
  listRequestTemplates,
  type ListRequestTemplatesOptions,
  type RequestTemplateRecord,
} from '@/services/requestTemplateService';

export function useRequestTemplates(
  companyId?: string,
  options: ListRequestTemplatesOptions = {},
) {
  const includeInactive = options.includeInactive ?? false;

  const [templates, setTemplates] = useState<RequestTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!companyId) {
      setTemplates([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await listRequestTemplates(companyId, { includeInactive });
    setTemplates(result.data);
    setError(result.error);
    setLoading(false);
  }, [companyId, includeInactive]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!companyId) {
        setTemplates([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await listRequestTemplates(companyId, { includeInactive });
      if (cancelled) return;
      setTemplates(result.data);
      setError(result.error);
      setLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [companyId, includeInactive]);

  return { templates, loading, error, reload };
}
