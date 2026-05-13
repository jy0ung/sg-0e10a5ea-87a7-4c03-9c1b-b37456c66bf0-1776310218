/**
 * Tiny LRU with TTL for RPC memoization.
 *
 * Phase 2 #17: keeps hot RPCs (vehicle search, KPI summary) off the wire when
 * the UI re-renders with identical args. Intentionally dependency-free and
 * generic so other services can adopt it without pulling in a library.
 */
export interface LruCacheOptions {
  max?: number;
  ttlMs?: number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class LruCache<K, V> {
  private readonly max: number;
  private readonly ttlMs: number;
  private readonly map = new Map<K, Entry<V>>();

  constructor(opts: LruCacheOptions = {}) {
    this.max = Math.max(1, opts.max ?? 64);
    this.ttlMs = Math.max(0, opts.ttlMs ?? 30_000);
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency by re-inserting.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.map.size > this.max) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this.map.delete(oldestKey);
    }
  }

  clear(): void {
    this.map.clear();
  }
}
