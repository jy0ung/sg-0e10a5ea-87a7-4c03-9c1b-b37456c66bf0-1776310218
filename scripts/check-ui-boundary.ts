#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: shared UI tokens and primitives should live in
 * @flc/ui. App-local files remain compatibility shims during migration.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

type Finding = { file: string; detail: string };
const findings: Finding[] = [];

function read(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf8');
}

const packageFile = 'packages/ui/src/statusTones.ts';
const packageSource = read(packageFile);
for (const expected of ['export type Tone', 'export const TONE_CLASSES', 'export function toneClass']) {
  if (!packageSource.includes(expected)) findings.push({ file: packageFile, detail: `missing shared export ${expected}` });
}

for (const file of ['src/lib/statusTones.ts', 'apps/hrms-web/src/lib/statusTones.ts']) {
  const source = read(file);
  if (!source.includes("from '@flc/ui/statusTones'")) {
    findings.push({ file, detail: 'must re-export status tone classes from @flc/ui/statusTones' });
  }
  if (/Record<Tone,\s*string>|bg-amber-100|dark:bg-amber/.test(source)) {
    findings.push({ file, detail: 'must not define app-local tone class maps' });
  }
}

if (findings.length > 0) {
  console.error('UI package boundary violation found.');
  console.error('Keep shared UI tone tokens package-owned in @flc/ui.');
  console.error('');
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.detail}`);
  process.exit(1);
}

console.info('UI boundary check passed: status tone classes are package-owned in @flc/ui.');
