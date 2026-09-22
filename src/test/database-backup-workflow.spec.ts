import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/db-backup.yml'),
  'utf8',
);

describe('database backup workflow safety boundary', () => {
  it('keeps encryption material mandatory regardless of transport', () => {
    expect(workflow).toContain('Missing required secret: DB_BACKUP_GPG_PASSPHRASE');
    expect(workflow).toContain('--cipher-algo AES256');
    expect(workflow).toContain('--passphrase-fd 0');
    expect(workflow).not.toContain('--passphrase "$DB_BACKUP_GPG_PASSPHRASE"');
  });

  it('prefers a direct DB URL but can fall back to the existing Cloudflare Access SSH path', () => {
    expect(workflow).toContain('if [[ -n "${SUPABASE_DB_URL:-}" ]]');
    expect(workflow).toContain('echo "mode=direct"');
    expect(workflow).toContain('echo "mode=ssh"');
    expect(workflow).toContain('ProxyCommand cloudflared access ssh --hostname %h');
    expect(workflow).toContain("ssh -T backup-target 'bash -se'");
  });

  it('streams pg_dump from the host-local Supabase DB container without exposing a remote DB URL', () => {
    expect(workflow).toContain("grep -E '^supabase_db_'");
    expect(workflow).toContain('docker exec "$db_container" pg_dump');
    expect(workflow).toContain('--format=custom');
    expect(workflow).toContain('--no-owner');
    expect(workflow).toContain('--no-privileges');
  });

  it('validates the custom dump and its encrypted checksum before upload', () => {
    expect(workflow).toContain('test -s "$dump_file"');
    expect(workflow).toContain('pg_restore --list "$dump_file"');
    expect(workflow).toContain('sha256sum "$encrypted_file" > "$checksum_file"');
    expect(workflow).toContain('sha256sum -c "$checksum_file"');
  });

  it('never uploads the plaintext dump artifact', () => {
    const artifactStep = workflow.slice(
      workflow.indexOf('- name: Upload encrypted dump artifact'),
      workflow.indexOf('- name: Summary'),
    );
    expect(artifactStep).toContain('${{ steps.dump.outputs.encrypted_file }}');
    expect(artifactStep).toContain('${{ steps.dump.outputs.checksum_file }}');
    expect(artifactStep).not.toContain('dump_file');
  });

  it('records non-sensitive restore metadata without weakening transport safety', () => {
    expect(workflow).toContain('- name: Capture backup source metadata');
    expect(workflow).toContain('postgres_version=');
    expect(workflow).toContain('database_image=');
    expect(workflow).toContain('metadata_file=');
    expect(workflow).toContain('${{ steps.dump.outputs.metadata_file }}');
    expect(workflow).toContain('PGDATABASE="$SUPABASE_DB_URL" pg_dump');
    expect(workflow).not.toContain('pg_dump "$SUPABASE_DB_URL"');
  });

  it('cleans plaintext even when encryption or upload preparation fails', () => {
    expect(workflow).toContain('trap cleanup_plaintext EXIT');
    expect(workflow).toContain('cleanup_plaintext');
    expect(workflow).toContain('Plaintext dump retained: `no`');
  });
});
