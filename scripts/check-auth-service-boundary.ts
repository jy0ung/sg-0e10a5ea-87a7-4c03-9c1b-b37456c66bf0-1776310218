#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: auth and access behavior is package-owned by
 * @flc/auth. App-local service files remain only as compatibility shims.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();

const shimFiles = new Map<string, readonly string[]>([
  ['src/services/authService.ts', [
    "export { authService, getResetPasswordRedirectUrl } from '@flc/auth';",
    "export type { AuthError, AuthUser } from '@flc/auth';",
  ]],
  ['apps/hrms-web/src/services/authService.ts', [
    "export { authService, getResetPasswordRedirectUrl } from '@flc/auth';",
    "export type { AuthError, AuthUser } from '@flc/auth';",
  ]],
  ['src/services/roleSectionService.ts', [
    "export { fetchRoleSections, saveRoleSections } from '@flc/auth';",
    "export type { RoleSectionRow, RoleSectionsMatrix } from '@flc/auth';",
  ]],
  ['apps/hrms-web/src/services/roleSectionService.ts', [
    "export { fetchRoleSections, saveRoleSections } from '@flc/auth';",
    "export type { RoleSectionRow, RoleSectionsMatrix } from '@flc/auth';",
  ]],
  ['src/services/permissionService.ts', [
    "} from '@flc/auth';",
    "} from '@flc/auth';",
  ]],
  ['apps/hrms-web/src/services/permissionService.ts', [
    "} from '@flc/auth';",
    "} from '@flc/auth';",
  ]],
  ['src/services/profileService.ts', [
    "} from '@flc/auth';",
    "} from '@flc/auth';",
  ]],
  ['apps/hrms-web/src/services/profileService.ts', [
    "} from '@flc/auth';",
    "} from '@flc/auth';",
  ]],
  ['src/config/routeRoles.ts', [
    "} from '@flc/auth';",
  ]],
  ['apps/hrms-web/src/config/routeRoles.ts', [
    "} from '@flc/auth';",
  ]],
  ['src/config/hrmsConfig.ts', [
    "} from '@flc/auth';",
  ]],
  ['apps/hrms-web/src/config/hrmsConfig.ts', [
    "} from '@flc/auth';",
  ]],
]);

const forbiddenShimPatterns: readonly RegExp[] = [
  /supabase\s*\./,
  /signInWithPassword/,
  /resetPasswordForEmail/,
  /getCurrentUser\s*\(/,
  /getCurrentSession\s*\(/,
  /onAuthStateChange\s*\(/,
  /role_sections/,
  /column_permissions/,
  /profiles/,
  /invite-user/,
  /delete-user/,
];

const forbiddenLocalImports = new Set([
  '@/services/roleSectionService',
  '@/services/permissionService',
  '@/services/profileService',
]);

const ignoredDirs = new Set(['dist', 'node_modules', '.git', '.turbo', '.vite', 'coverage']);
const sourceRoots = [join(root, 'src'), join(root, 'apps')];
const importPattern = /(?:from\s+|import\s*\(\s*|vi\.mock\s*\(\s*)['"]([^'"]+)['"]/g;

type Finding = {
  file: string;
  detail: string;
};

const findings: Finding[] = [];

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

for (const [file, expectedLines] of shimFiles) {
  let source = '';
  try {
    source = readFileSync(join(root, file), 'utf8');
  } catch (error) {
    findings.push({ file, detail: `missing file: ${error instanceof Error ? error.message : String(error)}` });
    continue;
  }

  for (const expectedLine of expectedLines) {
    if (!source.includes(expectedLine)) {
      findings.push({ file, detail: `expected compatibility export: ${expectedLine}` });
    }
  }

  for (const pattern of forbiddenShimPatterns) {
    if (pattern.test(source)) {
      findings.push({ file, detail: `contains auth/access implementation pattern ${pattern}` });
    }
  }
}

for (const sourceRoot of sourceRoots) {
  for (const filePath of walk(sourceRoot)) {
    const relativePath = relative(root, filePath);
    if (shimFiles.has(relativePath)) continue;

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      importPattern.lastIndex = 0;
      let match = importPattern.exec(line);
      while (match) {
        const importPath = match[1];
        if (forbiddenLocalImports.has(importPath)) {
          findings.push({
            file: relativePath,
            detail: `line ${index + 1} imports ${importPath}; import from @flc/auth instead`,
          });
        }
        match = importPattern.exec(line);
      }
    });
  }
}

if (findings.length > 0) {
  console.error('Auth/access service boundary violation found.');
  console.error('Keep app-local auth/access service files as compatibility re-exports; place behavior in @flc/auth.');
  console.error('');
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.detail}`);
  }
  process.exit(1);
}

console.info(`Auth/access service boundary check passed: ${shimFiles.size} app service/config shims re-export @flc/auth.`);
