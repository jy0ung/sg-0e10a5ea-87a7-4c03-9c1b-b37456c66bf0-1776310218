#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: internal request configuration services are
 * package-owned by @flc/internal-requests. App-local service files remain only
 * as compatibility shims.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = [join(root, 'src'), join(root, 'apps')];
const forbiddenServiceImports = new Set([
  '@/services/requestTemplateService',
  '@/services/requestFormFieldService',
  '@/services/requestRoutingService',
  '@/services/requestApprovalService',
]);
const allowedShimFiles = new Set([
  'src/services/requestTemplateService.ts',
  'src/services/requestFormFieldService.ts',
  'apps/hrms-web/src/services/requestTemplateService.ts',
  'apps/hrms-web/src/services/requestFormFieldService.ts',
  'src/services/requestRoutingService.ts',
  'apps/hrms-web/src/services/requestRoutingService.ts',
  'src/services/requestApprovalService.ts',
  'apps/hrms-web/src/services/requestApprovalService.ts',
]);
const ignoredDirs = new Set(['dist', 'node_modules', '.git', '.turbo', '.vite', 'coverage']);

type Finding = {
  file: string;
  line: number;
  importPath: string;
  source: string;
};

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

const importPattern = /(?:from\s+|import\s*\(\s*|vi\.mock\s*\(\s*)['"]([^'"]+)['"]/g;
const findings: Finding[] = [];

for (const sourceRoot of sourceRoots) {
  for (const filePath of walk(sourceRoot)) {
    const relativePath = relative(root, filePath);
    if (allowedShimFiles.has(relativePath)) continue;

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      importPattern.lastIndex = 0;
      let match = importPattern.exec(line);
      while (match) {
        const importPath = match[1];
        if (forbiddenServiceImports.has(importPath)) {
          findings.push({ file: relativePath, line: index + 1, importPath, source: line.trim() });
        }
        match = importPattern.exec(line);
      }
    });
  }
}

const shimFindings: string[] = [];
for (const shimFile of allowedShimFiles) {
  const fullPath = join(root, shimFile);
  let contents = '';
  try {
    contents = readFileSync(fullPath, 'utf8');
  } catch {
    shimFindings.push(`${shimFile} (missing)`);
    continue;
  }

  if (!contents.includes('@flc/internal-requests')) {
    shimFindings.push(`${shimFile} (does not re-export @flc/internal-requests)`);
  }
  if (contents.includes('@/integrations/supabase') || /\bsupabase\s*\./.test(contents)) {
    shimFindings.push(`${shimFile} (contains direct Supabase implementation code)`);
  }
}

if (shimFindings.length > 0) {
  console.error('Internal request service shims must be package re-exports only.');
  for (const shimFile of shimFindings) console.error(`- ${shimFile}`);
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Internal request service imports found through local app shims.');
  console.error('Import from @flc/internal-requests instead.');
  console.error('');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.importPath})`);
    console.error(`  ${finding.source}`);
  }
  process.exit(1);
}

console.info('Internal request service boundary check passed: request template, form-field, routing, and approval services are package-owned.');
