#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: pages/components are presentation surfaces.
 *
 * They may subscribe through the shared realtime hook, but they must not import
 * Supabase clients or issue table/RPC/auth/storage calls directly. Data access
 * belongs in services or package-owned domain boundaries.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const searchGlobs = [
  'src/pages/**/*.ts',
  'src/pages/**/*.tsx',
  'src/components/**/*.ts',
  'src/components/**/*.tsx',
  'apps/hrms-web/src/pages/**/*.ts',
  'apps/hrms-web/src/pages/**/*.tsx',
  'apps/hrms-web/src/components/**/*.ts',
  'apps/hrms-web/src/components/**/*.tsx',
] as const;

const skippedFilePattern = /\.(test|spec)\.(ts|tsx)$/;
const allowedSupabasePackageImports = new Set(['useSupabaseChannel']);
const allowedSupabasePackageTypeImports = new Set(['SupabasePayload']);

type Finding = {
  file: string;
  line: number;
  detail: string;
  source: string;
};

const findings: Finding[] = [];

function listSourceFiles(): string[] {
  const output = execSync(`git ls-files ${searchGlobs.map((glob) => `'${glob}'`).join(' ')}`, {
    cwd: root,
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .filter(Boolean)
    .filter((file) => !skippedFilePattern.test(file));
}

function addFinding(filePath: string, line: number, detail: string, source: string) {
  findings.push({
    file: relative(root, filePath),
    line,
    detail,
    source: source.trim(),
  });
}

function splitImports(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function assertAllowedFlcSupabaseImport(filePath: string, lineNumber: number, line: string) {
  const namedImport = /\{\s*([^}]+)\s*\}/.exec(line);
  if (!namedImport) {
    addFinding(filePath, lineNumber, 'do not import Supabase client exports from @flc/supabase in pages/components', line);
    return;
  }

  for (const imported of splitImports(namedImport[1])) {
    const normalized = imported
      .replace(/^type\s+/, '')
      .replace(/\s+as\s+\w+$/, '')
      .trim();
    const isTypeOnly = imported.startsWith('type ');

    if (isTypeOnly) {
      if (!allowedSupabasePackageTypeImports.has(normalized)) {
        addFinding(filePath, lineNumber, `unsupported @flc/supabase type import "${normalized}" in pages/components`, line);
      }
      continue;
    }

    if (!allowedSupabasePackageImports.has(normalized)) {
      addFinding(filePath, lineNumber, `unsupported @flc/supabase import "${normalized}" in pages/components`, line);
    }
  }
}

function scanFile(file: string) {
  const filePath = join(root, file);
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (/from\s+['"]@flc\/supabase\/client['"]/.test(line)) {
      addFinding(filePath, lineNumber, 'do not import @flc/supabase/client from pages/components', line);
    }
    if (/from\s+['"]@\/integrations\/supabase\/client['"]/.test(line)) {
      addFinding(filePath, lineNumber, 'do not import the app Supabase client from pages/components', line);
    }
    if (/from\s+['"]@supabase\/supabase-js['"]/.test(line)) {
      addFinding(filePath, lineNumber, 'do not import @supabase/supabase-js from pages/components', line);
    }
    if (/from\s+['"]@flc\/supabase['"]/.test(line)) {
      assertAllowedFlcSupabaseImport(filePath, lineNumber, line);
    }
    if (/\bsupabase\s*\.\s*(from|rpc|auth|storage)\s*\(/.test(line)) {
      addFinding(filePath, lineNumber, 'do not call Supabase data/auth/storage APIs from pages/components', line);
    }
    if (/\bcreateClient\s*\(/.test(line)) {
      addFinding(filePath, lineNumber, 'do not create Supabase clients in pages/components', line);
    }
  });
}

for (const file of listSourceFiles()) scanFile(file);

if (findings.length > 0) {
  console.error('Page/component data boundary violations found.');
  console.error('Move Supabase access into services or package-owned domain boundaries.');
  console.error('');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}: ${finding.detail}`);
    console.error(`  ${finding.source}`);
  }
  process.exit(1);
}

console.info('Page/component data boundary check passed: no direct Supabase client access in presentation surfaces.');
