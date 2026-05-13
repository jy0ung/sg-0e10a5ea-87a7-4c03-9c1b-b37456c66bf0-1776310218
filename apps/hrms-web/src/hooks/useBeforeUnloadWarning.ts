import { useEffect } from 'react';

/**
 * Registers a browser `beforeunload` event listener while `isDirty` is true.
 *
 * This prevents the user from accidentally losing unsaved form data when they
 * close the tab, reload the page, or follow a hard-navigation link. Modern
 * browsers display a generic "Leave site?" dialog — the custom `message` is
 * ignored by spec but kept for backwards compatibility.
 *
 * For in-app React Router navigation use `useBlocker` in combination with
 * this hook.
 */
export function useBeforeUnloadWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // returnValue must be set for older browser support (Chrome < 119, etc.)
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
