#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: registry <-> router parity
 * (ENTERPRISE_REARCHITECTURE.md §56-69).
 *
 * `platformRegistry` owns route metadata (nav, chrome, smoke), but route
 * ELEMENTS are still hand-declared in the routers (src/main.tsx and
 * apps/hrms-web/src/App.tsx) — the §69 big-bang-router rewrite is deliberately
 * deferred. That deferral leaves a drift seam: a registry route can be added,
 * renamed, or removed without a matching router element (or vice-versa) and
 * nothing fails. This gate is the compensating control: every non-external
 * registry route must resolve to a declared route element in its host router.
 *
 * Resolution is intentionally structural and conservative (it parses declared
 * `path:` literals rather than executing the router), so it errs toward
 * passing. Its job is to catch ORPHAN metadata — a registry path whose
 * segments are declared nowhere in the host router.
 *
 * Known pre-existing orphans live in KNOWN_ORPHAN_ROUTE_IDS as tracked debt;
 * the set must only shrink.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HRMS_GUARDED_ROUTE_DEFINITIONS,
  PLATFORM_ROUTES,
  type PlatformRouteDefinition,
} from '../packages/shell/src/platformRegistry';

const root = process.cwd();

// Portal routes are served by the main app's /portal tree (src/main.tsx);
// only the dedicated HRMS workspace routes live in the hrms-web host.
const HOST_SOURCE: Record<PlatformRouteDefinition['shell'], string> = {
  main: join(root, 'src/main.tsx'),
  portal: join(root, 'src/main.tsx'),
  hrms: join(root, 'apps/hrms-web/src/App.tsx'),
};

// Registry routes that intentionally have no router element yet (tracked debt).
// This set must only shrink — never add to it without a recorded reason.
const KNOWN_ORPHAN_ROUTE_IDS = new Set<string>([
  // Legacy HRMS approval-flows surface kept in the registry for smoke coverage
  // but no longer served by the hrms-web host. Remove when the registry entry
  // (and its smoke route) is retired.
  'hrms-approval-flows-legacy',
]);

const sourceCache = new Map<string, Set<string>>();

function declaredPaths(file: string): Set<string> {
  const cached = sourceCache.get(file);
  if (cached) return cached;

  const src = readFileSync(file, 'utf8');
  const set = new Set<string>();
  const pattern = /\bpath:\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(src)) !== null) {
    set.add(normalize(match[1]));
  }
  if (src.includes('HRMS_GUARDED_ROUTE_DEFINITIONS')) {
    for (const route of HRMS_GUARDED_ROUTE_DEFINITIONS) set.add(normalize(route.path));
  }
  sourceCache.set(file, set);
  return set;
}

function normalize(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * A registry path resolves if its full relative form is declared, OR it
 * decomposes into a declared parent prefix plus a declared child literal
 * (covering nested route trees like /sales/* and /portal/*), OR a declared
 * wildcard parent (e.g. "hrms/*") covers it.
 */
function resolves(absPath: string, declared: Set<string>): boolean {
  const rel = normalize(absPath);
  if (rel === '') return true; // index / root element
  if (declared.has(rel)) return true;

  const segments = rel.split('/');
  for (let i = 1; i < segments.length; i += 1) {
    const parent = segments.slice(0, i).join('/');
    const child = segments.slice(i).join('/');
    if (declared.has(parent) && declared.has(child)) return true;
  }
  for (let i = 1; i <= segments.length; i += 1) {
    const parent = segments.slice(0, i).join('/');
    if (declared.has(`${parent}/*`)) return true;
  }
  return false;
}

const orphans: { id: string; path: string; shell: string }[] = [];
const staleAllowlist: string[] = [];

for (const route of PLATFORM_ROUTES) {
  if (route.external) continue; // external launchers have no local element
  const declared = declaredPaths(HOST_SOURCE[route.shell]);
  const resolved = resolves(route.path, declared);

  if (!resolved && !KNOWN_ORPHAN_ROUTE_IDS.has(route.id)) {
    orphans.push({ id: route.id, path: route.path, shell: route.shell });
  }
  if (resolved && KNOWN_ORPHAN_ROUTE_IDS.has(route.id)) {
    staleAllowlist.push(route.id);
  }
}

let failed = false;

if (orphans.length > 0) {
  failed = true;
  console.error('Registry routes with no matching router element (metadata <-> element drift):');
  console.error('Add the route element to its host router, or remove the registry entry.');
  console.error('');
  for (const orphan of orphans) {
    console.error(`- ${orphan.id} (${orphan.shell}): ${orphan.path}`);
  }
  console.error('');
}

if (staleAllowlist.length > 0) {
  failed = true;
  console.error('These routes are now served by the router — remove them from KNOWN_ORPHAN_ROUTE_IDS:');
  for (const id of staleAllowlist) console.error(`- ${id}`);
  console.error('');
}

if (failed) process.exit(1);

const checked = PLATFORM_ROUTES.filter((route) => !route.external).length;
const resolvedCount = checked - KNOWN_ORPHAN_ROUTE_IDS.size;
const orphanNote =
  KNOWN_ORPHAN_ROUTE_IDS.size > 0 ? `, ${KNOWN_ORPHAN_ROUTE_IDS.size} tracked orphan(s)` : '';
console.info(
  `Route registry parity check passed: ${resolvedCount} registry routes resolve to a router element${orphanNote}.`,
);
