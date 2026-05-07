import { describe, expect, it } from 'vitest';

import { isLocalHostname, resolveInviteSiteUrl } from '../../supabase/functions/_shared/publicSiteUrl';

describe('resolveInviteSiteUrl', () => {
  it('keeps a configured public origin', () => {
    expect(resolveInviteSiteUrl({
      envSiteUrls: ['https://ubs.protonfookloi.com/'],
      requestOrigin: 'https://ubs.protonfookloi.com',
    })).toBe('https://ubs.protonfookloi.com');
  });

  it('skips loopback env URLs when the request origin is public', () => {
    expect(resolveInviteSiteUrl({
      envSiteUrls: ['http://127.0.0.1:54321', 'http://localhost:3000'],
      requestOrigin: 'https://ubs.protonfookloi.com',
    })).toBe('https://ubs.protonfookloi.com');
  });

  it('allows local env URLs during local development', () => {
    expect(resolveInviteSiteUrl({
      envSiteUrls: ['http://127.0.0.1:54321'],
      requestOrigin: 'http://localhost:5173',
    })).toBe('http://127.0.0.1:54321');
  });
});

describe('isLocalHostname', () => {
  it('recognizes loopback and docker-internal hosts', () => {
    expect(isLocalHostname('127.0.0.1')).toBe(true);
    expect(isLocalHostname('host.docker.internal')).toBe(true);
    expect(isLocalHostname('localhost')).toBe(true);
  });

  it('does not flag public hosts', () => {
    expect(isLocalHostname('ubs.protonfookloi.com')).toBe(false);
  });
});