#!/usr/bin/env -S npx tsx
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Fails CI if SUPABASE_SERVICE_ROLE_KEY or related service-role strings
// appear anywhere in client-reachable code (src/, apps/*/src/, packages/).
// Edge functions (supabase/functions/) and operator scripts (scripts/) are
// exempt; the service role is legitimately used there.
//
// Run:  npm run security:no-service-role
//       npx tsx scripts/check-no-service-role.ts

const root = process.cwd();

// Roots that must NOT reference service-role secrets.
const SCAN_ROOTS = [
  'src',
  'packages',
  ...readdirSync(join(root, 'apps'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join('apps', d.name, 'src')),
];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.git',
  'coverage',
]);

// Paths that legitimately reference the service role:
//   - src/test/* runs in Node against a local Supabase stack to exercise
//     RLS and cross-tenant scenarios. The vitest harness reads the key
//     from process.env; nothing reaches the browser bundle.
//   - rls-matrix / dms-normalizer / sales-pipeline / ap-foundation specs.
const SKIP_PATHS: RegExp[] = [
  /(^|\/)src\/test\//,
];

const SKIP_FILE_SUFFIXES = ['.snap', '.lockb', '.lock', '.md', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico'];

// Patterns considered a violation in client-reachable code.
const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'SUPABASE_SERVICE_ROLE_KEY identifier', re: /SUPABASE_SERVICE_ROLE_KEY/ },
  { name: 'SERVICE_ROLE_KEY suffix', re: /SERVICE_ROLE_KEY/ },
  { name: 'literal service-role JWT (role:"service_role")', re: /role\s*[:=]\s*['"]service_role['"]/ },
];

type Finding = { file: string; line: number; pattern: string; snippet: string };
const findings: Finding[] = [];

function walk(dir: string) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full);
      continue;
    }
    if (!e.isFile()) continue;
    if (SKIP_FILE_SUFFIXES.some((s) => e.name.endsWith(s))) continue;
    const lower = e.name.toLowerCase();
    // Only scan code-like files.
    if (
      !lower.endsWith('.ts') &&
      !lower.endsWith('.tsx') &&
      !lower.endsWith('.js') &&
      !lower.endsWith('.jsx') &&
      !lower.endsWith('.mjs') &&
      !lower.endsWith('.cjs') &&
      !lower.endsWith('.json') &&
      !lower.endsWith('.html')
    ) {
      continue;
    }
    scan(full);
  }
}

function scan(file: string) {
  const rel = relative(root, file);
  if (SKIP_PATHS.some((re) => re.test(rel))) return;
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { name, re } of FORBIDDEN_PATTERNS) {
      if (re.test(line)) {
        findings.push({
          file: rel,
          line: i + 1,
          pattern: name,
          snippet: line.trim().slice(0, 200),
        });
      }
    }
  }
}

for (const r of SCAN_ROOTS) {
  const abs = join(root, r);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  walk(abs);
}

if (findings.length > 0) {
  console.error(`\n❌  Service-role token leakage in client code (${findings.length} findings):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line} — ${f.pattern}`);
    console.error(`    ${f.snippet}`);
  }
  console.error(
    '\nFix: move the call into an edge function under supabase/functions/, or into an operator-only script under scripts/.\n',
  );
  process.exit(1);
}

console.info('✓ No service-role token references in client-reachable code.');
