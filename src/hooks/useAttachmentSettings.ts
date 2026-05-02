import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_ATTACHMENT_SETTINGS,
  getAttachmentSettings,
  upsertAttachmentSettings,
  type AttachmentSettings,
} from '@/services/ticketAttachmentService';

export function useAttachmentSettings(companyId?: string) {
  const [settings, setSettings] = useState<AttachmentSettings>(DEFAULT_ATTACHMENT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!companyId) {
      setSettings(DEFAULT_ATTACHMENT_SETTINGS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await getAttachmentSettings(companyId);
    setSettings(result.data ?? DEFAULT_ATTACHMENT_SETTINGS);
    setError(result.error);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!companyId) {
        setSettings(DEFAULT_ATTACHMENT_SETTINGS);
        setLoading(false);
        return;
      }
      setLoading(true);
      const result = await getAttachmentSettings(companyId);
      if (cancelled) return;
      setSettings(result.data ?? DEFAULT_ATTACHMENT_SETTINGS);
      setError(result.error);
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const save = useCallback(
    async (
      next: AttachmentSettings,
      updatedBy: string,
    ): Promise<{ error: string | null }> => {
      if (!companyId) return { error: 'No company ID' };
      const result = await upsertAttachmentSettings(companyId, next, updatedBy);
      if (result.data) setSettings(result.data);
      return { error: result.error };
    },
    [companyId],
  );

  return { settings, loading, error, reload, save };
}
