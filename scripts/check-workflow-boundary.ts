#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: `approval_instances` is the canonical workflow
 * runtime. The legacy `approval_requests` service is allowed to remain as a
 * compatibility island, but new callers must not be added while migration is
 * in progress.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = [
  join(root, 'src'),
  join(root, 'apps'),
  join(root, 'packages'),
];

const allowedLegacyFiles = new Set([
  'src/services/approvalEngineService.ts',
  'apps/hrms-web/src/services/approvalEngineService.ts',
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
      if (!ignoredDirs.has(entry)) {
        files.push(...walk(full));
      }
      continue;
    }

    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(full);
    }
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
    if (allowedLegacyFiles.has(relativePath)) continue;

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
  console.error('Legacy approval_requests access found outside the approved compatibility island.');
  console.error('Use approval_instances through the canonical workflow engine instead.');
  console.error('');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}`);
    console.error(`  ${finding.source}`);
  }
  console.error('');
  console.error('Allowed legacy files:');
  for (const file of [...allowedLegacyFiles].sort()) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.info(
  `Workflow boundary check passed: approval_requests is confined to ${allowedLegacyFiles.size} legacy compatibility files.`,
);
