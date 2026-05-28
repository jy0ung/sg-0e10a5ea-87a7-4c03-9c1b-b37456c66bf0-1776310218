import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A `Record<ticketId, string>` draft buffer that survives page reloads,
 * realtime refetches, and tab restarts via localStorage.
 *
 * The three Internal Service Request list pages (MyTickets, RequestHistory,
 * RequestQueue) each keep a per-ticket map of in-progress comment and
 * resolution-note drafts in React state. Until now, anything not yet sent
 * was lost on:
 *
 *   - a page reload (browser refresh, accidental nav)
 *   - a realtime refetch that re-seeded the drafts state from the server
 *     (cycle 3.5 made this routine when any colleague mutates a ticket)
 *   - the user closing the tab mid-typing
 *
 * Storage shape: `flc.ticket-drafts:${scope}:${companyId}:${userId}` — a
 * JSON object mapping ticketId → draft string. Empty strings are pruned on
 * write so the map doesn't accumulate dead entries after a user sends a
 * comment.
 *
 * Writes are debounced 300ms so a typing flurry doesn't hammer localStorage
 * on every keystroke. Failures (quota exceeded, private mode, disabled
 * storage) fall through silently — in-memory state remains the source of
 * truth and the user just loses the persistence benefit.
 */
export function usePersistedDraftMap(
  scope: string,
  companyId: string | null | undefined,
  userId: string | null | undefined,
) {
  const storageKey = companyId && userId
    ? `flc.ticket-drafts:${scope}:${companyId}:${userId}`
    : null;

  // Lazy initializer reads from localStorage exactly once on mount.
  const [drafts, setDraftsState] = useState<Record<string, string>>(() => {
    if (!storageKey || typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // Defensive: a malformed entry from an older version of the app
      // shouldn't crash the page. We only accept a flat string-valued object.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string') result[key] = value;
        }
        return result;
      }
      return {};
    } catch {
      return {};
    }
  });

  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return undefined;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      try {
        const cleaned: Record<string, string> = {};
        for (const [id, value] of Object.entries(drafts)) {
          if (value && value.trim().length > 0) cleaned[id] = value;
        }
        if (Object.keys(cleaned).length === 0) {
          window.localStorage.removeItem(storageKey);
        } else {
          window.localStorage.setItem(storageKey, JSON.stringify(cleaned));
        }
      } catch {
        // localStorage may be full, disabled, or running in private mode.
        // The in-memory state still works; we just lose the persistence.
      }
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [drafts, storageKey]);

  const setDrafts = useCallback(
    (updater: React.SetStateAction<Record<string, string>>) => setDraftsState(updater),
    [],
  );

  /**
   * Convenience helper for the post-save cleanup: remove a single ticket's
   * entry from the map after the user successfully sends the comment/note.
   * Cheaper than re-deriving the whole map from scratch and avoids briefly
   * leaving the sent text on screen.
   */
  const clearDraft = useCallback((ticketId: string) => {
    setDraftsState((prev) => {
      if (!(ticketId in prev)) return prev;
      const { [ticketId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  return [drafts, setDrafts, clearDraft] as const;
}
