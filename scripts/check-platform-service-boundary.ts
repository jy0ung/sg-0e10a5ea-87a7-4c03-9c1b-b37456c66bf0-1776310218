#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: cross-cutting platform services are package
 * owned. Local service files remain as compatibility shims, but app code should
 * import the shared package directly.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = [
  join(root, 'src'),
  join(root, 'apps'),
];

const forbiddenServiceImports = new Set([
  '@/services/loggingService',
  '@/services/notificationService',
  '@/services/ticketAttachmentService',
  '@/services/businessReportService',
  '@/services/brandingService',
  '@/services/errorTrackingService',
  '@/services/performanceService',
  '@/services/moduleSettingsService',
]);

const allowedShimFiles = new Set([
  'src/services/loggingService.ts',
  'src/services/notificationService.ts',
  'src/services/ticketAttachmentService.ts',
  'src/services/businessReportService.ts',
  'src/services/brandingService.ts',
  'src/services/errorTrackingService.ts',
  'src/services/performanceService.ts',
  'src/services/moduleSettingsService.ts',
  'src/services/auditService.ts',
  'apps/hrms-web/src/services/loggingService.ts',
  'apps/hrms-web/src/services/notificationService.ts',
  'apps/hrms-web/src/services/ticketAttachmentService.ts',
  'apps/hrms-web/src/services/businessReportService.ts',
  'apps/hrms-web/src/services/brandingService.ts',
  'apps/hrms-web/src/services/errorTrackingService.ts',
  'apps/hrms-web/src/services/performanceService.ts',
  'apps/hrms-web/src/services/moduleSettingsService.ts',
  'apps/hrms-web/src/services/auditService.ts',
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
  importPath: string;
  source: string;
};

const findings: Finding[] = [];
const importPattern = /(?:from\s+|import\s*\(\s*|vi\.mock\s*\(\s*)['"]([^'"]+)['"]/g;

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
          findings.push({
            file: relativePath,
            line: index + 1,
            importPath,
            source: line.trim(),
          });
        }
        match = importPattern.exec(line);
      }
    });
  }
}

const shimFindings: string[] = [];
for (const shimFile of allowedShimFiles) {
  const fullPath = join(root, shimFile);
  let contents = "";
  try {
    contents = readFileSync(fullPath, "utf8");
  } catch {
    shimFindings.push(shimFile + " (missing)");
    continue;
  }

  if (contents.includes("@/integrations/supabase") || /\bsupabase\s*\./.test(contents)) {
    shimFindings.push(shimFile);
  }
}

if (shimFindings.length > 0) {
  console.error("Package-owned platform service shims must not contain direct Supabase implementation code.");
  for (const shimFile of shimFindings) {
    console.error("- " + shimFile);
  }
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Shared platform service imports found through local app shims.');
  console.error('Import from @flc/platform-services instead.');
  console.error('');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.importPath})`);
    console.error(`  ${finding.source}`);
  }
  console.error('');
  console.error('Allowed shim files:');
  for (const file of [...allowedShimFiles].sort()) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const packageOwnedServiceCount = forbiddenServiceImports.size + 1;
console.info(
  "Platform service boundary check passed: " + packageOwnedServiceCount + " shared services are package-owned.",
);
