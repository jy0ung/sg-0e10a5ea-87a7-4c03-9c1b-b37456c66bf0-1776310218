import fs from 'node:fs';
import path from 'node:path';

interface Package {
  version?: string;
  resolved?: string;
  integrity?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  link?: boolean;
}
interface Lock { lockfileVersion: number; packages: Record<string, Package> }
const [baselinePath, outputPath] = process.argv.slice(2);
if (!baselinePath || !outputPath) throw new Error('Usage: tsx scripts/build-tool-graph-evidence.ts BASELINE_LOCK OUTPUT_JSON');
const baseline: Lock = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const candidate: Lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const packageName = (entry: string) => entry.split('node_modules/').at(-1)!;
const summary = (entry: string, pkg: Package) => ({ path: entry, name: packageName(entry), ...pkg });
const installedEntries = (lock: Lock) => Object.entries(lock.packages).filter(([entry, pkg]) => entry.includes('node_modules/') && !pkg.link);
const affected = new Set(['braces', 'chokidar', 'micromatch', 'fast-glob', 'tailwindcss', '@tailwindcss/typography', 'tailwindcss-animate', 'lovable-tagger', 'tailwind-merge']);
const forbidden = new Set(['braces', 'lovable-tagger']);
const affectedGraph = (lock: Lock) => installedEntries(lock).filter(([entry]) => affected.has(packageName(entry))).map(([entry, pkg]) => summary(entry, pkg));
const remaining = installedEntries(candidate).filter(([entry, pkg]) => forbidden.has(packageName(entry)) || (packageName(entry) === 'tailwindcss' && !pkg.version?.startsWith('4.')));
if (remaining.length) throw new Error(`Vulnerable/legacy build path remains: ${remaining.map(([entry]) => entry).join(', ')}`);
const added = installedEntries(candidate).filter(([entry]) => !baseline.packages[entry]).map(([entry, pkg]) => summary(entry, pkg));
const removed = installedEntries(baseline).filter(([entry]) => !candidate.packages[entry]).map(([entry, pkg]) => summary(entry, pkg));
const changed = installedEntries(candidate).filter(([entry, pkg]) => baseline.packages[entry] && baseline.packages[entry].version !== pkg.version)
  .map(([entry, pkg]) => ({ path: entry, name: packageName(entry), before: baseline.packages[entry], after: pkg }));
const manifests = ['', 'apps/hrms-web', 'apps/hrms-mobile'].map(folder => {
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'));
  return { workspace: folder || 'root', tailwindcss: manifest.devDependencies.tailwindcss, postcssPlugin: manifest.devDependencies['@tailwindcss/postcss'], tailwindMerge: manifest.dependencies['tailwind-merge'] };
});
if (manifests.some(m => m.tailwindcss !== '4.3.3' || m.postcssPlugin !== '4.3.3' || m.tailwindMerge !== '3.7.0')) throw new Error('Workspace build versions are incoherent');
const result = { baselineCommit: '1cfe067944f6e2b479efe8b72685f93bd2f8ae21', advisory: 'GHSA-vfj7-8cjw-p6xm', lockfileVersion: candidate.lockfileVersion,
  manifests, affectedBaselineGraph: affectedGraph(baseline), affectedCandidateGraph: affectedGraph(candidate),
  added, removed, changed, forbiddenRemaining: remaining, note: 'Full installed npm ls and both registry audits are separate runtime evidence; absence in this lock does not prove production exposure or deployment.' };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.info(`Recorded ${added.length} added, ${removed.length} removed, ${changed.length} changed lock entries; zero forbidden build entries.`);
