import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

type ChunkBudget = {
  label: string;
  pattern: RegExp;
  rawKb: number;
  gzipKb: number;
};

const rootDir = process.cwd();
const distAssetsDir = resolve(rootDir, 'dist/assets');
const sourceDir = resolve(rootDir, 'src');

const chunkBudgets: ChunkBudget[] = [
  { label: 'app entry', pattern: /^index-[\w-]+\.js$/, rawKb: 380, gzipKb: 120 },
  { label: 'React vendor', pattern: /^vendor-react-[\w-]+\.js$/, rawKb: 260, gzipKb: 90 },
  { label: 'UI vendor', pattern: /^vendor-ui-[\w-]+\.js$/, rawKb: 310, gzipKb: 95 },
  { label: 'data vendor', pattern: /^vendor-data-[\w-]+\.js$/, rawKb: 320, gzipKb: 90 },
  { label: 'forms vendor', pattern: /^vendor-forms-[\w-]+\.js$/, rawKb: 180, gzipKb: 55 },
  { label: 'charts vendor', pattern: /^vendor-charts-[\w-]+\.js$/, rawKb: 520, gzipKb: 145 },
  { label: 'Excel async vendor', pattern: /^vendor-excel-[\w-]+\.js$/, rawKb: 1_150, gzipKb: 330 },
];

const routeChunkBudget = { label: 'lazy route chunk', rawKb: 250, gzipKb: 80 };

function kb(bytes: number): number {
  return Math.round((bytes / 1024) * 10) / 10;
}

function findBudget(fileName: string): ChunkBudget | { label: string; rawKb: number; gzipKb: number } {
  return chunkBudgets.find(budget => budget.pattern.test(fileName)) ?? routeChunkBudget;
}

function walkFiles(dir: string, results: string[] = []): string[] {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, results);
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function assertNoStaticExcelImports(errors: string[]) {
  const productionSourceFiles = walkFiles(sourceDir)
    .filter(file => /\.(ts|tsx)$/.test(file))
    .filter(file => !/\.(test|spec)\.(ts|tsx)$/.test(file));
  const staticExcelImport = /import\s+(?:type\s+)?[^;]*from\s+['"]exceljs['"]/;

  for (const file of productionSourceFiles) {
    const content = readFileSync(file, 'utf8');
    if (staticExcelImport.test(content)) {
      errors.push(`${relative(rootDir, file)} statically imports exceljs; use src/lib/exceljs-loader.ts instead.`);
    }
  }
}

function assertBundleBudgets(errors: string[]) {
  if (!existsSync(distAssetsDir)) {
    errors.push('dist/assets does not exist. Run npm run build before npm run bundle:budget.');
    return;
  }

  const jsFiles = readdirSync(distAssetsDir)
    .filter(file => file.endsWith('.js'))
    .sort();

  if (jsFiles.length === 0) {
    errors.push('No JavaScript chunks found in dist/assets.');
    return;
  }

  console.info('Bundle budget summary:');

  for (const file of jsFiles) {
    const fullPath = join(distAssetsDir, file);
    const rawBytes = statSync(fullPath).size;
    const gzipBytes = gzipSync(readFileSync(fullPath)).length;
    const budget = findBudget(file);
    const rawSizeKb = kb(rawBytes);
    const gzipSizeKb = kb(gzipBytes);

    console.info(`- ${file}: ${rawSizeKb} kB raw / ${gzipSizeKb} kB gzip (${budget.label})`);

    if (rawSizeKb > budget.rawKb || gzipSizeKb > budget.gzipKb) {
      errors.push(
        `${file} exceeds ${budget.label} budget: ${rawSizeKb}/${budget.rawKb} kB raw, ${gzipSizeKb}/${budget.gzipKb} kB gzip.`,
      );
    }
  }
}

const errors: string[] = [];
assertNoStaticExcelImports(errors);
assertBundleBudgets(errors);

if (errors.length > 0) {
  console.error('\nBundle budget check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.info('\nBundle budget check passed.');