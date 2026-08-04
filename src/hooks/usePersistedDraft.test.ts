import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedDraft } from './usePersistedDraft';

describe('usePersistedDraft', () => {
  const key = 'flc.test-draft';

  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null draft when localStorage is empty', () => {
    const { result } = renderHook(() => usePersistedDraft({ key }));
    expect(result.current.draft).toBeNull();
    expect(result.current.draftSavedAt).toBeNull();
  });

  it('saves draft to localStorage after debounce', () => {
    const { result } = renderHook(() => usePersistedDraft({ key }));
    act(() => {
      result.current.saveDraft({ subject: 'Test subject' });
    });
    // Before debounce fires, localStorage should be empty
    expect(window.localStorage.getItem(key)).toBeNull();
    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const raw = window.localStorage.getItem(key);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.data.subject).toBe('Test subject');
    expect(result.current.draftSavedAt).not.toBeNull();
  });

  it('merges subsequent saves into the draft', () => {
    const { result } = renderHook(() => usePersistedDraft({ key }));
    act(() => {
      result.current.saveDraft({ subject: 'First' });
    });
    act(() => {
      result.current.saveDraft({ description: 'Second' });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const parsed = JSON.parse(window.localStorage.getItem(key)!);
    expect(parsed.data.subject).toBe('First');
    expect(parsed.data.description).toBe('Second');
  });

  it('clears draft from localStorage and memory', () => {
    const { result } = renderHook(() => usePersistedDraft({ key }));
    act(() => {
      result.current.saveDraft({ subject: 'To be cleared' });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(window.localStorage.getItem(key)).not.toBeNull();
    act(() => {
      result.current.clearDraft();
    });
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(result.current.draft).toBeNull();
    expect(result.current.draftSavedAt).toBeNull();
  });

  it('flushes pending draft to localStorage on unmount', () => {
    const { result, unmount } = renderHook(() => usePersistedDraft({ key }));
    act(() => {
      result.current.saveDraft({ subject: 'Unflushed' });
    });
    // Don't advance timers — unmount while debounce is still pending
    unmount();
    const raw = window.localStorage.getItem(key);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.data.subject).toBe('Unflushed');
  });

  it('does not flush on unmount when no pending timer', () => {
    const { result, unmount } = renderHook(() => usePersistedDraft({ key }));
    act(() => {
      result.current.saveDraft({ subject: 'Already saved' });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Timer has already fired, so unmount should not write again
    const before = window.localStorage.getItem(key);
    unmount();
    const after = window.localStorage.getItem(key);
    expect(after).toBe(before);
  });

  it('discards draft with wrong version', () => {
    window.localStorage.setItem(key, JSON.stringify({ version: 999, updatedAt: 'x', data: { old: true } }));
    const { result } = renderHook(() => usePersistedDraft({ key, version: 1 }));
    expect(result.current.draft).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('handles null key gracefully — saveDraft is a no-op', () => {
    const { result } = renderHook(() => usePersistedDraft({ key: null }));
    act(() => {
      result.current.saveDraft({ subject: 'No key' });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // With no key, saveDraft returns early and draft stays null
    expect(result.current.draft).toBeNull();
    expect(result.current.draftSavedAt).toBeNull();
    // Nothing in localStorage
    expect(window.localStorage.length).toBe(0);
  });

  it('handles corrupted localStorage entry', () => {
    window.localStorage.setItem(key, '{invalid json');
    const { result } = renderHook(() => usePersistedDraft({ key }));
    expect(result.current.draft).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});