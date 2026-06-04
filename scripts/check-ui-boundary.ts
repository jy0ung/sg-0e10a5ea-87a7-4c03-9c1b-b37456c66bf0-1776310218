#!/usr/bin/env -S npx tsx
/**
 * Enterprise architecture gate: shared UI tokens and primitives should live in
 * @flc/ui. App-local files remain compatibility shims during migration.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

type Finding = { file: string; detail: string };
const findings: Finding[] = [];

function read(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf8');
}

const packageFile = 'packages/ui/src/statusTones.ts';
const packageSource = read(packageFile);
for (const expected of ['export type Tone', 'export const TONE_CLASSES', 'export function toneClass']) {
  if (!packageSource.includes(expected)) findings.push({ file: packageFile, detail: `missing shared export ${expected}` });
}

const sharedPrimitives = [
  {
    name: 'AuditDiffTable',
    packageFile: 'packages/ui/src/AuditDiffTable.tsx',
    expectedExport: 'export function AuditDiffTable',
    forbiddenPattern: /formatValue|No field changes recorded|Object\.entries\(changes\)/,
  },
  {
    name: 'HrmsEmptyState',
    packageFile: 'packages/ui/src/HrmsEmptyState.tsx',
    expectedExport: 'export function HrmsEmptyState',
    forbiddenPattern: /border-dashed|action\.label|ElementType/,
  },
  {
    name: 'KpiCard',
    packageFile: 'packages/ui/src/KpiCard.tsx',
    expectedExport: 'export function KpiCard',
    forbiddenPattern: /median days|statusColors|validCount/,
  },
  {
    name: 'PageHeader',
    packageFile: 'packages/ui/src/PageHeader.tsx',
    expectedExport: 'export function PageHeader',
    forbiddenPattern: /ChevronRight|breadcrumbs\.map|react-router-dom/,
  },
  {
    name: 'FilterBar',
    packageFile: 'packages/ui/src/FilterBar.tsx',
    expectedExport: 'export function FilterBar',
    forbiddenPattern: /useState|ChevronDown|ChevronUp|SlidersHorizontal|aria-expanded|rounded-lg border bg-card p-3/,
  },
  {
    name: 'PageSpinner',
    packageFile: 'packages/ui/src/PageSpinner.tsx',
    expectedExport: 'export function PageSpinner',
    forbiddenPattern: /Loader2|ariaLabel|role="status"/,
  },
  {
    name: 'KpiSkeleton',
    packageFile: 'packages/ui/src/KpiSkeleton.tsx',
    expectedExport: 'export function KpiSkeleton',
    forbiddenPattern: /Array\.from|grid-cols-|glass-panel/,
  },
  {
    name: 'TableSkeleton',
    packageFile: 'packages/ui/src/TableSkeleton.tsx',
    expectedExport: 'export function TableSkeleton',
    forbiddenPattern: /<table|colWidths|Array\(cols\)/,
  },
  {
    name: 'ScrollableRegion',
    packageFile: 'packages/ui/src/ScrollableRegion.tsx',
    expectedExport: 'export function ScrollableRegion',
    forbiddenPattern: /role="region"|tabIndex|HTMLAttributes/,
  },
  {
    name: 'StandardTable',
    packageFile: 'packages/ui/src/StandardTable.tsx',
    expectedExport: 'export function StandardTable',
    forbiddenPattern: /DEFAULT_PAGE_SIZES|SortIcon|standard-table-mobile-list|getValue|<table|ChevronsUpDown/,
  },
  {
    name: 'LocationPreservingNavigate',
    packageFile: 'packages/ui/src/LocationPreservingNavigate.tsx',
    expectedExport: 'export function LocationPreservingNavigate',
    forbiddenPattern: /withCurrentLocation|useLocation|<Navigate/,
  },
  {
    name: 'MobileCardList',
    packageFile: 'packages/ui/src/MobileCardList.tsx',
    expectedExport: 'export function MobileCardList',
    forbiddenPattern: /renderCard|emptyMessage|sm:hidden space-y-3/,
  },
  {
    name: 'UnauthorizedAccess',
    packageFile: 'packages/ui/src/UnauthorizedAccess.tsx',
    expectedExport: 'export function UnauthorizedAccess',
    forbiddenPattern: /ShieldOff|Access Restricted|permission to view/,
  },
  {
    name: 'StepperProgress',
    packageFile: 'packages/ui/src/StepperProgress.tsx',
    expectedExport: 'export function StepperProgress',
    forbiddenPattern: /stepIndex|<ol|Check|currentIdx/,
  },
  {
    name: 'ConfirmDialog',
    packageFile: 'packages/ui/src/ConfirmDialog.tsx',
    expectedExport: 'export function ConfirmDialog',
    forbiddenPattern: /AlertDialog|confirmVariant|Loader2/,
  },
  {
    name: 'SectionCard',
    packageFile: 'packages/ui/src/SectionCard.tsx',
    expectedExport: 'export function SectionCard',
    forbiddenPattern: /surface-card|ArrowRight|headerRight/,
  },
  {
    name: 'ValidationSummaryModal',
    packageFile: 'packages/ui/src/ValidationSummaryModal.tsx',
    expectedExport: 'export function ValidationSummaryModal',
    forbiddenPattern: /useMemo|severityFilter|toggleSort|getSeverityBadge/,
  },
  {
    name: 'ExcelTable',
    packageFile: 'packages/ui/src/ExcelTable.tsx',
    expectedExport: 'export function ExcelTable',
    forbiddenPattern: /EditableGridCell|EditableGridRow|TableRowRecord|handleCellSave/,
  },
  {
    name: 'MetricCard',
    packageFile: 'packages/ui/src/MetricCard.tsx',
    expectedExport: 'export function MetricCard',
    forbiddenPattern: /TONE_CHIP|deltaColor|DeltaIcon/,
  },
] as const;

for (const primitive of sharedPrimitives) {
  const source = read(primitive.packageFile);
  if (!source.includes(primitive.expectedExport)) {
    findings.push({ file: primitive.packageFile, detail: `missing shared export ${primitive.expectedExport}` });
  }
}

for (const file of ['src/lib/statusTones.ts', 'apps/hrms-web/src/lib/statusTones.ts']) {
  const source = read(file);
  if (!source.includes("from '@flc/ui/statusTones'")) {
    findings.push({ file, detail: 'must re-export status tone classes from @flc/ui/statusTones' });
  }
  if (/Record<Tone,\s*string>|bg-amber-100|dark:bg-amber/.test(source)) {
    findings.push({ file, detail: 'must not define app-local tone class maps' });
  }
}

for (const primitive of sharedPrimitives) {
  const packagePath = `@flc/ui/${primitive.name}`;
  for (const file of [
    `src/components/shared/${primitive.name}.tsx`,
    `apps/hrms-web/src/components/shared/${primitive.name}.tsx`,
  ]) {
    const source = read(file);
    if (!source.includes(`from '${packagePath}'`)) {
      findings.push({ file, detail: `must re-export from ${packagePath}` });
    }
    if (primitive.forbiddenPattern.test(source)) {
      findings.push({ file, detail: 'must remain a compatibility shim, not an app-local implementation' });
    }
  }
}

if (findings.length > 0) {
  console.error('UI package boundary violation found.');
  console.error('Keep shared UI tokens and primitives package-owned in @flc/ui.');
  console.error('');
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.detail}`);
  process.exit(1);
}

console.info('UI boundary check passed: shared status tones and page primitives are package-owned in @flc/ui.');
