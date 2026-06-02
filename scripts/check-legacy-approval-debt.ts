#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: quantify and ratchet down the legacy
 * `approval_requests` strangler so "legacy compatibility" cannot become
 * permanent (ENTERPRISE_REARCHITECTURE.md §51, §108, §188; ADR 0003).
 *
 * `check:workflow-boundary` already blocks NEW `.from('approval_requests')`
 * call sites outside the two compatibility files. This gate adds the two
 * checks that one misses:
 *
 *   1. A retirement counter: the number of `approval_requests` data accesses
 *      inside the allowlisted legacy files. It is a one-way ratchet — the
 *      count may shrink (lower the baseline when it does) but must never grow.
 *   2. An importer guard: nothing outside the allowlisted legacy files may
 *      import the legacy `approvalEngineService`. This catches live callers of
 *      the legacy engine (e.g. a review dialog) that the boundary gate, which
 *      only scans `.from(...)`, does not see.
 *
 * When the count reaches 0 and no importers remain, the legacy files can be
 * deleted and this gate (plus the allowlist) retired.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = [join(root, 'src'), join(root, 'apps'), join(root, 'packages')];

const allowedLegacyFiles = new Set([
  'src/services/approvalEngineService.ts',
  'apps/hrms-web/src/services/approvalEngineService.ts',
]);

// One-way ratchet. Lower this when legacy accesses are removed; never raise it.
const APPROVAL_REQUESTS_ACCESS_BASELINE = 14;

const ignoredDirs = new Set(['dist', 'node_modules', '.git', '.turbo', '.vite', 'coverage']);

const approvalRequestsAccessPattern = /\.from\s*\(\s*['"]approval_requests['"]/;
const legacyServiceImportPattern =
  /(?:from\s+['"][^'"]*approvalEngineService['"]|import\s*\(\s*['"][^'"]*approvalEngineService['"])/;

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (!ignoredDirs.has(entry)) files.push(...walk(full));
      continue;
    }

    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) files.push(full);
  }

  return files;
}

let accessCount = 0;
const importers: { file: string; line: number; source: string }[] = [];

for (const sourceRoot of sourceRoots) {
  for (const filePath of walk(sourceRoot)) {
    const relativePath = relative(root, filePath);
    const isLegacyFile = allowedLegacyFiles.has(relativePath);
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

    lines.forEach((line, index) => {
      if (isLegacyFile) {
        if (approvalRequestsAccessPattern.test(line)) accessCount += 1;
        return;
      }
      if (legacyServiceImportPattern.test(line)) {
        importers.push({ file: relativePath, line: index + 1, source: line.trim() });
      }
    });
  }
}

let failed = false;

if (importers.length > 0) {
  failed = true;
  console.error('Legacy approvalEngineService is imported outside the compatibility island.');
  console.error('Route approvals through the canonical approval_instances engine instead.');
  console.error('');
  for (const importer of importers) {
    console.error(`- ${importer.file}:${importer.line}`);
    console.error(`  ${importer.source}`);
  }
  console.error('');
}

if (accessCount > APPROVAL_REQUESTS_ACCESS_BASELINE) {
  failed = true;
  console.error(
    `Legacy approval_requests accesses increased: ${accessCount} found, baseline is ${APPROVAL_REQUESTS_ACCESS_BASELINE}.`,
  );
  console.error('This counter is a one-way ratchet — it must not grow. Remove the new access.');
  console.error('');
}

if (failed) process.exit(1);

const headroom = APPROVAL_REQUESTS_ACCESS_BASELINE - accessCount;
console.info(
  `Legacy approval debt check passed: ${accessCount} approval_requests accesses remain across ` +
    `${allowedLegacyFiles.size} legacy files (baseline ${APPROVAL_REQUESTS_ACCESS_BASELINE}, no external importers).`,
);
if (headroom > 0) {
  console.info(`Ratchet headroom: lower APPROVAL_REQUESTS_ACCESS_BASELINE to ${accessCount} to lock in progress.`);
}
