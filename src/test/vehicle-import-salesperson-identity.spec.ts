import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Vehicle import salesperson identity boundary', () => {
  const publishSources = [
    read('src/lib/import-publish.ts'),
    read('apps/hrms-web/src/lib/import-publish.ts'),
  ];

  const importServices = [
    read('src/services/importService.ts'),
    read('apps/hrms-web/src/services/importService.ts'),
  ];

  const importPreview = read('src/pages/auto-aging/ImportCenter.tsx');
  const commitMigration = read(
    'supabase/migrations/20260511090000_concurrency_hardening.sql',
  );

  it('does not accept or use a name-to-ID map when publishing canonical vehicles', () => {
    for (const source of publishSources) {
      expect(source).not.toContain('nameToIdMap');
      expect(source).not.toContain('resolveNamesToIds');
      expect(source).not.toMatch(/salesman_id\s*:/);
    }
  });

  it('does not resolve salesperson names or write salesman_id from either import service', () => {
    for (const source of importServices) {
      expect(source).not.toContain('resolveNamesToIds');
      expect(source).not.toContain('nameToIdMap');
      expect(source).not.toMatch(/salesman_id\s*:/);
      expect(source).toContain('salesman_name: vehicle.salesman_name');
    }
  });

  it('does not resolve salesperson names during import preview', () => {
    expect(importPreview).not.toContain('resolveNamesToIds');
    expect(importPreview).not.toContain('nameToIdMap');
    expect(importPreview).toContain(
      'publishCanonical(cleanRows, branchMap, paymentMap)',
    );
  });

  it('keeps the transactional import DB path preservation-safe for existing local salesperson links', () => {
    expect(commitMigration).toContain(
      'salesman_id                = coalesce(excluded.salesman_id, vehicles.salesman_id)',
    );
  });
});
