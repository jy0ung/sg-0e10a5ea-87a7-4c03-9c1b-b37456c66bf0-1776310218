import { useLocation } from 'react-router-dom';

/**
 * Paths whose first segment belongs to a standalone module.
 * Any route under these prefixes renders in focused (module-only) mode.
 * Platform paths (/. /modules, /notifications, /admin/*) are excluded.
 */
const MODULE_PREFIXES = [
  '/auto-aging',
  '/sales',
  '/inventory',
  '/purchasing',
  '/reports',
];

export function useFocusedMode(): { isFocused: boolean } {
  const { pathname } = useLocation();
  const isFocused = MODULE_PREFIXES.some(p => pathname.startsWith(p));
  return { isFocused };
}
