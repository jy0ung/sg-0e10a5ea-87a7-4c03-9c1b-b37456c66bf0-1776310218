import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useOnlineStatus', () => {
  it('reports navigator.onLine on mount', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('flips to false on the offline event', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('flips back to true on the online event', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
  });
});
