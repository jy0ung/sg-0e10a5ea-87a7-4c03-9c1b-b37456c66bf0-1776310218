#!/usr/bin/env -S npx tsx
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const migrationsDir = join(root, 'supabase', 'migrations');

type Finding = {
  file: string;
  message: string;
};

type SqlCheck = {
  kind: 'required' | 'forbidden';
  pattern: RegExp;
  message: string;
};

type FunctionTarget = {
  functionName: string;
  checks: SqlCheck[];
};

const findings: Finding[] = [];

function addFinding(filePath: string, message: string) {
  findings.push({ file: relative(root, filePath), message });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => join(migrationsDir, name));
}

function getLatestFunctionDefinition(functionName: string): { filePath: string; source: string } {
  const matcher = new RegExp(`create\\s+or\\s+replace\\s+function\\s+${escapeRegex(functionName)}\\s*\\(`, 'i');

  let latestMatch: { filePath: string; source: string } | null = null;
  for (const filePath of getMigrationFiles()) {
    const source = readFileSync(filePath, 'utf8');
    const match = matcher.exec(source);
    if (!match) {
      continue;
    }

    latestMatch = {
      filePath,
      source: source.slice(match.index),
    };
  }

  if (!latestMatch) {
    throw new Error(`No migration defines ${functionName}`);
  }

  return latestMatch;
}

const targets: FunctionTarget[] = [
  {
    functionName: 'public.commit_import_batch',
    checks: [
      {
        kind: 'required',
        pattern: /jsonb_to_recordset\s*\(\s*p_vehicles\s*\)[\s\S]*?\bdealer_transfer_price\s+text\b/i,
        message: 'latest commit_import_batch recordset must declare dealer_transfer_price as text to match public.vehicles',
      },
      {
        kind: 'required',
        pattern: /jsonb_to_recordset\s*\(\s*p_vehicles\s*\)[\s\S]*?\bcompany_id\s+text\b/i,
        message: 'latest commit_import_batch recordset must declare company_id as text for multi-tenant upserts',
      },
    ],
  },
  {
    functionName: 'public.auto_aging_dashboard_summary',
    checks: [
      {
        kind: 'forbidden',
        pattern: /\bis_incomplete\b/i,
        message: 'latest auto_aging_dashboard_summary must not reference vehicles.is_incomplete because the live schema does not persist it',
      },
    ],
  },
];

for (const target of targets) {
  const { filePath, source } = getLatestFunctionDefinition(target.functionName);

  for (const check of target.checks) {
    const matched = check.pattern.test(source);
    if (check.kind === 'required' && !matched) {
      addFinding(filePath, check.message);
    }
    if (check.kind === 'forbidden' && matched) {
      addFinding(filePath, check.message);
    }
  }
}

if (findings.length > 0) {
  console.error('RPC contract check failed:');
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.message}`);
  }
  process.exit(1);
}

console.info('RPC contract check passed.');