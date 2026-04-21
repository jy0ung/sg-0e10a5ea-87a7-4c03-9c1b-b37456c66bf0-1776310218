import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LruCache } from './lruCache';

describe('LruCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns cached values within ttl', () => {
    const cache = new LruCache<string, number>({ max: 3, ttlMs: 1_000 });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('evicts expired entries', () => {
    const cache = new LruCache<string, number>({ max: 3, ttlMs: 1_000 });
    cache.set('a', 1);
    vi.advanceTimersByTime(1_001);
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts least recently used when over capacity', () => {
    const cache = new LruCache<string, number>({ max: 2, ttlMs: 10_000 });
    cache.set('a', 1);
    cache.set('b', 2);
    // Touch 'a' so 'b' is now the LRU.
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('clear() drops all entries', () => {
    const cache = new LruCache<string, number>({ max: 3, ttlMs: 10_000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });
});
