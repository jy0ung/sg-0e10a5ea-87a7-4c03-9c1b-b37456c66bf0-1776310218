import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { BackupManager } from './backup.js';
import { createRecoveryServer } from './server.js';

let server: Server | undefined;
let root: string | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  if (root) await rm(root, { recursive: true, force: true });
  server = undefined;
  root = undefined;
});

describe('Recovery API boundary', () => {
  it('requires server-verified admin identity and keeps unconfigured destinations disabled', async () => {
    root = await mkdtemp(join(tmpdir(), 'ubs-recovery-api-'));
    const manager = new BackupManager(join(root, 'exports'), null);
    await manager.initialize();
    server = createRecoveryServer(manager, { supabaseUrl: 'https://example.test', anonKey: 'public-key', serviceRoleKey: 'secret' },
      'https://ubs.example.test', async token => token === 'admin-token' ? 'admin-id' : null);
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test listener');
    const base = `http://127.0.0.1:${address.port}`;

    const ordinary = await fetch(`${base}/capabilities`, { headers: { authorization: 'Bearer ordinary-token' } });
    expect(ordinary.status).toBe(403);
    const wrongOrigin = await fetch(`${base}/capabilities`, {
      headers: { authorization: 'Bearer admin-token', origin: 'https://other.example.test' },
    });
    expect(wrongOrigin.status).toBe(403);
    const capabilities = await fetch(`${base}/capabilities`, { headers: { authorization: 'Bearer admin-token' } });
    expect(capabilities.status).toBe(200);
    expect((await capabilities.json()).destinations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'manual_export', available: false }),
      expect.objectContaining({ type: 's3_compatible', available: false }),
    ]));
    const start = await fetch(`${base}/jobs`, {
      method: 'POST', headers: { authorization: 'Bearer admin-token', 'content-type': 'application/json' },
      body: JSON.stringify({ destination: 'manual_export' }),
    });
    expect(start.status).toBe(503);
    const forgedDownload = await fetch(`${base}/jobs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/download`, {
      headers: { authorization: 'Bearer ordinary-token' },
    });
    expect(forgedDownload.status).toBe(403);
  });
});
