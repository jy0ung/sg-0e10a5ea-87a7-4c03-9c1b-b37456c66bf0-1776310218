import { createReadStream } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { authorizeRecoveryAdmin, type AuthConfig } from './auth.js';
import { BackupManager, type BackupConfig, type DestinationType } from './backup.js';

type Authorize = (token: string, config: AuthConfig) => Promise<string | null>;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function smallJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 1024) throw new Error('Request body too large');
  }
  const value = JSON.parse(body || '{}') as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}

export function createRecoveryServer(
  manager: BackupManager,
  auth: AuthConfig,
  allowedOrigin: string,
  authorize: Authorize = authorizeRecoveryAdmin,
) {
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && origin !== allowedOrigin) {
      json(response, 403, { error: 'Origin is not allowed' });
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/healthz') {
      json(response, 200, { status: 'ok' });
      return;
    }
    const bearer = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '');
    const actorId = bearer ? await authorize(bearer[1], auth) : null;
    if (!actorId) {
      json(response, 403, { error: 'Recovery administrator access is required' });
      return;
    }

    if (request.method === 'GET' && path === '/capabilities') {
      json(response, 200, {
        destinations: manager.destinations(),
        restoreAvailable: false,
      });
      return;
    }
    if (request.method === 'GET' && path === '/jobs') {
      json(response, 200, { jobs: manager.list() });
      return;
    }
    if (request.method === 'POST' && path === '/jobs') {
      let body: Record<string, unknown>;
      try { body = await smallJsonBody(request); }
      catch { json(response, 400, { error: 'Invalid backup request' }); return; }
      if (typeof body.destination !== 'string' || !manager.destinations().some(item => item.type === body.destination)) {
        json(response, 400, { error: 'Select an available destination' });
        return;
      }
      if (!manager.destinations().some(item => item.type === body.destination && item.available)) {
        json(response, 503, { error: 'Selected destination is not configured' }); return;
      }
      if (manager.busy) { json(response, 409, { error: 'A backup is already running' }); return; }
      try { json(response, 202, { job: await manager.start(actorId, body.destination as DestinationType) }); }
      catch { json(response, 500, { error: 'Backup could not be started' }); }
      return;
    }
    const match = /^\/jobs\/([0-9a-f-]{36})(?:\/(download))?$/.exec(path);
    if (request.method === 'GET' && match) {
      const [,, download] = match;
      const id = match[1];
      if (!download) {
        const job = manager.get(id);
        json(response, job ? 200 : 404, job ? { job } : { error: 'Backup not found' });
        return;
      }
      const archive = await manager.verifiedArchive(id);
      if (!archive) { json(response, 404, { error: 'Verified backup is unavailable' }); return; }
      try { await manager.recordDownload(id, actorId); }
      catch { json(response, 500, { error: 'Download audit could not be recorded' }); return; }
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': archive.size,
        'Content-Disposition': `attachment; filename="ubs-backup-${id}.tar.gpg"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      createReadStream(archive.path).on('error', () => response.destroy()).pipe(response);
      return;
    }
    json(response, 404, { error: 'Recovery endpoint not found' });
  });
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.RECOVERY_SUPABASE_URL;
  const anonKey = process.env.RECOVERY_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.RECOVERY_SUPABASE_SERVICE_ROLE_KEY;
  const allowedOrigin = process.env.RECOVERY_ALLOWED_ORIGIN;
  const exportDir = process.env.RECOVERY_EXPORT_DIR;
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !allowedOrigin || !exportDir) {
    throw new Error('Recovery auth, allowed origin and export directory must be configured');
  }
  const databaseUrl = process.env.RECOVERY_DATABASE_URL;
  const passphrase = process.env.RECOVERY_GPG_PASSPHRASE;
  const backup: BackupConfig | null = databaseUrl && passphrase
    ? { databaseUrl, passphrase, exportDir, applicationVersion: process.env.RECOVERY_APP_VERSION }
    : null;
  const manager = new BackupManager(exportDir, backup);
  await manager.initialize();
  const server = createRecoveryServer(manager, { supabaseUrl, anonKey, serviceRoleKey }, allowedOrigin);
  const host = process.env.RECOVERY_BIND_HOST || '127.0.0.1';
  const port = Number(process.env.RECOVERY_PORT || '8787');
  server.listen(port, host);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.exitCode = 1; });
}
