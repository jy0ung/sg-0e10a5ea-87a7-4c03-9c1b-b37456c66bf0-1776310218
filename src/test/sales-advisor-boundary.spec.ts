import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function runtimeFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = resolve(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...runtimeFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\./.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe('Sales Advisor canonical data boundary', () => {
  it('does not access the legacy sales_advisors table from runtime application code', () => {
    const roots = [
      resolve(process.cwd(), 'src'),
      resolve(process.cwd(), 'apps/hrms-web/src'),
      resolve(process.cwd(), 'packages/hrms-services/src'),
    ];

    const offenders = roots
      .flatMap(runtimeFiles)
      .filter(path => readFileSync(path, 'utf8').includes(".from('sales_advisors')"));

    expect(offenders).toEqual([]);
  });
});
