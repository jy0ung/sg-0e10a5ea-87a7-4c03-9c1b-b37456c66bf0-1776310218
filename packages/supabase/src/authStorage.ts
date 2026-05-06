import type { SupportedStorage } from '@supabase/supabase-js';

const SHARED_COOKIE_DOMAIN = '.protonfookloi.com';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const COOKIE_CHUNK_SIZE = 3000;
const MAX_COOKIE_CHUNKS = 20;
const REMOVED_COOKIE_SUFFIX = 'removed';

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function canUseSharedCookie(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'protonfookloi.com' || hostname.endsWith(SHARED_COOKIE_DOMAIN);
}

function getCookieAttributes(maxAgeSeconds: number): string {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  return `Path=/; Domain=${SHARED_COOKIE_DOMAIN}; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  const match = document.cookie
    .split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds = COOKIE_MAX_AGE_SECONDS): void {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${getCookieAttributes(maxAgeSeconds)}`;
}

function removeCookie(name: string): void {
  writeCookie(name, '', 0);
}

function removeCookieChunks(key: string): void {
  const currentCount = Number(readCookie(`${key}.chunk-count`) ?? 0);
  const chunksToClear = Math.max(currentCount, MAX_COOKIE_CHUNKS);
  removeCookie(key);
  removeCookie(`${key}.chunk-count`);
  for (let index = 0; index < chunksToClear; index += 1) {
    removeCookie(`${key}.${index}`);
  }
}

function readCookieChunks(key: string): string | null {
  const chunkCount = Number(readCookie(`${key}.chunk-count`) ?? 0);
  if (!chunkCount) return readCookie(key);

  const chunks: string[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = readCookie(`${key}.${index}`);
    if (chunk === null) return null;
    chunks.push(chunk);
  }
  return chunks.join('');
}

function writeCookieChunks(key: string, value: string): void {
  removeCookieChunks(key);
  removeCookie(`${key}.${REMOVED_COOKIE_SUFFIX}`);
  const chunks = value.match(new RegExp(`.{1,${COOKIE_CHUNK_SIZE}}`, 'g')) ?? [''];
  writeCookie(`${key}.chunk-count`, String(chunks.length));
  chunks.forEach((chunk, index) => writeCookie(`${key}.${index}`, chunk));
}

export function createSharedAuthStorage(): SupportedStorage {
  return {
    getItem(key: string) {
      const browserStorage = getBrowserStorage();

      if (canUseSharedCookie()) {
        const cookieValue = readCookieChunks(key);
        if (cookieValue !== null) return cookieValue;

        if (readCookie(`${key}.${REMOVED_COOKIE_SUFFIX}`) === '1') {
          browserStorage?.removeItem(key);
          return null;
        }

        const localValue = browserStorage?.getItem(key) ?? null;
        if (localValue !== null) writeCookieChunks(key, localValue);
        return localValue;
      }

      return browserStorage?.getItem(key) ?? null;
    },
    setItem(key: string, value: string) {
      getBrowserStorage()?.setItem(key, value);
      if (canUseSharedCookie()) writeCookieChunks(key, value);
    },
    removeItem(key: string) {
      getBrowserStorage()?.removeItem(key);
      if (canUseSharedCookie()) {
        removeCookieChunks(key);
        writeCookie(`${key}.${REMOVED_COOKIE_SUFFIX}`, '1');
      }
    },
  };
}