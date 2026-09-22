import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/db-restore-drill.yml'),
  'utf8',
);

describe('database restore drill workflow safety boundary', () => {
  it('is manual-only and cannot run on a schedule', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('schedule:');
  });

  it('uses only successful encrypted backup artifacts as restore sources', () => {
    expect(workflow).toContain('--workflow db-backup.yml');
    expect(workflow).toContain('gh run view "$run_id" --json conclusion');
    expect(workflow).toContain('Encrypted backup checksum mismatch.');
    expect(workflow).toContain('Backup metadata not found');
  });

  it('never connects the scratch restore to production networking', () => {
    expect(workflow).toContain('--network none');
    expect(workflow).not.toContain('SUPABASE_DB_URL');
    expect(workflow).not.toContain('SSH_HOST');
    expect(workflow).not.toContain('CF_ACCESS_CLIENT_ID');
  });

  it('decrypts directly into pg_restore without a plaintext restore file', () => {
    expect(workflow).toContain('--passphrase-fd 3');
    expect(workflow).toMatch(
      /--decrypt "\$ENCRYPTED_FILE"[\s\S]*\| docker exec -i "\$DB_CONTAINER" pg_restore/,
    );
    expect(workflow).not.toMatch(/--output .*restore.*\.dump/i);
  });

  it('requires a dedicated scratch image and validates restored platform relations', () => {
    expect(workflow).toContain('Backup metadata has no database image. Supply the restore_image workflow input explicitly.');
    expect(workflow).toContain('flc-db-restore-drill-${GITHUB_RUN_ID}');
    expect(workflow).toContain('createdb -U postgres flc_restore_drill');
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

  it('records restore timing evidence and always destroys scratch state', () => {
    expect(workflow).toContain('restore_duration_seconds=');
    expect(workflow).toContain('logical_backup_age_seconds=');
    expect(workflow).toContain('- name: Cleanup scratch database');
    expect(workflow).toMatch(/Cleanup scratch database\n\s+if: always\(\)/);
    expect(workflow).toContain('docker rm -f');
    expect(workflow).toContain('docker volume rm');
  });
});
