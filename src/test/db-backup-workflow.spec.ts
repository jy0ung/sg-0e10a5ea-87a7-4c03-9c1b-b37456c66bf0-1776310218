import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/db-backup.yml'),
  'utf8',
);

describe('database backup workflow safety', () => {
  it('does not require a directly reachable production database URL', () => {
    expect(workflow).not.toContain('SUPABASE_DB_URL');
    expect(workflow).toContain('docker exec');
    expect(workflow).toContain('pg_dump');
  });

  it('streams the dump through SSH and encrypts it before writing the backup artifact', () => {
    expect(workflow).toMatch(
      /ssh backup-target[\s\S]*pg_dump[\s\S]*\| gpg/,
    );
    expect(workflow).not.toContain('--file "$dump_file"');
  });

  it('requires a dedicated backup encryption secret', () => {
    expect(workflow).toContain('DB_BACKUP_GPG_PASSPHRASE');
    expect(workflow).toContain('Missing required secret');
  });

  it('validates both the checksum and pg_restore catalogue before upload', () => {
    expect(workflow).toContain('sha256sum --check');
    expect(workflow).toContain('pg_restore --list');
  });

  it('retains encrypted Actions artifacts even when S3 is not configured', () => {
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('retention-days: 7');
  });
});
