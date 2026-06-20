import { useCallback, useEffect, useRef, useState } from 'react';

interface PersistedDraftEnvelope {
  version: number;
  updatedAt: string;
  data: Record<string, unknown>;
}

interface UsePersistedDraftOptions {
  /** localStorage key used to store the draft. */
  key: string | null;
  /**
   * Schema version. When the stored draft has a different version it is
   * silently discarded. Defaults to 1.
   */
  version?: number;
}

interface UsePersistedDraftReturn {
  /** The persisted draft data, or null if nothing was saved yet. */
  draft: Record<string, unknown> | null;
  /**
   * Merge the given fields into the persisted draft. Writes are debounced
   * (400 ms) so rapid keystrokes don't hammer localStorage.
   */
  saveDraft: (fields: Record<string, unknown>) => void;
  /** Remove the persisted draft from localStorage and reset in-memory state. */
  clearDraft: () => void;
  /** Timestamp of the last successful persist, or null. */
  draftSavedAt: Date | null;
}

const DEBOUNCE_MS = 400;

/**
 * Standardized hook for localStorage-backed draft persistence.
 *
 * Replaces ad-hoc implementations in NewTicket (and potentially other forms)
 * with a single, versioned, debounced solution.
 */
export function usePersistedDraft({
  key,
  version = 1,
}: UsePersistedDraftOptions): UsePersistedDraftReturn {
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<number | null>(null);
  // Keep a mutable ref to the latest draft so the debounced write always
  // flushes the most recent data even if the component re-rendered.
  const draftRef = useRef<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(() => {
    if (!key || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedDraftEnvelope;
      if (!parsed || parsed.version !== version) {
        window.localStorage.removeItem(key);
        return null;
      }
      draftRef.current = parsed.data ?? null;
      return parsed.data ?? null;
    } catch {
      window.localStorage.removeItem(key);
      return null;
    }
  });

  // Sync ref on draft changes (e.g. after clearDraft).
  useEffect(() => { draftRef.current = draft; }, [draft]);

  const saveDraft = useCallback(
    (fields: Record<string, unknown>) => {
      if (!key) return;
      // Merge into current draft.
      const merged = { ...(draftRef.current ?? {}), ...fields };
      draftRef.current = merged;
      setDraft(merged);

      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        try {
          const envelope: PersistedDraftEnvelope = {
            version,
            updatedAt: new Date().toISOString(),
            data: merged,
          };
          window.localStorage.setItem(key, JSON.stringify(envelope));
          setDraftSavedAt(new Date());
        } catch {
          // Ignore quota / private-mode errors.
        } finally {
          timerRef.current = null;
        }
      }, DEBOUNCE_MS);
    },
    [key, version],
  );

  const clearDraft = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    draftRef.current = null;
    setDraft(null);
    setDraftSavedAt(null);
    if (key) {
      try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    }
  }, [key]);

  // Clean up the timer on unmount.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return { draft, saveDraft, clearDraft, draftSavedAt };
}
