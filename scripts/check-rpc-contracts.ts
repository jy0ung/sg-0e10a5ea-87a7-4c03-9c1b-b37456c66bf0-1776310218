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
  const bareFunctionName = functionName.includes('.')
    ? functionName.split('.').at(-1) ?? functionName
    : functionName;
  const matcher = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+(?:public\\s*\\.\\s*)?${escapeRegex(bareFunctionName)}\\s*\\(`,
    'i',
  );

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
  {
    functionName: 'public.global_search',
    checks: [
      {
        kind: 'required',
        pattern: /security\s+invoker/i,
        message: 'global_search must remain SECURITY INVOKER so RLS does the company / role filtering',
      },
      {
        kind: 'required',
        pattern: /returns\s+table\s*\([\s\S]*?\bentity_type\s+text\b/i,
        message: 'global_search must return a row set including an entity_type column the client switches on',
      },
      {
        kind: 'forbidden',
        pattern: /security\s+definer/i,
        message: 'global_search must NOT be SECURITY DEFINER — that would bypass per-table RLS and leak rows across companies',
      },
    ],
  },
  // ─── Phase 4b / 5a — Role-aware Home ──────────────────────────────────────
  {
    functionName: 'get_role_home_kpis',
    checks: [
      {
        kind: 'required',
        pattern: /\(\s*p_company_id\s+text\s*,\s*p_role\s+text\s*\)/i,
        message: 'get_role_home_kpis must keep (p_company_id text, p_role text) — the Home page calls it by named args',
      },
      {
        kind: 'required',
        pattern: /landing_route\s+text/i,
        message: 'get_role_home_kpis must return landing_route — the Role-aware Home reads it for KPI deep-links',
      },
      {
        kind: 'required',
        pattern: /security\s+definer/i,
        message: 'get_role_home_kpis must be SECURITY DEFINER so its auth check can read profiles',
      },
      {
        kind: 'required',
        pattern: /RAISE\s+EXCEPTION\s+'Unauthorized'/i,
        message: 'get_role_home_kpis must keep its caller-company auth guard before returning data',
      },
    ],
  },
  {
    functionName: 'upsert_role_kpi_defaults',
    checks: [
      {
        kind: 'required',
        pattern: /\(\s*p_company_id\s+text\s*,\s*p_role\s+text\s*,\s*p_kpi_codes\s+text\[\]\s*\)/i,
        message: 'upsert_role_kpi_defaults signature must stay (text, text, text[]) — KPI Studio depends on it',
      },
      {
        kind: 'required',
        pattern: /RAISE\s+EXCEPTION\s+'Unauthorized'/i,
        message: 'upsert_role_kpi_defaults must remain admin-gated',
      },
    ],
  },
  // ─── Phase 3b — Financial reports ─────────────────────────────────────────
  {
    functionName: 'get_profit_loss',
    checks: [
      {
        kind: 'required',
        pattern: /p_company_id\s+text/i,
        message: 'get_profit_loss must accept p_company_id text — accounts UI calls it by named args',
      },
    ],
  },
  {
    functionName: 'get_balance_sheet',
    checks: [
      {
        kind: 'required',
        pattern: /p_company_id\s+text/i,
        message: 'get_balance_sheet must accept p_company_id text',
      },
    ],
  },
  {
    functionName: 'get_ar_aging_by_branch',
    checks: [
      {
        kind: 'required',
        pattern: /p_company_id\s+text/i,
        message: 'get_ar_aging_by_branch must accept p_company_id text',
      },
    ],
  },
  {
    functionName: 'get_ap_aging_by_branch',
    checks: [
      {
        kind: 'required',
        pattern: /p_company_id\s+text/i,
        message: 'get_ap_aging_by_branch must accept p_company_id text',
      },
    ],
  },
  // ─── Phase 6a — Webhook outbox ────────────────────────────────────────────
  {
    functionName: 'emit_webhook_event',
    checks: [
      {
        kind: 'required',
        pattern: /security\s+definer/i,
        message: 'emit_webhook_event must be SECURITY DEFINER — it writes to webhook_outbox on behalf of business RPCs',
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
