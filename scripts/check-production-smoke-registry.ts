#!/usr/bin/env -S npx tsx
/**
 * Enterprise observability gate: production smoke coverage is registry-owned,
 * but it must remain safe for the deploy runner.
 *
 * This catches drift before deployment:
 * - smoke routes must be concrete browser paths, never detail routes with
 *   dynamic params;
 * - main-host smoke routes may cover main and portal shells, while HRMS smoke
 *   routes must stay on the dedicated HRMS host;
 * - the smoke script must import the registry source directly, avoiding
 *   workspace package export resolution differences in GitHub Actions.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLATFORM_ROUTES,
  getProductionSmokeRoutes,
  type PlatformRouteDefinition,
  type PlatformShell,
} from '../packages/shell/src/platformRegistry';

const root = process.cwd();
const smokeScript = readFileSync(join(root, 'scripts', 'smoke-production-modules.ts'), 'utf8');

type Finding = {
  routeId?: string;
  detail: string;
};

const findings: Finding[] = [];
const smokeApps: readonly PlatformShell[] = ['main', 'hrms'];
const minCoverage: Record<'main' | 'hrms', number> = {
  main: 50,
  hrms: 10,
};
const requiredPaths: Record<'main' | 'hrms', readonly string[]> = {
  main: ['/', '/home', '/portal/tickets/new', '/admin/reconciliation'],
  hrms: ['/', '/leave', '/approvals', '/settings'],
};

function addFinding(detail: string, routeId?: string) {
  findings.push({ routeId, detail });
}

function isConcreteBrowserPath(path: string): boolean {
  return path.startsWith('/') && !path.includes(':') && !path.includes('*');
}

function assertSmokeScriptImport() {
  const directImport = /from\s+['"]\.\.\/packages\/shell\/src\/platformRegistry['"]/.test(smokeScript);
  const packageImport = /from\s+['"]@flc\/shell(?:\/platformRegistry)?['"]/.test(smokeScript);

  if (!directImport || packageImport) {
    addFinding(
      'scripts/smoke-production-modules.ts must import ../packages/shell/src/platformRegistry directly for GitHub Actions deploy compatibility',
    );
  }
}

function assertRoute(route: PlatformRouteDefinition) {
  if (!route.smoke) return;

  const app = route.smoke.app;
  if (!smokeApps.includes(app)) {
    addFinding(`unsupported smoke app "${app}"`, route.id);
  }

  if (app === 'main' && !['main', 'portal'].includes(route.shell)) {
    addFinding(`main production smoke cannot target ${route.shell} shell route`, route.id);
  }

  if (app === 'hrms' && route.shell !== 'hrms') {
    addFinding(`HRMS production smoke must target hrms shell routes, found ${route.shell}`, route.id);
  }

  if (route.external) {
    addFinding('external launcher routes must not be direct production smoke routes', route.id);
  }

  const smokePath = route.smoke.path ?? route.path;
  if (!isConcreteBrowserPath(smokePath)) {
    addFinding(`smoke path must be a concrete browser path, found "${smokePath}"`, route.id);
  }
}

function assertProjection(app: 'main' | 'hrms') {
  const projected = getProductionSmokeRoutes(app);
  const duplicatePaths = new Set<string>();
  const seenPaths = new Set<string>();

  if (projected.length < minCoverage[app]) {
    addFinding(`${app} production smoke coverage dropped to ${projected.length}; expected at least ${minCoverage[app]}`);
  }

  for (const requiredPath of requiredPaths[app]) {
    if (!projected.some((route) => route.path === requiredPath)) {
      addFinding(`${app} production smoke coverage is missing required path ${requiredPath}`);
    }
  }

  for (const route of projected) {
    const key = route.path;
    if (seenPaths.has(key)) duplicatePaths.add(key);
    seenPaths.add(key);

    if (!route.module.trim()) {
      addFinding(`${app} production smoke route ${route.path} has an empty module label`);
    }
    if (!route.name.trim()) {
      addFinding(`${app} production smoke route ${route.path} has an empty route name`);
    }
    if (!isConcreteBrowserPath(route.path)) {
      addFinding(`${app} production smoke route ${route.path} is not concrete`);
    }
  }

  for (const duplicatePath of duplicatePaths) {
    addFinding(`${app} production smoke has duplicate path ${duplicatePath}`);
  }
}

assertSmokeScriptImport();
for (const route of PLATFORM_ROUTES) assertRoute(route);
assertProjection('main');
assertProjection('hrms');

if (findings.length > 0) {
  console.error('Production smoke registry check failed.');
  console.error('Keep deploy smoke coverage concrete, host-correct, and registry-driven.');
  console.error('');
  for (const finding of findings) {
    const prefix = finding.routeId ? `${finding.routeId}: ` : '';
    console.error(`- ${prefix}${finding.detail}`);
  }
  process.exit(1);
}

console.info(
  `Production smoke registry check passed: ${getProductionSmokeRoutes('main').length} main routes, ${getProductionSmokeRoutes('hrms').length} HRMS routes.`,
);
