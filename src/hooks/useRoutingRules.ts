import { useCallback, useEffect, useState } from 'react';
import { listRoutingRules, type RequestRoutingRule } from '@/services/requestRoutingService';

export function useRoutingRules(companyId?: string) {
  const [rules, setRules] = useState<RequestRoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) {
      setRules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await listRoutingRules(companyId);
    setRules(result.data);
    setError(result.error);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rules, loading, error, reload: load };
}
