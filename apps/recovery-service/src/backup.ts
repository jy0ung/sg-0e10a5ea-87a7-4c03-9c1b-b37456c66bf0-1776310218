import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { Writable } from 'node:stream';

export type BackupState = 'running' | 'validating' | 'completed' | 'failed';
export type DestinationType = 'manual_export' | 'local_nas' | 's3_compatible' | 'cloud_object';
export interface DestinationProvider {
  readonly type: DestinationType;
  readonly label: string;
  deliver(encryptedArchivePath: string, job: BackupJob): Promise<void>;
}
export interface BackupJob {
  id: string;
  state: BackupState;
  destination: DestinationType;
  startedAt: string;
  finishedAt?: string;
  sizeBytes?: number;
  sha256?: string;
  databaseVersion?: string | null;
  schemaVersion?: string | null;
  applicationVersion?: string | null;
  error?: string;
  auditEvents: Array<{ action: 'started' | 'download_started'; actorId: string; at: string }>;
}

export interface BackupConfig {
  databaseUrl: string;
  passphrase: string;
  exportDir: string;
  applicationVersion?: string;
}

const manualExport: DestinationProvider = {
  type: 'manual_export',
  label: 'Encrypted manual export',
  async deliver() { /* Retain the verified archive for authorized download. */ },
};
const destinationLabels: Array<{ type: DestinationType; label: string }> = [
  { type: 'manual_export', label: 'Encrypted manual export' },
  { type: 'local_nas', label: 'Local or NAS' },
  { type: 's3_compatible', label: 'S3-compatible storage' },
  { type: 'cloud_object', label: 'Cloud object storage' },
];

function postgresEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error('RECOVERY_DATABASE_URL must be a PostgreSQL connection URL');
  }
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get('sslmode') ?? 'prefer',
    PGCONNECT_TIMEOUT: '10',
  };
}

function waitFor(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Backup tool failed')));
  });
}

function providePassphrase(child: ChildProcess, passphrase: string): void {
  const input = child.stdio[3] as Writable;
  input.on('error', () => undefined);
  input.end(`${passphrase}\n`);
}

async function encryptedDump(config: BackupConfig, outputPath: string): Promise<void> {
  const env = postgresEnvironment(config.databaseUrl);
  const dump = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-acl'], {
    env, stdio: ['ignore', 'pipe', 'ignore'],
  });
  const encrypt = spawn('gpg', [
    '--batch', '--yes', '--no-symkey-cache', '--pinentry-mode', 'loopback',
    '--passphrase-fd', '3', '--symmetric', '--cipher-algo', 'AES256',
    '--output', outputPath,
  ], { stdio: ['pipe', 'ignore', 'ignore', 'pipe'] });
  providePassphrase(encrypt, config.passphrase);
  encrypt.stdin!.on('error', () => undefined);
  dump.stdout!.pipe(encrypt.stdin!);
  const outcomes = await Promise.allSettled([waitFor(dump), waitFor(encrypt)]);
  if (outcomes.some(result => result.status === 'rejected')) throw new Error('Encrypted dump failed');
}

async function validateArchive(config: BackupConfig, inputPath: string): Promise<void> {
  const decrypt = spawn('gpg', [
    '--batch', '--no-symkey-cache', '--pinentry-mode', 'loopback',
    '--passphrase-fd', '3', '--decrypt', inputPath,
  ], { stdio: ['ignore', 'pipe', 'ignore', 'pipe'] });
  const inspect = spawn('pg_restore', ['--list'], { stdio: ['pipe', 'pipe', 'ignore'] });
  providePassphrase(decrypt, config.passphrase);
  inspect.stdin!.on('error', () => undefined);
  decrypt.stdout!.pipe(inspect.stdin!);
  inspect.stdout!.resume();
  const outcomes = await Promise.allSettled([waitFor(decrypt), waitFor(inspect)]);
  if (outcomes.some(result => result.status === 'rejected')) throw new Error('Encrypted archive validation failed');
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function databaseMetadata(config: BackupConfig): Promise<{ databaseVersion: string | null; schemaVersion: string | null }> {
  const env = postgresEnvironment(config.databaseUrl);
  const query = async (sql: string): Promise<string | null> => {
    const child = spawn('psql', ['-XAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      env, stdio: ['ignore', 'pipe', 'ignore'],
    });
    let output = '';
    child.stdout!.on('data', chunk => { output += String(chunk).slice(0, 256); });
    try { await waitFor(child); return output.trim().slice(0, 128) || null; }
    catch { return null; }
  };
  return {
    databaseVersion: await query("select current_setting('server_version')"),
    schemaVersion: await query('select max(version) from supabase_migrations.schema_migrations'),
  };
}

export class BackupManager {
  private readonly jobs = new Map<string, BackupJob>();
  private running = false;
  private readonly providers = new Map<DestinationType, DestinationProvider>();

  constructor(private readonly exportDir: string, private readonly config: BackupConfig | null) {
    if (!isAbsolute(exportDir)) throw new Error('RECOVERY_EXPORT_DIR must be absolute');
    if (config && (config.passphrase.length < 16 || /[\r\n]/.test(config.passphrase))) {
      throw new Error('RECOVERY_GPG_PASSPHRASE must be at least 16 characters and one line');
    }
    if (config) this.providers.set(manualExport.type, manualExport);
  }

  get available(): boolean { return this.providers.has('manual_export'); }
  get busy(): boolean { return this.running; }
  destinations(): Array<{ type: DestinationType; label: string; available: boolean }> {
    return destinationLabels.map(destination => ({ ...destination, available: this.providers.has(destination.type) }));
  }
  list(): BackupJob[] { return [...this.jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
  get(id: string): BackupJob | undefined { return this.jobs.get(id); }

  private metadataPath(id: string): string { return join(this.exportDir, `${id}.json`); }
  private archivePath(id: string): string { return join(this.exportDir, `${id}.dump.gpg`); }

  async initialize(): Promise<void> {
    process.umask(0o077);
    await mkdir(this.exportDir, { recursive: true, mode: 0o700 });
    await chmod(this.exportDir, 0o700);
    for (const name of await readdir(this.exportDir)) {
      if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
      try {
        const job = JSON.parse(await readFile(join(this.exportDir, name), 'utf8')) as BackupJob;
        if (job.id !== name.slice(0, -5)) continue;
        if (job.state === 'running' || job.state === 'validating') {
          job.state = 'failed';
          job.error = 'The backup worker stopped before completion';
          job.finishedAt = new Date().toISOString();
          await unlink(this.archivePath(job.id)).catch(() => undefined);
          await this.save(job);
        }
        this.jobs.set(job.id, job);
      } catch { /* Ignore malformed metadata rather than exposing or deleting unknown files. */ }
    }
  }

  private async save(job: BackupJob): Promise<void> {
    this.jobs.set(job.id, { ...job });
    const temporary = `${this.metadataPath(job.id)}.tmp`;
    await writeFile(temporary, JSON.stringify(job), { mode: 0o600 });
    await rename(temporary, this.metadataPath(job.id));
  }

  async start(actorId: string, destination: DestinationType = 'manual_export'): Promise<BackupJob> {
    if (!this.config) throw new Error('Manual backup is not configured');
    const provider = this.providers.get(destination);
    if (!provider) throw new Error('Selected backup destination is not configured');
    if (this.running) throw new Error('A backup is already running');
    this.running = true;
    const job: BackupJob = {
      id: randomUUID(), state: 'running', destination,
      startedAt: new Date().toISOString(), applicationVersion: this.config.applicationVersion ?? null,
      auditEvents: [{ action: 'started', actorId, at: new Date().toISOString() }],
    };
    try { await this.save(job); }
    catch (error) { this.running = false; throw error; }
    void this.run(job, this.config, provider).catch(() => undefined).finally(() => { this.running = false; });
    return job;
  }

  private async run(job: BackupJob, config: BackupConfig, provider: DestinationProvider): Promise<void> {
    const path = this.archivePath(job.id);
    try {
      await encryptedDump(config, path);
      job.state = 'validating';
      await this.save(job);
      await validateArchive(config, path);
      const info = await stat(path);
      if (info.size === 0) throw new Error('Empty backup archive');
      const versions = await databaseMetadata(config);
      await provider.deliver(path, job);
      Object.assign(job, versions, {
        state: 'completed', sizeBytes: info.size, sha256: await sha256File(path),
        finishedAt: new Date().toISOString(),
      });
    } catch {
      await unlink(path).catch(() => undefined);
      job.state = 'failed';
      job.error = 'Backup or integrity validation failed; no export is available';
      job.finishedAt = new Date().toISOString();
    }
    await this.save(job);
  }

  async verifiedArchive(id: string): Promise<{ path: string; size: number } | null> {
    const job = this.jobs.get(id);
    if (!job || job.state !== 'completed' || !job.sha256) return null;
    const path = this.archivePath(id);
    try {
      const info = await stat(path);
      if (info.size !== job.sizeBytes || await sha256File(path) !== job.sha256) return null;
      return { path, size: info.size };
    } catch { return null; }
  }

  async recordDownload(id: string, actorId: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job || job.state !== 'completed') throw new Error('Backup is not downloadable');
    job.auditEvents.push({ action: 'download_started', actorId, at: new Date().toISOString() });
    await this.save(job);
  }
}
