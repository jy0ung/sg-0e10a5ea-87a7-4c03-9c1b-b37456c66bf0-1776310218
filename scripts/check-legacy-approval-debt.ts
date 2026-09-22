#!/usr/bin/env -S npx tsx
/**
 * Permanent anti-regression gate for the retired legacy approval engine.
 *
 * The application runtime has migrated to approval_instances. The historical
 * approval_requests table may remain for data/migration compatibility, but:
 *   - the deleted approvalEngineService files must not return;
 *   - no runtime code may import an approvalEngineService;
 *   - no runtime source may access approval_requests.
 *
 * check:workflow-boundary independently allows only the explicit release
 * compatibility test to touch approval_requests.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = [join(root, 'src'), join(root, 'apps'), join(root, 'packages')];

const retiredLegacyFiles = [
  'src/services/approvalEngineService.ts',
  'apps/hrms-web/src/services/approvalEngineService.ts',
];

const allowedCompatibilityFiles = new Set([
  'src/test/release-workflows.spec.ts',
]);

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

const findings: string[] = [];

for (const relativePath of retiredLegacyFiles) {
  if (existsSync(join(root, relativePath))) {
    findings.push(`retired legacy service exists: ${relativePath}`);
  }
}

for (const sourceRoot of sourceRoots) {
  for (const filePath of walk(sourceRoot)) {
    const relativePath = relative(root, filePath);
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

    lines.forEach((line, index) => {
      if (legacyServiceImportPattern.test(line)) {
        findings.push(`legacy service import: ${relativePath}:${index + 1}: ${line.trim()}`);
      }

      if (
        approvalRequestsAccessPattern.test(line) &&
        !allowedCompatibilityFiles.has(relativePath)
      ) {
        findings.push(`runtime approval_requests access: ${relativePath}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

if (findings.length > 0) {
  console.error('Legacy approval-engine retirement regression detected.');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.info(
  'Legacy approval debt check passed: legacy approvalEngineService files/importers are absent ' +
    'and approval_requests has zero runtime application accesses.',
);
