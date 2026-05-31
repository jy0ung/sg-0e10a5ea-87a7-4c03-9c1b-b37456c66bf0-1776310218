#!/usr/bin/env -S npx tsx
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { isPlatformMismatchError } from '../src/lib/platformErrors';

type Canary = {
  module: string;
  name: string;
  rpc: string;
  args: Record<string, unknown>;
};

type SmokeProfile = {
  company_id?: string | null;
  role?: string | null;
};

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireEnv(name: string, fallbackName?: string): string {
  const value = readEnv(name) ?? (fallbackName ? readEnv(fallbackName) : undefined);
  if (!value) {
    const suffix = fallbackName ? ` or ${fallbackName}` : '';
    throw new Error(`Missing required environment variable ${name}${suffix}`);
  }
  return value;
}

function isoDate(daysFromToday: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function buildCanaries(companyId: string, role: string): Canary[] {
  const fromDate = isoDate(-7);
  const toDate = isoDate(0);

  return [
    {
      module: 'Home/KPI',
      name: 'Role-aware Home KPIs',
      rpc: 'get_role_home_kpis',
      args: { p_company_id: companyId, p_role: role },
    },
    {
      module: 'Sales',
      name: 'Sales dashboard summary',
      rpc: 'get_sales_dashboard_summary',
      args: { p_company_id: companyId, p_branch_code: undefined },
    },
    {
      module: 'Sales',
      name: 'Sales pipeline summary',
      rpc: 'get_sales_pipeline_summary',
      args: {
        p_company_id: companyId,
        p_branch_code: undefined,
        p_from_date: undefined,
        p_to_date: undefined,
      },
    },
    {
      module: 'Auto Aging',
      name: 'Dashboard summary',
      rpc: 'auto_aging_dashboard_summary',
      args: {
        p_branch: undefined,
        p_model: undefined,
        p_from: undefined,
        p_to: undefined,
      },
    },
    {
      module: 'Finance',
      name: 'Profit and loss',
      rpc: 'get_profit_loss',
      args: { p_company_id: companyId, p_period_id: ZERO_UUID },
    },
    {
      module: 'Finance',
      name: 'Balance sheet',
      rpc: 'get_balance_sheet',
      args: { p_company_id: companyId, p_period_id: ZERO_UUID },
    },
    {
      module: 'Finance',
      name: 'AR aging by branch',
      rpc: 'get_ar_aging_by_branch',
      args: { p_company_id: companyId },
    },
    {
      module: 'Finance',
      name: 'AP aging by branch',
      rpc: 'get_ap_aging_by_branch',
      args: { p_company_id: companyId },
    },
    {
      module: 'Finance',
      name: 'Cash position',
      rpc: 'get_cash_position',
      args: { p_company_id: companyId, p_from_date: fromDate, p_to_date: toDate },
    },
    {
      module: 'Finance',
      name: 'Period close summary',
      rpc: 'get_period_close_summary',
      args: { p_company_id: companyId, p_period_id: ZERO_UUID },
    },
    {
      module: 'DMS Sync',
      name: 'Sync runs summary',
      rpc: 'get_dms_sync_runs_summary',
      args: { p_company_id: companyId },
    },
    {
      module: 'DMS Sync',
      name: 'Raw staging counts',
      rpc: 'get_dms_raw_staging_counts',
      args: { p_company_id: companyId },
    },
    {
      module: 'Reconciliation',
      name: 'Status counts',
      rpc: 'get_reconciliation_status_counts',
      args: { p_company_id: companyId },
    },
    {
      module: 'Lead Intake',
      name: 'Leads feed',
      rpc: 'get_leads_feed',
      args: {
        p_company_id: companyId,
        p_kind: undefined,
        p_status: undefined,
        p_branch_code: undefined,
        p_limit: 1,
      },
    },
    {
      module: 'Purchasing',
      name: 'PO line receipts',
      rpc: 'get_po_line_receipts',
      args: { p_company_id: companyId, p_po_id: ZERO_UUID },
    },
    {
      module: 'Purchasing',
      name: '3-way match status counts',
      rpc: 'get_three_way_match_status_counts',
      args: { p_company_id: companyId },
    },
    {
      module: 'Webhooks',
      name: 'Requeue delivery registration check',
      rpc: 'requeue_webhook_delivery',
      args: { p_id: ZERO_UUID },
    },
  ];
}

function formatError(error: unknown): string {
  if (!error) return 'no error';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return ['code', 'message', 'details', 'hint']
      .map((key) => record[key])
      .filter((value) => value !== undefined && value !== null)
      .map(String)
      .join(' | ');
  }
  return String(error);
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnv('SMOKE_SUPABASE_URL');
  const supabaseAnon = requireEnv('SMOKE_SUPABASE_ANON');
  const loginEmail = requireEnv('SMOKE_LOGIN_EMAIL');
  const loginPassword = requireEnv('SMOKE_LOGIN_PASSWORD', 'SMOKE_LOGIN_PASS');

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket,
    },
  });

  const { data: sessionData, error: loginError } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password: loginPassword,
  });
  if (loginError || !sessionData.user) {
    throw new Error(`Smoke login failed: ${formatError(loginError)}`);
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', sessionData.user.id)
    .single();
  if (profileError) {
    throw new Error(`Could not load smoke user profile: ${formatError(profileError)}`);
  }

  const profile = profileData as SmokeProfile | null;
  const companyId = profile?.company_id;
  const role = profile?.role ?? 'creator_updater';
  if (!companyId) {
    throw new Error('Smoke user profile is missing company_id; cannot run company-scoped RPC canaries.');
  }

  const failures: string[] = [];
  for (const canary of buildCanaries(companyId, role)) {
    const { error } = await supabase.rpc(canary.rpc, canary.args);
    if (error && isPlatformMismatchError(error)) {
      const detail = `${canary.module} / ${canary.name} (${canary.rpc}): ${formatError(error)}`;
      failures.push(detail);
      console.error(`FAIL ${detail}`);
      continue;
    }

    if (error) {
      console.info(`PASS ${canary.module} / ${canary.name} (${canary.rpc}) registered; accepted non-schema error: ${formatError(error)}`);
    } else {
      console.info(`PASS ${canary.module} / ${canary.name} (${canary.rpc})`);
    }
  }

  if (failures.length > 0) {
    console.error('');
    console.error('RPC canary schema drift detected:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.info('');
  console.info('RPC canary check passed: no schema-cache or missing-object errors detected.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
