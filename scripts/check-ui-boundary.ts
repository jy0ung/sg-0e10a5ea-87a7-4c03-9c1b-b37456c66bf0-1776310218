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

for (const [file, expected] of [
  ['packages/ui/src/PageHeader.tsx', 'export function PageHeader'],
  ['packages/ui/src/PageSpinner.tsx', 'export function PageSpinner'],
] as const) {
  const source = read(file);
  if (!source.includes(expected)) findings.push({ file, detail: `missing shared export ${expected}` });
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

for (const [file, packagePath, forbiddenPattern] of [
  ['src/components/shared/PageHeader.tsx', '@flc/ui/PageHeader', /ChevronRight|breadcrumbs\.map|react-router-dom/],
  ['apps/hrms-web/src/components/shared/PageHeader.tsx', '@flc/ui/PageHeader', /ChevronRight|breadcrumbs\.map|react-router-dom/],
  ['src/components/shared/PageSpinner.tsx', '@flc/ui/PageSpinner', /Loader2|ariaLabel|role="status"/],
  ['apps/hrms-web/src/components/shared/PageSpinner.tsx', '@flc/ui/PageSpinner', /Loader2|ariaLabel|role="status"/],
] as const) {
  const source = read(file);
  if (!source.includes(`from '${packagePath}'`)) {
    findings.push({ file, detail: `must re-export from ${packagePath}` });
  }
  if (forbiddenPattern.test(source)) {
    findings.push({ file, detail: 'must remain a compatibility shim, not an app-local implementation' });
  }
}

if (findings.length > 0) {
  console.error('UI package boundary violation found.');
  console.error('Keep shared UI tokens and primitives package-owned in @flc/ui.');
  console.error('');
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.detail}`);
  process.exit(1);
}

console.info('UI boundary check passed: shared status tones, PageHeader, and PageSpinner are package-owned in @flc/ui.');
