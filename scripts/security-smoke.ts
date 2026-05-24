#!/usr/bin/env -S npx tsx
import process from 'node:process';

// Penetration smoke for edge function auth boundaries. Hits every edge
// function with: no Authorization header, a stale/invalid bearer, and a
// well-formed but wrong-company bearer (when SMOKE_WRONG_COMPANY_JWT is
// supplied). Verifies expected 401/403/429 responses.
//
// This is intentionally not bundled into vitest — it talks to a live
// Supabase environment and is meant for on-demand operator runs and
// nightly CI smoke.
//
// Required env:
//   SMOKE_SUPABASE_URL              base URL, e.g. https://ubs.protonfookloi.com
//   SMOKE_VALID_JWT                 (optional) valid bearer for happy-path 200
//   SMOKE_WRONG_COMPANY_JWT         (optional) valid bearer but wrong company_id
//
// Run:  npm run security:smoke
//       SMOKE_SUPABASE_URL=http://127.0.0.1:54321 npm run security:smoke

interface Probe {
  name: string;
  path: string;
  // Expected status codes for each probe type. 4xx are required to pass.
  expectAnonymous: number;     // no Authorization header
  expectInvalidBearer: number; // garbage bearer
  expectWrongCompany?: number; // wrong-company bearer (skipped if env missing)
  body: Record<string, unknown>;
}

const PROBES: Probe[] = [
  {
    name: 'invite-user',
    path: '/functions/v1/invite-user',
    expectAnonymous: 401,
    expectInvalidBearer: 401,
    expectWrongCompany: 403,
    body: {
      email: 'smoke@invalid.example',
      name: 'Smoke',
      role: 'sales',
      company_id: '00000000-0000-0000-0000-000000000000',
    },
  },
  {
    name: 'delete-user',
    path: '/functions/v1/delete-user',
    expectAnonymous: 401,
    expectInvalidBearer: 401,
    expectWrongCompany: 403,
    body: { user_id: '00000000-0000-0000-0000-000000000000', action: 'delete' },
  },
  {
    name: 'update-user-status',
    path: '/functions/v1/update-user-status',
    expectAnonymous: 401,
    expectInvalidBearer: 401,
    expectWrongCompany: 403,
    body: { user_id: '00000000-0000-0000-0000-000000000000', status: 'inactive' },
  },
  {
    name: 'rollover-leave-balances',
    path: '/functions/v1/rollover-leave-balances',
    expectAnonymous: 401,
    expectInvalidBearer: 401,
    expectWrongCompany: 403,
    body: { company_id: '00000000-0000-0000-0000-000000000000', from_year: 2025, to_year: 2026 },
  },
  {
    name: 'send-push-notification',
    path: '/functions/v1/send-push-notification',
    expectAnonymous: 401,
    expectInvalidBearer: 401,
    expectWrongCompany: 403,
    body: { user_ids: ['00000000-0000-0000-0000-000000000000'], title: 'x', body: 'y' },
  },
  {
    name: 'dms-sync-worker',
    path: '/functions/v1/dms-sync-worker',
    expectAnonymous: 401,
    expectInvalidBearer: 401,
    expectWrongCompany: 403,
    body: { target: 'sales_orders', records: [] },
  },
];

const baseUrl = process.env.SMOKE_SUPABASE_URL;
if (!baseUrl) {
  console.error('SMOKE_SUPABASE_URL is required.');
  process.exit(2);
}

const wrongCompanyJwt = process.env.SMOKE_WRONG_COMPANY_JWT ?? '';

interface ProbeResult {
  probe: string;
  variant: 'anonymous' | 'invalid-bearer' | 'wrong-company';
  expected: number;
  actual: number;
  pass: boolean;
}

async function hit(path: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<number> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return res.status;
}

async function runProbe(p: Probe): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];

  const anon = await hit(p.path, p.body, {});
  results.push({
    probe: p.name,
    variant: 'anonymous',
    expected: p.expectAnonymous,
    actual: anon,
    pass: anon === p.expectAnonymous,
  });

  const invalid = await hit(p.path, p.body, { Authorization: 'Bearer not-a-real-jwt' });
  results.push({
    probe: p.name,
    variant: 'invalid-bearer',
    expected: p.expectInvalidBearer,
    actual: invalid,
    pass: invalid === p.expectInvalidBearer,
  });

  if (wrongCompanyJwt && p.expectWrongCompany !== undefined) {
    const wrong = await hit(p.path, p.body, { Authorization: `Bearer ${wrongCompanyJwt}` });
    results.push({
      probe: p.name,
      variant: 'wrong-company',
      expected: p.expectWrongCompany,
      actual: wrong,
      pass: wrong === p.expectWrongCompany,
    });
  }

  return results;
}

async function main() {
  const all: ProbeResult[] = [];
  for (const p of PROBES) {
    const r = await runProbe(p);
    all.push(...r);
  }

  const passed = all.filter((r) => r.pass).length;
  const failed = all.filter((r) => !r.pass);

  console.log(`\nSecurity smoke: ${passed}/${all.length} checks passed.\n`);
  if (failed.length > 0) {
    console.log('Failures:');
    for (const f of failed) {
      console.log(`  ✗ ${f.probe} [${f.variant}] — expected ${f.expected}, got ${f.actual}`);
    }
    process.exit(1);
  }
  console.log('All boundary checks behaved as expected.');
}

main().catch((err) => {
  console.error('Smoke failed:', err);
  process.exit(1);
});
