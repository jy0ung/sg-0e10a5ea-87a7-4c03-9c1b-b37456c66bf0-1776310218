#!/usr/bin/env -S npx tsx
/**
 * CI gate: every RPC the frontend calls via `supabase.rpc('name', …)` must
 * have a matching `CREATE FUNCTION name(…)` somewhere in supabase/migrations.
 *
 * Catches the next regression of the `get_role_home_kpis` outage shape at
 * commit time — i.e. when a service starts calling an RPC that is not in
 * the migration ledger. Does NOT detect the "migration not applied to prod"
 * case (only a runtime canary against the live DB can do that); see
 * scripts/health-rpc-canaries.ts (post-deploy probe) for that gate.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const migrationsDir = join(root, 'supabase', 'migrations');
const frontendRoots = [
  join(root, 'src', 'services'),
  join(root, 'apps', 'hrms-web', 'src', 'services'),
  join(root, 'packages', 'hrms-services', 'src'),
];

const SKIP_EXT = new Set(['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx']);

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out = out.concat(walk(full));
    } else if (
      (name.endsWith('.ts') || name.endsWith('.tsx'))
      && ![...SKIP_EXT].some((s) => name.endsWith(s))
    ) {
      out.push(full);
    }
  }
  return out;
}

function gatherFrontendCalls(): Map<string, string[]> {
  const calls = new Map<string, string[]>();
  const pattern = /supabase\s*\.\s*rpc\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]/g;
  for (const root of frontendRoots) {
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(pattern)) {
        const name = m[1];
        const list = calls.get(name) ?? [];
        list.push(relative(process.cwd(), file));
        calls.set(name, list);
      }
    }
  }
  return calls;
}

function gatherMigrationDefinitions(): Set<string> {
  const defs = new Set<string>();
  // Whitespace-and-line-tolerant: handles `CREATE OR REPLACE FUNCTION foo (` and
  // `CREATE FUNCTION public.foo (` across line breaks.
  const pattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(/gi;
  let files: string[];
  try {
    files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  } catch {
    console.error(`Cannot read migrations dir: ${migrationsDir}`);
    process.exit(1);
  }
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), 'utf8');
    for (const m of sql.matchAll(pattern)) {
      defs.add(m[1].toLowerCase());
    }
  }
  return defs;
}

const calls = gatherFrontendCalls();
const defs = gatherMigrationDefinitions();

const missing: Array<{ name: string; callers: string[] }> = [];
for (const [name, callers] of calls.entries()) {
  if (!defs.has(name)) {
    missing.push({ name, callers });
  }
}

if (missing.length > 0) {
  console.error('Frontend calls RPC(s) with no matching CREATE FUNCTION in any migration:');
  for (const { name, callers } of missing) {
    console.error(`  - ${name}`);
    for (const c of callers) console.error(`      called from: ${c}`);
  }
  console.error('');
  console.error('Either add the migration, or remove the caller. Do not ship without one of these.');
  process.exit(1);
}

console.info(
  `RPC call/definition coverage: ${calls.size} distinct RPCs called from frontend, all match a migration (${defs.size} total functions defined).`,
);
