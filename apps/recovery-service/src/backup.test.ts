import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, stat, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackupManager } from './backup.js';

const temporary: string[] = [];
const originalPath = process.env.PATH;
const originalGnupgHome = process.env.GNUPGHOME;
const originalTestRoot = process.env.RECOVERY_TEST_ROOT;

afterEach(async () => {
  process.env.PATH = originalPath;
  if (originalGnupgHome === undefined) delete process.env.GNUPGHOME;
  else process.env.GNUPGHOME = originalGnupgHome;
  if (originalTestRoot === undefined) delete process.env.RECOVERY_TEST_ROOT;
  else process.env.RECOVERY_TEST_ROOT = originalTestRoot;
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

async function waitForCompletion(manager: BackupManager, id: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const job = manager.get(id)!;
    if (job.state === 'completed' || job.state === 'failed') return job;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Backup did not finish');
}

describe('manual encrypted backup worker', () => {
  it('keeps the capability unavailable until server-side inputs are configured', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubs-recovery-test-'));
    temporary.push(root);
    const manager = new BackupManager(join(root, 'exports'), null);
    await manager.initialize();
    expect(manager.available).toBe(false);
    await expect(manager.start('actor')).rejects.toThrow('not configured');
  });

  it('marks an interrupted job failed and removes its incomplete archive on restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubs-recovery-test-'));
    temporary.push(root);
    const exports = join(root, 'exports');
    await mkdir(exports);
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await writeFile(join(exports, `${id}.json`), JSON.stringify({
      id, state: 'running', destination: 'manual_export', startedAt: new Date().toISOString(), auditEvents: [],
    }));
    await writeFile(join(exports, `${id}.tar.gpg`), 'incomplete');
    const manager = new BackupManager(exports, null);
    await manager.initialize();
    expect(manager.get(id)?.state).toBe('failed');
    await expect(stat(join(exports, `${id}.tar.gpg`))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('streams an encrypted archive, validates it, records integrity and audits download', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ubs-recovery-test-'));
    temporary.push(root);
    const bin = join(root, 'bin');
    const gnupgHome = join(root, 'gnupg');
    await mkdir(bin);
    await mkdir(gnupgHome, { mode: 0o700 });
    process.env.GNUPGHOME = gnupgHome;
    for (const [name, body] of [
      ['pg_dump', '#!/bin/sh\ntar -cf - -C "$RECOVERY_TEST_ROOT" sample.txt\n'],
      ['psql', '#!/bin/sh\nprintf "15.0\\n"\n'],
    ] as const) {
      const path = join(bin, name);
      await writeFile(path, body);
      await chmod(path, 0o755);
    }
    process.env.PATH = `${bin}:${originalPath}`;
    process.env.RECOVERY_TEST_ROOT = root;
    // The decrypted payload exceeds a pipe buffer; validation must consume it
    // all rather than stopping after the tar catalogue.
    await writeFile(join(root, 'sample.txt'), Buffer.concat([
      Buffer.from('sample backup bytes'), Buffer.alloc(2_000_000, 0x61),
    ]));
    const manager = new BackupManager(join(root, 'exports'), {
      databaseUrl: 'postgresql://test:secret@127.0.0.1:5432/fixture',
      passphrase: 'long-local-test-passphrase', exportDir: join(root, 'exports'),
      applicationVersion: 'test-commit',
    });
    await manager.initialize();
    const started = await manager.start('admin-id');
    const finished = await waitForCompletion(manager, started.id);
    expect(finished.state).toBe('completed');
    expect(finished.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(finished.sizeBytes).toBeGreaterThan(20);
    expect(finished.databaseVersion).toBe('15.0');
    expect(finished.applicationVersion).toBe('test-commit');
    expect(finished.auditEvents).toEqual([{ action: 'started', actorId: 'admin-id', at: expect.any(String) }]);
    const archive = await manager.verifiedArchive(started.id);
    expect(archive).not.toBeNull();
    expect((await stat(archive!.path)).mode & 0o077).toBe(0);
    expect((await readFile(archive!.path)).includes(Buffer.from('sample backup bytes'))).toBe(false);
    await manager.recordDownload(started.id, 'admin-id');
    expect(manager.get(started.id)?.auditEvents.at(-1)?.action).toBe('download_started');
    await writeFile(archive!.path, 'tampered');
    expect(await manager.verifiedArchive(started.id)).toBeNull();
  }, 15_000);
});
