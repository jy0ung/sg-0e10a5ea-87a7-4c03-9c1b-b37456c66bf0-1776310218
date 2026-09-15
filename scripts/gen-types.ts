#!/usr/bin/env -S npx tsx
/**
 * gen-types.ts — Post-generation augmentation pass for database.types.ts
 *
 * Phase 0: Enum extraction & validation (dry-run report)
 * Phase 1: Full augmentation — rewrites Enums section, narrows table column
 *          types, updates Constants, and writes the augmented file.
 *
 * Parses all migration files to discover:
 * 1. CREATE TYPE ... AS ENUM (true PostgreSQL enums)
 * 2. CHECK (column IN ('v1', 'v2', ...)) constraints (logical enums on text columns)
 *
 * Handles constraint evolution (DROP + ADD CONSTRAINT — latest definition wins).
 * Filters out RLS policy CHECK constraints and non-enum CHECKs (length, numeric).
 *
 * Usage:
 *   npx tsx scripts/gen-types.ts           # Print report only (dry-run)
 *   npx tsx scripts/gen-types.ts --write    # Write augmented database.types.ts
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { enumNameOverrides, nullableRpcArgs } from '../packages/supabase/src/augmentations';

const root = process.cwd();
const migrationsDir = join(root, 'supabase', 'migrations');
const typesFile = join(root, 'packages', 'supabase', 'src', 'database.types.ts');
const augmentationsFile = join(root, 'packages', 'supabase', 'src', 'augmentations.ts');

const DRY_RUN = !process.argv.includes('--write');

// ─── Types ───────────────────────────────────────────────────────────────────

interface EnumDef {
  name: string;
  table: string;
  column: string;
  values: string[];
  sourceFile: string;
  nullable: boolean;
  kind: 'create_type' | 'check_constraint';
  constraintName?: string;
  sourceOffset?: number;
}

// ─── Migration file loading ──────────────────────────────────────────────────

function getMigrationFiles(): { name: string; path: string; content: string }[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({
      name,
      path: join(migrationsDir, name),
      content: readFileSync(join(migrationsDir, name), 'utf8'),
    }));
}

// ─── Enum name generation ────────────────────────────────────────────────────

function singularize(word: string): string {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('hes')) return word.slice(0, -2);
  if (word.endsWith('ses')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function generateEnumName(table: string, column: string): string {
  return `${singularize(table)}_${column}`;
}

// ─── Pattern: CREATE TYPE AS ENUM ─────────────────────────────────────────────

function parseCreateTypeEnums(content: string, sourceFile: string): EnumDef[] {
  const results: EnumDef[] = [];
  const pattern = /create\s+type\s+(?:public\.)?(\w+)\s+as\s+enum\s*\(([^)]+)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const typeName = match[1];
    const valuesBody = match[2];
    const values = parseEnumValues(valuesBody);
    if (values.length === 0) continue;

    results.push({
      name: typeName,
      table: '_postgres_enum',
      column: typeName,
      values,
      sourceFile,
      nullable: false,
      kind: 'create_type',
    });
  }

  return results;
}

// ─── Pattern: CHECK (column IN (...)) ─────────────────────────────────────────

function parseEnumValues(body: string): string[] {
  const values: string[] = [];
  const valuePattern = /'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = valuePattern.exec(body)) !== null) {
    values.push(match[1]);
  }
  return values;
}

function extractColumnFromCheck(checkBody: string): string | null {
  // Pattern: column_name IN (...)
  // Also handle: column_name IS NULL OR column_name IN (...)
  const colMatch = checkBody.match(/(\w+)\s+in\s*\(/i);
  if (colMatch) return colMatch[1];

  // Pattern: column_name IS NULL OR column_name IN (...)
  const nullOrMatch = checkBody.match(/(\w+)\s+is\s+null\s+or\s+\w+\s+in\s*\(/i);
  if (nullOrMatch) return nullOrMatch[1];

  return null;
}

function isInEnumCheck(checkBody: string): boolean {
  // Must have IN clause with string literals
  if (!/\bin\s*\(/i.test(checkBody)) return false;
  if (!/'[^']*'/.test(checkBody)) return false;

  // Exclude RLS policy checks
  if (/exists\s*\(/i.test(checkBody)) return false;
  if (/auth\.uid\(\)/i.test(checkBody)) return false;
  if (/current_role\(\)/i.test(checkBody)) return false;
  if (/current_company_id\(\)/i.test(checkBody)) return false;
  if (/is_same_company/i.test(checkBody)) return false;
  if (/can_access_row/i.test(checkBody)) return false;
  if (/can_read_profile/i.test(checkBody)) return false;

  // Exclude length checks
  if (/length\s*\(/i.test(checkBody)) return false;

  // Exclude checks with AND/OR containing non-enum conditions (compound checks)
  // that involve comparisons (>=, <=, >, <, =, <>) on non-enum columns.
  // A pure enum check is: column IN (...) or column IS NULL OR column IN (...)
  // If there are comparison operators alongside the IN clause, it's compound.
  const withoutInClause = checkBody.replace(/\bin\s*\([\s\S]*?\)/gi, '');
  if (/[<>]=?|!=|<>/.test(withoutInClause)) return false;

  // Exclude values that look like sentences (comment text captured by mistake)
  const values = parseEnumValues(checkBody);
  if (values.length === 0) return false;
  if (values.some((v) => v.length > 60 || v.includes('. '))) return false;

  return true;
}

function isNullableCheck(checkBody: string): boolean {
  return /\bis\s+null\s+or\b/i.test(checkBody);
}

function extractBalancedContent(source: string, startIdx: number, initialDepth = 1): string {
  let depth = initialDepth;
  let idx = startIdx;
  while (idx < source.length) {
    if (source[idx] === '(') depth++;
    else if (source[idx] === ')') {
      depth--;
      if (depth === 0) return source.slice(startIdx, idx);
    }
    idx++;
  }
  return source.slice(startIdx, idx);
}

// ─── Pattern: All CHECK constraints (unified) ──────────────────────────────────
// Finds every "CHECK (" in the file, extracts the balanced body, and if it's
// an enum check, looks backwards for the nearest CREATE TABLE or ALTER TABLE
// to determine the table name. This handles all three patterns:
// 1. CREATE TABLE with inline column CHECK
// 2. ALTER TABLE ADD CONSTRAINT ... CHECK
// 3. ALTER TABLE ADD COLUMN ... CHECK (inline)

function findNearestTable(content: string, checkIdx: number): string | null {
  const before = content.slice(0, checkIdx);
  // Search for both CREATE TABLE and ALTER TABLE, take the last match
  const tablePattern = /(?:create\s+table\s+(?:if\s+not\s+exists\s+)?|alter\s+table\s+)(?:public\.)?(\w+)/gi;
  let lastTable: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(before)) !== null) {
    lastTable = match[1];
  }
  return lastTable;
}

function findNearestConstraintName(content: string, checkIdx: number): string | undefined {
  return content.slice(0, checkIdx).match(/\bconstraint\s+(\w+)\s*$/i)?.[1];
}

function parseAllCheckConstraints(content: string, sourceFile: string): EnumDef[] {
  const results: EnumDef[] = [];
  // Match "check (" but not "with check" (RLS policy syntax uses "WITH CHECK")
  const checkPattern = /\bcheck\s*\(/gi;
  let checkMatch: RegExpExecArray | null;

  while ((checkMatch = checkPattern.exec(content)) !== null) {
    const checkStart = checkMatch.index + checkMatch[0].length - 1;
    const checkContent = extractBalancedContent(content, checkStart + 1, 1);

    if (!isInEnumCheck(checkContent)) continue;

    const column = extractColumnFromCheck(checkContent);
    if (!column) continue;

    const values = parseEnumValues(checkContent);
    if (values.length === 0) continue;

    const tableName = findNearestTable(content, checkMatch.index);
    if (!tableName) continue;

    const constraintName = findNearestConstraintName(content, checkMatch.index);

    results.push({
      name: generateEnumName(tableName, column),
      table: tableName,
      column,
      values,
      sourceFile,
      nullable: isNullableCheck(checkContent),
      kind: 'check_constraint',
      constraintName,
      sourceOffset: checkMatch.index,
    });
  }

  return results;
}

// ─── Merge: latest definition wins ────────────────────────────────────────────

function mergeEnums(allEnums: EnumDef[]): EnumDef[] {
  const byKey = new Map<string, EnumDef>();

  for (const def of allEnums) {
    const key = def.kind === 'create_type'
      ? `enum:${def.name}`
      : `check:${def.table}.${def.column}`;

    const existing = byKey.get(key);
    if (!existing || def.sourceFile >= existing.sourceFile) {
      byKey.set(key, def);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.table !== b.table) return a.table.localeCompare(b.table);
    return a.column.localeCompare(b.column);
  });
}

// ─── TypeScript emitter ───────────────────────────────────────────────────────

function emitEnumUnion(enumDef: EnumDef): string {
  const union = enumDef.values.map((v) => `"${v}"`).join('\n      | ');
  if (enumDef.nullable) {
    return `    ${enumDef.name}:\n      | ${union}\n      | null`;
  }
  return `    ${enumDef.name}:\n      | ${union}`;
}

function emitEnumsSection(enums: EnumDef[]): string {
  const lines = enums.map(emitEnumUnion);
  return `    Enums: {\n${lines.join(',\n')}\n    }`;
}

// ─── Column mapping: table.column → enum name ─────────────────────────────────

function emitColumnMappings(enums: EnumDef[]): string {
  const checkEnums = enums.filter((e) => e.kind === 'check_constraint');
  const lines = checkEnums.map((e) => {
    const nullable = e.nullable ? ' | null' : '';
    return `  // ${e.table}.${e.column} → ${e.name}${nullable}`;
  });
  return `// Table column → enum mapping (for augmentation pass)\n${lines.join('\n')}`;
}

// ─── Report ───────────────────────────────────────────────────────────────────

function generateReport(enums: EnumDef[]): string {
  const createTypeEnums = enums.filter((e) => e.kind === 'create_type');
  const checkEnums = enums.filter((e) => e.kind === 'check_constraint');

  const lines: string[] = [];
  lines.push('══════════════════════════════════════════════════════════════════════════════');
  lines.push('  gen-types.ts — Phase 0: Enum Extraction Report');
  lines.push('══════════════════════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Migrations scanned: ${getMigrationFiles().length} files`);
  lines.push(`Enums discovered:   ${enums.length} total (${createTypeEnums.length} CREATE TYPE + ${checkEnums.length} CHECK constraint)`);
  lines.push('');

  lines.push('─── CREATE TYPE AS ENUM ──────────────────────────────────────────────────────');
  for (const e of createTypeEnums) {
    lines.push(`  ${e.name}`);
    lines.push(`    values: [${e.values.join(', ')}]`);
    lines.push(`    source: ${relative(root, e.sourceFile)}`);
  }

  lines.push('');
  lines.push('─── CHECK Constraint Enums ────────────────────────────────────────────────────');
  lines.push('');

  // Group by table
  const byTable = new Map<string, EnumDef[]>();
  for (const e of checkEnums) {
    const list = byTable.get(e.table) ?? [];
    list.push(e);
    byTable.set(e.table, list);
  }

  for (const [table, tableEnums] of Array.from(byTable.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`  ${table}`);
    for (const e of tableEnums) {
      const nullMark = e.nullable ? ' (nullable)' : '';
      const constraintInfo = e.constraintName ? ` [${e.constraintName}]` : '';
      lines.push(`    .${e.column} → ${e.name}${nullMark}${constraintInfo}`);
      lines.push(`      values: [${e.values.join(', ')}]`);
      lines.push(`      source: ${relative(root, e.sourceFile)}`);
    }
    lines.push('');
  }

  lines.push('─── Generated Enums Section (preview) ─────────────────────────────────────────');
  lines.push('');
  lines.push(emitEnumsSection(enums));
  lines.push('');

  lines.push('');
  lines.push('─── Column Mapping (for augmentation) ──────────────────────────────────────────');
  lines.push('');
  lines.push(emitColumnMappings(enums));
  lines.push('');

  lines.push('');
  lines.push('─── Validation ────────────────────────────────────────────────────────────────');

  // Check against existing database.types.ts
  if (existsSync(typesFile)) {
    const existingTypes = readFileSync(typesFile, 'utf8');
    const existingEnumPattern = /(\w+):\s*\n\s*\| "[^"]+"/g;
    const existingEnums = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = existingEnumPattern.exec(existingTypes)) !== null) {
      existingEnums.add(m[1]);
    }

    const newEnums = enums.filter((e) => !existingEnums.has(e.name));
    const alreadyTyped = enums.filter((e) => existingEnums.has(e.name));

    lines.push(`  Already in database.types.ts: ${alreadyTyped.length}`);
    for (const e of alreadyTyped) {
      lines.push(`    ✓ ${e.name}`);
    }
    lines.push(`  New enums to inject:          ${newEnums.length}`);
    for (const e of newEnums) {
      lines.push(`    + ${e.name} (${e.table}.${e.column})`);
    }
  }

  lines.push('');
  lines.push(`Mode: ${DRY_RUN ? 'DRY-RUN (no files written)' : 'WRITE'}`);
  if (DRY_RUN) {
    lines.push('  Run with --write to augment database.types.ts');
  }
  lines.push('');
  lines.push('══════════════════════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ─── Write mode: augmentation pipeline ────────────────────────────────────────

function applyEnumNameOverrides(enums: EnumDef[]): EnumDef[] {
  return enums.map((e) => {
    const key = `${e.table}.${e.column}`;
    const override = enumNameOverrides[key];
    if (override) return { ...e, name: override };
    return e;
  });
}

function buildColumnMapping(enums: EnumDef[]): Map<string, { enumName: string; nullable: boolean }> {
  const map = new Map<string, { enumName: string; nullable: boolean }>();
  for (const e of enums) {
    if (e.kind === 'create_type') continue;
    const key = `${e.table}.${e.column}`;
    map.set(key, { enumName: e.name, nullable: e.nullable });
  }
  return map;
}

function replaceEnumsSection(content: string, enums: EnumDef[]): string {
  const lines = content.split('\n');
  let inPublicSchema = false;
  let enumsStartIdx = -1;
  let enumsEndIdx = -1;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s{2}public:\s*\{/.test(line)) {
      inPublicSchema = true;
      continue;
    }

    if (inPublicSchema && /^\s{4}Enums:\s*\{/.test(line)) {
      enumsStartIdx = i;
      braceDepth = 1;
      continue;
    }

    if (enumsStartIdx >= 0) {
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }
      if (braceDepth === 0) {
        enumsEndIdx = i;
        break;
      }
    }
  }

  if (enumsStartIdx < 0 || enumsEndIdx < 0) {
    throw new Error('Could not locate public.Enums section in database.types.ts');
  }

  const newEnumsLines = emitEnumsSection(enums).split('\n');
  const before = lines.slice(0, enumsStartIdx);
  const after = lines.slice(enumsEndIdx + 1);
  return [...before, ...newEnumsLines, ...after].join('\n');
}

function narrowColumns(content: string, columnMap: Map<string, { enumName: string; nullable: boolean }>): string {
  const lines = content.split('\n');
  let currentTable: string | null = null;
  let columnsNarrowed = 0;

  const tableStartPattern = /^\s{6}(\w+):\s*\{/;
  const columnPattern = /^(\s{10})(\w+)(\??):\s+string(\s+\|\s+null)?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const tableMatch = line.match(tableStartPattern);
    if (tableMatch) {
      currentTable = tableMatch[1];
      continue;
    }

    if (!currentTable) continue;

    const colMatch = line.match(columnPattern);
    if (!colMatch) continue;

    const indent = colMatch[1];
    const columnName = colMatch[2];
    const optional = colMatch[3];
    const nullPart = colMatch[4] ?? '';

    const key = `${currentTable}.${columnName}`;
    const mapping = columnMap.get(key);
    if (!mapping) continue;

    const enumRef = `Database["public"]["Enums"]["${mapping.enumName}"]`;
    lines[i] = `${indent}${columnName}${optional}: ${enumRef}${nullPart}`;
    columnsNarrowed++;
  }

  console.info(`  Columns narrowed: ${columnsNarrowed}`);
  return lines.join('\n');
}

function replaceConstantsSection(content: string, enums: EnumDef[]): string {
  const constEnumStart = content.indexOf('  public: {\n    Enums: {');
  if (constEnumStart < 0) {
    throw new Error('Could not locate Constants.public.Enums section');
  }

  const searchFrom = constEnumStart + '  public: {\n    Enums: {'.length;
  let braceDepth = 1;
  let endIdx = searchFrom;
  for (let i = searchFrom; i < content.length; i++) {
    if (content[i] === '{') braceDepth++;
    else if (content[i] === '}') {
      braceDepth--;
      if (braceDepth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  const constEnumsBody = enums.map((e) => {
    const values = e.values.map((v) => `"${v}"`).join(', ');
    return `      ${e.name}: [${values}]`;
  }).join(',\n');

  const before = content.slice(0, constEnumStart);
  const after = content.slice(endIdx + 1);
  return `${before}  public: {\n    Enums: {\n${constEnumsBody},\n    }${after}`;
}

function updateTimestamp(content: string): string {
  const now = new Date().toISOString();
  return content.replace(
    /\/\/ Last updated: .*/,
    `// Last updated: ${now}`,
  );
}

export function applyNullableRpcArgs(content: string, overrides: Record<string, string[]>): string {
  for (const [rpc, args] of Object.entries(overrides)) {
    const start = content.indexOf(`${rpc}:`, content.indexOf('    Functions: {'));
    if (start < 0) throw new Error(`Missing RPC augmentation target: ${rpc}`);
    const next = /^ {6}\w+:/m.exec(content.slice(start + rpc.length + 1));
    const end = next ? start + rpc.length + 1 + next.index : content.indexOf('    Enums:', start);
    if (end < 0) throw new Error(`Cannot locate end of RPC: ${rpc}`);
    let block = content.slice(start, end);
    for (const arg of args) {
      if (!new RegExp(`\\b${arg}\\??:`).test(block)) throw new Error(`Missing RPC argument: ${rpc}.${arg}`);
      block = block.replace(new RegExp(`(\\b${arg}\\??: (?:string|boolean))(?![\\w]| \\| null)`, 'g'), '$1 | null');
    }
    content = content.slice(0, start) + block + content.slice(end);
  }
  return content;
}

function writeAugmentedFile(enums: EnumDef[]): void {
  if (!existsSync(typesFile)) {
    console.error(`ERROR: ${relative(root, typesFile)} not found.`);
    process.exit(1);
  }

  console.info('\n─── Augmenting database.types.ts ─────────────────────────────────────────────');

  let content = readFileSync(typesFile, 'utf8');
  const originalSize = content.length;

  // Undo references to removed CHECK enums when re-running on augmented output.
  const activeNames = new Set(enums.map((entry) => entry.name));
  content = content.replace(/Database\["public"\]\["Enums"\]\["([^"\]]+)"\]/g,
    (reference, name: string) => activeNames.has(name) ? reference : 'string');

  console.info('  Replacing Enums section...');
  content = replaceEnumsSection(content, enums);

  console.info('  Narrowing table column types...');
  const columnMap = buildColumnMapping(enums);
  content = narrowColumns(content, columnMap);

  console.info('  Replacing Constants section...');
  content = replaceConstantsSection(content, enums);

  content = applyNullableRpcArgs(content, nullableRpcArgs);
  if (content === readFileSync(typesFile, 'utf8')) {
    console.info('  Types already match the migrations and augmentations.');
    return;
  }
  writeFileSync(typesFile, content, 'utf8');
  console.info(`  Written: ${relative(root, typesFile)}`);
  console.info(`  Size: ${originalSize} → ${content.length} bytes (+${content.length - originalSize})`);

  const typesTsPath = join(root, 'packages', 'supabase', 'src', 'types.ts');
  if (existsSync(typesTsPath)) {
    console.info('  Updating timestamp in types.ts...');
    const typesTsContent = readFileSync(typesTsPath, 'utf8');
    const updated = updateTimestamp(typesTsContent);
    writeFileSync(typesTsPath, updated, 'utf8');
    console.info(`  Written: ${relative(root, typesTsPath)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function discoverEnums(files: Array<{ path: string; content: string }>): EnumDef[] {
  const allEnums: EnumDef[] = [];

  for (const file of files) {
    allEnums.push(...parseCreateTypeEnums(file.content, file.path));
    allEnums.push(...parseAllCheckConstraints(file.content, file.path));
  }

  // A later DROP without a replacement removes the logical enum entirely.
  const activeEnums = allEnums.filter((def) => {
    if (def.kind !== 'check_constraint') return true;
    const constraint = def.constraintName ?? `${def.table}_${def.column}_check`;
    return !files.some((file) => file.path >= def.sourceFile &&
      Array.from(file.content.matchAll(/drop\s+constraint\s+(?:if\s+exists\s+)?(\w+)/gi))
        .some((match) => (file.path > def.sourceFile || match.index! > (def.sourceOffset ?? 0)) &&
          match[1] === constraint && findNearestTable(file.content, match.index!) === def.table));
  });
  let merged = mergeEnums(activeEnums);
  merged = applyEnumNameOverrides(merged);
  return merged;
}

function main() {
  const merged = discoverEnums(getMigrationFiles());

  const report = generateReport(merged);
  console.info(report);

  if (!DRY_RUN) {
    if (!existsSync(augmentationsFile)) {
      console.error(`\nERROR: ${relative(root, augmentationsFile)} does not exist. Create it first.`);
      process.exit(1);
    }
    writeAugmentedFile(merged);
    console.info('\n✓ Augmentation complete. Run `npm run typecheck` to verify.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
