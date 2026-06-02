#!/usr/bin/env -S npx tsx
/**
 * Enterprise UX gate: feature-unavailable copy must come from platformRegistry.
 *
 * The rearchitecture plan treats route/module metadata as the source of truth
 * for unavailable-state messaging. Page-local feature names and phase flag
 * strings drift from nav, smoke, and module metadata, so this check fails when
 * FeatureUnavailableState usage reintroduces local `featureName` or `flagName`
 * props instead of a registry `routeId`.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const SEARCH_GLOBS = [
  'src/**/*.tsx',
  'apps/hrms-web/src/**/*.tsx',
] as const;

const allowedFiles = new Set([
  'src/components/shared/FeatureUnavailableState.tsx',
]);

function listTsxFiles(): string[] {
  const output = execSync(`git ls-files ${SEARCH_GLOBS.map((glob) => `'${glob}'`).join(' ')}`, {
    cwd: root,
    encoding: 'utf8',
  });
  return output.split('\n').filter(Boolean);
}

function lineNumberForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

const findings: string[] = [];

for (const file of listTsxFiles()) {
  if (allowedFiles.has(file)) continue;

  const abs = join(root, file);
  const source = readFileSync(abs, 'utf8');
  const usagePattern = /<FeatureUnavailableState\b[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = usagePattern.exec(source)) !== null) {
    const usage = match[0];
    const line = lineNumberForOffset(source, match.index);
    const hasRouteId = /\brouteId=/.test(usage);
    const hasLocalCopy = /\b(featureName|flagName)=/.test(usage);

    if (!hasRouteId || hasLocalCopy) {
      findings.push(`${relative(root, abs)}:${line} (${!hasRouteId ? 'missing routeId' : 'uses local copy props'})`);
    }
  }
}

if (findings.length > 0) {
  console.error('FeatureUnavailableState must use platformRegistry routeId metadata.');
  console.error('Remove page-local featureName/flagName props and add a routeId entry to PLATFORM_ROUTES.');
  console.error('');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.info('Unavailable-state registry check passed: FeatureUnavailableState usage is route-id backed.');
