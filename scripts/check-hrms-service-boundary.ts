#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: HRMS web stays a separately deployed host, but
 * it must not regain a second copy of HRMS domain service wrapper logic.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const canonicalReExports = new Map<string, string>([
  ['src/lib/hrms/access.ts', "export * from '@flc/hrms-services/access';"],
  ['apps/hrms-web/src/lib/hrms/access.ts', "export * from '@flc/hrms-services/access';"],
  ['apps/hrms-web/src/services/hrms/announcementService.ts', "export * from '../../../../../src/services/hrms/announcementService';"],
  ['apps/hrms-web/src/services/hrms/appraisalService.ts', "export * from '../../../../../src/services/hrms/appraisalService';"],
  ['apps/hrms-web/src/services/hrms/attendanceService.ts', "export * from '../../../../../src/services/hrms/attendanceService';"],
  ['apps/hrms-web/src/services/hrms/leaveService.ts', "export * from '../../../../../src/services/hrms/leaveService';"],
  ['apps/hrms-web/src/services/hrms/payrollService.ts', "export * from '../../../../../src/services/hrms/payrollService';"],
  ['apps/hrms-web/src/services/hrms/shared.ts', "export * from '../../../../../src/services/hrms/shared';"],
  ['apps/hrms-web/src/services/hrms/index.ts', "export * from '../../../../../src/services/hrms';"],
]);

const forbiddenPatterns: readonly RegExp[] = [
  /supabase\s*\./,
  /from\s*\(\s*['"]/,
  /rpc\s*\(\s*['"]/,
  /function\s+\w+/,
  /async\s+function\s+\w+/,
  /export\s+async\s+function/,
  /export\s+function/,
];

type Finding = {
  file: string;
  detail: string;
};

const findings: Finding[] = [];

for (const [file, expectedExport] of canonicalReExports) {
  let source = '';
  try {
    source = readFileSync(join(root, file), 'utf8');
  } catch (error) {
    findings.push({ file, detail: `missing file: ${error instanceof Error ? error.message : String(error)}` });
    continue;
  }

  if (!source.includes(expectedExport)) {
    findings.push({ file, detail: `expected canonical re-export: ${expectedExport}` });
  }

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      findings.push({ file, detail: `contains service implementation pattern ${pattern}` });
    }
  }
}

if (findings.length > 0) {
  console.error('HRMS web service boundary violation found.');
  console.error('Keep HRMS web domain service files as compatibility re-exports; place shared core logic in @flc/hrms-services.');
  console.error('');
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.detail}`);
  }
  process.exit(1);
}

console.info(`HRMS service boundary check passed: ${canonicalReExports.size} HRMS service/access wrappers are canonical re-exports.`);
