import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/db-restore-drill.yml'),
  'utf8',
);

describe('database restore drill workflow safety', () => {
  it('is manual-only', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('schedule:');
  });

  it('uses a successful encrypted backup artifact as its source', () => {
    expect(workflow).toContain('--workflow db-backup.yml');
    expect(workflow).toContain('gh run download');
    expect(workflow).toContain('Encrypted backup checksum mismatch');
  });

  it('restores into an isolated scratch container rather than production', () => {
    expect(workflow).toContain('flc-db-restore-drill-');
    expect(workflow).toContain('createdb -U postgres flc_restore_drill');
    expect(workflow).not.toContain('SUPABASE_DB_URL');
    expect(workflow).not.toContain('SSH_HOST');
  });

  it('decrypts as a stream directly into pg_restore', () => {
    expect(workflow).toMatch(
      /--decrypt "\$ENCRYPTED_FILE"[\s\S]*\| docker exec -i "\$DB_CONTAINER" pg_restore/,
    );
    expect(workflow).not.toMatch(/gpg[\s\S]*--output .*restore\.dump/);
  });

  it('checks critical platform relations after restore', () => {
    for (const relation of [
      'public.profiles',
      'public.employees',
      'public.vehicles',
      'public.deals',
      'public.invoices',
      'public.purchase_invoices',
      'public.accounting_periods',
      'public.tickets',
      'supabase_migrations.schema_migrations',
    ]) {
      expect(workflow).toContain(relation);
    }
  });

  it('always tears down the scratch container and volume', () => {
    expect(workflow).toContain('- name: Cleanup scratch database');
    expect(workflow).toMatch(/Cleanup scratch database\n\s+if: always\(\)/);
    expect(workflow).toContain('docker rm -f');
    expect(workflow).toContain('docker volume rm');
  });
});
