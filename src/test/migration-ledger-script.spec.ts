import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve(process.cwd(), 'scripts/verify-migration-ledger.sh');
const tempDirs: string[] = [];

function fixture(manifest: string, applied: string) {
  const dir = mkdtempSync(resolve(tmpdir(), 'flc-migration-ledger-'));
  tempDirs.push(dir);
  const manifestPath = resolve(dir, 'manifest.txt');
  const appliedPath = resolve(dir, 'applied.txt');
  writeFileSync(manifestPath, manifest);
  writeFileSync(appliedPath, applied);
  return { manifestPath, appliedPath };
}

function run(manifestPath: string, appliedPath: string) {
  return spawnSync(
    'bash',
    [script, '--manifest', manifestPath, '--applied-versions-file', appliedPath],
    { encoding: 'utf8' },
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('production migration ledger verifier', () => {
  it('passes when every release migration is applied', () => {
    const { manifestPath, appliedPath } = fixture(
      [
        '20260915090000_production_readiness_security.sql',
        '20260915100000_approval_decision_compatibility.sql',
      ].join('\n'),
      ['20260915090000', '20260915100000'].join('\n'),
    );

    const result = run(manifestPath, appliedPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Migration compatibility passed');
  });

  it('allows the database to be ahead so rollback images remain deployable', () => {
    const { manifestPath, appliedPath } = fixture(
      '20260915090000_production_readiness_security.sql\n',
      ['20260915090000', '20260915100000'].join('\n'),
    );

    const result = run(manifestPath, appliedPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('allowed for rollback compatibility');
  });

  it('fails when a release migration is absent from the database ledger', () => {
    const { manifestPath, appliedPath } = fixture(
      [
        '20260915090000_production_readiness_security.sql',
        '20260915100000_approval_decision_compatibility.sql',
      ].join('\n'),
      '20260915090000\n',
    );

    const result = run(manifestPath, appliedPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('20260915100000');
    expect(result.stderr).toContain('Do not promote');
  });

  it('rejects malformed migration filenames instead of silently ignoring them', () => {
    const { manifestPath, appliedPath } = fixture(
      'not-a-valid-migration.sql\n',
      '20260915090000\n',
    );

    const result = run(manifestPath, appliedPath);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Invalid migration filename');
  });
});
