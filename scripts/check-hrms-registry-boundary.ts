#!/usr/bin/env -S npx tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

type Finding = { file: string; detail: string };
const findings: Finding[] = [];

function read(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf8');
}

function add(file: string, detail: string): void {
  findings.push({ file, detail });
}

const navFile = 'apps/hrms-web/src/layout/navItems.ts';
const nav = read(navFile);
if (!/HRMS_NAV_ROUTES/.test(nav)) add(navFile, 'must project HRMS navigation from @flc/shell HRMS_NAV_ROUTES');
if (/export\s+const\s+hrmsNavItems[^=]*=\s*\[/.test(nav)) add(navFile, 'must not define app-local HRMS navigation arrays');

const shellFile = 'apps/hrms-web/src/layout/hrmsShellConfig.ts';
const shell = read(shellFile);
if (!/HRMS_ROUTE_CHROME/.test(shell)) add(shellFile, 'must consume HRMS_ROUTE_CHROME from @flc/shell');
if (/const\s+HRMS_ROUTE_CHROME\s*:?\s*[^=]*=\s*\[/.test(shell)) add(shellFile, 'must not define app-local HRMS route chrome');

const routesFile = 'apps/hrms-web/src/routes.ts';
const routes = read(routesFile);
if (!/HRMS_PROTECTED_ROUTE_PATHS/.test(routes)) add(routesFile, 'must consume HRMS_PROTECTED_ROUTE_PATHS from @flc/shell');
if (/export\s+const\s+hrmsProtectedRoutePaths\s*=\s*\[/.test(routes)) add(routesFile, 'must not define app-local HRMS protected route arrays');

const appFile = 'apps/hrms-web/src/App.tsx';
const app = read(appFile);
if (!/HRMS_GUARDED_ROUTE_DEFINITIONS/.test(app)) add(appFile, 'must build guarded HRMS router entries from @flc/shell HRMS_GUARDED_ROUTE_DEFINITIONS');
if (/path:\s*['"](?:dashboard|profile|leave|leave\/team|leave\/calendar|attendance|approvals|appraisals|announcements|employees|employees\/:id|payroll|settings|settings\/leave-quota|settings\/:module)['"]/.test(app)) {
  add(appFile, 'must not hard-code guarded HRMS route paths; use HRMS_GUARDED_ROUTE_DEFINITIONS');
}
if (/RequireHrmsRouteAccess\s+access="/.test(app)) add(appFile, 'must not hard-code guarded HRMS access keys in route entries');

const registryFile = 'packages/shell/src/platformRegistry.ts';
const registry = read(registryFile);
for (const exportedName of ['HRMS_NAV_ROUTES', 'HRMS_ROUTE_CHROME', 'HRMS_PROTECTED_ROUTE_PATHS', 'HRMS_GUARDED_ROUTE_DEFINITIONS']) {
  if (!new RegExp(`export\\s+const\\s+${exportedName}\\b`).test(registry)) {
    add(registryFile, `must export ${exportedName}`);
  }
}

if (findings.length > 0) {
  console.error('HRMS registry boundary violation found.');
  console.error('Keep dedicated HRMS shell metadata package-owned in @flc/shell.');
  console.error('');
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.detail}`);
  process.exit(1);
}

console.info('HRMS registry boundary check passed: navigation, chrome, guarded route, and protected route metadata are registry-owned.');
