#!/usr/bin/env -S npx tsx
/**
 * Seed two company tenants + one user each for the RLS matrix harness.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service role, never
 * the anon key). Idempotent — safe to re-run against local or explicitly
 * approved non-production targets.
 *
 * Usage:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
 *   npx tsx scripts/seed-rls-users.ts
 *
 * Cleanup:
 *   SUPABASE_URL=https://<staging-or-prod-ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
 *   CONFIRM_RLS_TEST_CLEANUP=delete-rls-test-data \
 *   npx tsx scripts/seed-rls-users.ts --cleanup
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLEANUP = process.argv.includes('--cleanup');
const ALLOW_REMOTE_RLS_SEED = process.env.ALLOW_REMOTE_RLS_SEED === '1';
const CONFIRM_RLS_TEST_CLEANUP = process.env.CONFIRM_RLS_TEST_CLEANUP;

const TEST_COMPANIES = [
  { id: 'rls-a', name: 'RLS Company A', code: 'RLS-A' },
  { id: 'rls-b', name: 'RLS Company B', code: 'RLS-B' },
] as const;

const TEST_USERS = [
  { email: 'a@rls.test', password: 'Test1234!', companyId: 'rls-a' },
  { email: 'b@rls.test', password: 'Test1234!', companyId: 'rls-b' },
] as const;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

function isLocalSupabaseTarget(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

if (!CLEANUP && !isLocalSupabaseTarget(SUPABASE_URL) && !ALLOW_REMOTE_RLS_SEED) {
  console.error(
    'Refusing to seed RLS test users against a non-local Supabase target. Use ALLOW_REMOTE_RLS_SEED=1 only for an isolated staging environment.',
  );
  process.exit(1);
}

if (CLEANUP && CONFIRM_RLS_TEST_CLEANUP !== 'delete-rls-test-data') {
  console.error(
    'Cleanup requires CONFIRM_RLS_TEST_CLEANUP=delete-rls-test-data to avoid accidental deletion.',
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function upsertCompany(id: string, name: string, code: string): Promise<string> {
  const { data: existing } = await admin
    .from('companies')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await admin
    .from('companies')
    .insert({ id, name, code })
    .select('id')
    .single();
  if (error) throw new Error(`companies insert failed: ${error.message}`);
  return data.id as string;
}

async function upsertUser(email: string, password: string, companyId: string): Promise<string> {
  // Create or fetch the auth user via admin API.
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === email);
  const userId = existing
    ? existing.id
    : (
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        })
      ).data.user?.id;
  if (!userId) throw new Error(`Failed to create/find user ${email}`);

  // Ensure a company-scoped profile exists. We bypass handle_new_user's
  // metadata lock-down by writing directly with the service-role key.
  const { error } = await admin.from('profiles').upsert({
    id: userId,
    email,
    name: email.split('@')[0],
    role: 'analyst',
    access_scope: 'self',
    company_id: companyId,
    status: 'active',
  });
  if (error) throw new Error(`profiles upsert failed for ${email}: ${error.message}`);
  return userId;
}

async function cleanupTestData() {
  const emails = TEST_USERS.map((user) => user.email);
  const companyIds = TEST_COMPANIES.map((company) => company.id);

  const { error: profileErr } = await admin
    .from('profiles')
    .delete()
    .in('email', [...emails]);
  if (profileErr) throw new Error(`profiles cleanup failed: ${profileErr.message}`);

  for (const email of emails) {
    const userId = await findAuthUserId(email);
    if (!userId) continue;
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(`auth.admin.deleteUser failed for ${email}: ${error.message}`);
  }

  const { error: companyErr } = await admin
    .from('companies')
    .delete()
    .in('id', [...companyIds]);
  if (companyErr) {
    throw new Error(
      `companies cleanup failed: ${companyErr.message}. Remove remaining tenant-scoped rows for ${companyIds.join(', ')} before retrying.`,
    );
  }

  console.info(
    JSON.stringify(
      {
        ok: true,
        removedCompanies: companyIds,
        removedUsers: emails,
      },
      null,
      2,
    ),
  );
}

async function main() {
  if (CLEANUP) {
    await cleanupTestData();
    return;
  }

  const companyAId = await upsertCompany(TEST_COMPANIES[0].id, TEST_COMPANIES[0].name, TEST_COMPANIES[0].code);
  const companyBId = await upsertCompany(TEST_COMPANIES[1].id, TEST_COMPANIES[1].name, TEST_COMPANIES[1].code);
  const userAId = await upsertUser(TEST_USERS[0].email, TEST_USERS[0].password, companyAId);
  const userBId = await upsertUser(TEST_USERS[1].email, TEST_USERS[1].password, companyBId);
  console.info(
    JSON.stringify(
      {
        companyAId,
        companyBId,
        userAId,
        userBId,
        credentials: {
          RLS_USER_A_EMAIL: TEST_USERS[0].email,
          RLS_USER_A_PASSWORD: TEST_USERS[0].password,
          RLS_USER_B_EMAIL: TEST_USERS[1].email,
          RLS_USER_B_PASSWORD: TEST_USERS[1].password,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
