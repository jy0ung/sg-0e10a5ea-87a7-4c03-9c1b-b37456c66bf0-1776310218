#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: `approval_instances` is the canonical workflow
 * runtime. Runtime application code must not access the legacy
 * `approval_requests` table. A direct release-compatibility test is retained
 * temporarily while the database table/dual-target decision compatibility is
 * still supported.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = [
  join(root, 'src'),
  join(root, 'apps'),
  join(root, 'packages'),
];

const allowedCompatibilityFiles = new Set([
  'src/test/release-workflows.spec.ts',
]);

const ignoredDirs = new Set([
  'dist',
  'node_modules',
  '.git',
  '.turbo',
  '.vite',
  'coverage',
]);

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

type Finding = {
  file: string;
  line: number;
  source: string;
};

const findings: Finding[] = [];
const approvalRequestsCallPattern = /\.from\s*\(\s*['"]approval_requests['"]/;

for (const sourceRoot of sourceRoots) {
  for (const filePath of walk(sourceRoot)) {
    const relativePath = relative(root, filePath);
    if (allowedCompatibilityFiles.has(relativePath)) continue;

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (approvalRequestsCallPattern.test(line)) {
        findings.push({
          file: relativePath,
          line: index + 1,
          source: line.trim(),
        });
      }
    });
  }
}

if (findings.length > 0) {
  console.error('Legacy approval_requests access found in runtime/application code.');
  console.error('Use approval_instances through the canonical workflow engine instead.');
  console.error('');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}`);
    console.error(`  ${finding.source}`);
  }
  process.exit(1);
}

console.info(
  'Workflow boundary check passed: approval_requests has zero runtime application accesses; ' +
    'only explicit release-compatibility coverage is allowlisted.',
);
