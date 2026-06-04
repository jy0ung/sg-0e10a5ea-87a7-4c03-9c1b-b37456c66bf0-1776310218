#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: app shell metadata and module catalogue helpers
 * are package-owned by @flc/shell. App-local files remain compatibility shims.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

type Finding = { file: string; detail: string };
const findings: Finding[] = [];

function read(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf8');
}

const shellModuleAccess = 'packages/shell/src/moduleAccess.ts';
const shellSource = read(shellModuleAccess);
for (const expected of ['export const platformModules', 'export function resolvePlatformModules', 'export function getModuleIdForPath']) {
  if (!shellSource.includes(expected)) findings.push({ file: shellModuleAccess, detail: `missing ${expected}` });
}

if (!read('packages/shell/src/platformRegistry.ts').includes('export function isFocusedPlatformPath')) {
  findings.push({ file: 'packages/shell/src/platformRegistry.ts', detail: 'missing focused-mode path helper isFocusedPlatformPath' });
}

const shellHrmsWorkspace = 'packages/shell/src/hrmsWorkspace.ts';
const shellHrmsWorkspaceSource = read(shellHrmsWorkspace);
for (const expected of ['export const HRMS_PATHS', 'export function isHrmsWorkspacePath', 'export function getDedicatedHrmsWorkspacePath']) {
  if (!shellHrmsWorkspaceSource.includes(expected)) findings.push({ file: shellHrmsWorkspace, detail: `missing ${expected}` });
}

const shimExpectations = new Map<string, readonly string[]>([
  ['src/lib/moduleAccess.ts', ["from '@flc/shell'"]],
  ['apps/hrms-web/src/lib/moduleAccess.ts', ["from '@flc/shell'"]],
  ['src/data/demo-data.ts', ["export { platformModules } from '@flc/shell';"]],
  ['apps/hrms-web/src/data/demo-data.ts', ["export { platformModules } from '@flc/shell';"]],
  ['src/lib/hrmsWorkspace.ts', ["from '@flc/shell'"]],
  ['apps/hrms-web/src/lib/hrmsWorkspace.ts', ["from '@flc/shell'"]],
  ['src/hooks/useFocusedMode.ts', ["isFocusedPlatformPath", "from '@flc/shell'"]],
  ['apps/hrms-web/src/hooks/useFocusedMode.ts', ["isFocusedPlatformPath", "from '@flc/shell'"]],
]);

for (const [file, expectedLines] of shimExpectations) {
  const source = read(file);
  for (const expectedLine of expectedLines) {
    if (!source.includes(expectedLine)) findings.push({ file, detail: `expected compatibility export: ${expectedLine}` });
  }
  if (/SECTION_TO_MODULE_ID|MODULE_ROUTE_PREFIXES|export const platformModules:\s*PlatformModule\[]|const CORE_MODULE_IDS/.test(source)) {
    findings.push({ file, detail: 'must not define app-local module catalogue or module-gate maps' });
  }
  if (/HRMS_ROUTE_ALIASES|function normalizeHrmsWorkspacePath|function buildAbsoluteWorkspaceUrl/.test(source)) {
    findings.push({ file, detail: 'must not define app-local HRMS workspace path semantics' });
  }
  if (/const MODULE_PREFIXES|\/auto-aging|\/purchasing/.test(source) && file.endsWith('useFocusedMode.ts')) {
    findings.push({ file, detail: 'must not define app-local focused-mode prefixes' });
  }
}

if (findings.length > 0) {
  console.error('Shell module boundary violation found.');
  console.error('Keep module catalogue and module-gate resolution package-owned in @flc/shell.');
  console.error('');
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.detail}`);
  process.exit(1);
}

console.info('Shell module boundary check passed: module catalogue, module access helpers, focused-mode detection, and HRMS workspace path semantics are package-owned.');
