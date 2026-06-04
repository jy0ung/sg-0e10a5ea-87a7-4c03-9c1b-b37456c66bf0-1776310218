import { isFocusedPlatformPath } from '@flc/shell';
import { useLocation } from 'react-router-dom';

export function useFocusedMode(): { isFocused: boolean } {
  const { pathname } = useLocation();
  return { isFocused: isFocusedPlatformPath(pathname) };
}
