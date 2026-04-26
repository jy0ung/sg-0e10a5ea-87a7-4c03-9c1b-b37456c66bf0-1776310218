#!/usr/bin/env -S npx tsx
/**
 * Bootstrap Admin — idempotent day-1 provisioning for a new environment.
 *
 * Solves the chicken-and-egg problem created by handle_new_user():
 *   every new auth user lands as role='analyst' / company_id=NULL /
 *   status='pending', and AuthContext signs such users out. A fresh env
 *   therefore has no admin to activate the first admin.
 *
 * This script, run with the service-role key, will:
 *   1. Create the auth user if missing (email + password, email_confirm=true).
 *   2. Ensure a company row exists.
 *   3. Upsert the profile as an active super_admin with global access_scope.
 *
 * Safe to re-run. Never use the anon/publishable key — this requires
 * SUPABASE_SERVICE_ROLE_KEY and MUST be run from a trusted environment
 * (CI secret, admin workstation). Never ship the service-role key to the
 * browser or commit it to the repo.
 *
 * Usage:
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   ADMIN_EMAIL=admin@example.com \
 *   ADMIN_PASSWORD='StrongPassword!1' \
 *   COMPANY_NAME='FLC' \
 *   npx tsx scripts/bootstrap-admin.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const COMPANY_NAME = process.env.COMPANY_NAME ?? 'FLC';

function fail(msg: string): never {
  console.error(`[bootstrap-admin] ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) fail('Missing SUPABASE_URL (or VITE_SUPABASE_URL).');
if (!SERVICE_KEY) fail('Missing SUPABASE_SERVICE_ROLE_KEY.');
if (!ADMIN_EMAIL) fail('Missing ADMIN_EMAIL.');
if (!ADMIN_PASSWORD) fail('Missing ADMIN_PASSWORD.');

// Guardrail: reject keys that look like anon/publishable keys. Legacy service
// role keys are JWTs whose payload declares "role":"service_role"; anon keys
// declare "role":"anon". Current local Supabase stacks expose non-JWT
// secret keys prefixed with "sb_secret_".
if (SERVICE_KEY.startsWith('sb_publishable_')) {
  fail('SUPABASE_SERVICE_ROLE_KEY looks like a publishable key. Use the service-role key.');
}
if (SERVICE_KEY.startsWith('sb_') && !SERVICE_KEY.startsWith('sb_secret_')) {
  fail('SUPABASE_SERVICE_ROLE_KEY has an unrecognized sb_ prefix. Use the service-role/secret key.');
}
try {
  const payload = JSON.parse(Buffer.from(SERVICE_KEY.split('.')[1] ?? '', 'base64').toString());
  if (payload?.role && payload.role !== 'service_role') {
    fail(`SUPABASE_SERVICE_ROLE_KEY has role="${payload.role}"; expected "service_role".`);
  }
} catch {
  // Non-JWT key formats — accept and let Supabase reject at call time.
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'default';
}

async function ensureCompany(name: string): Promise<string> {
  const id = slugify(name);
  const { data: existing, error: selErr } = await admin
    .from('companies')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (selErr) throw new Error(`companies lookup failed: ${selErr.message}`);
  if (existing) return existing.id as string;

  const { error: insErr } = await admin
    .from('companies')
    .insert({ id, name, code: id.toUpperCase() });
  if (insErr) throw new Error(`companies insert failed: ${insErr.message}`);
  return id;
}

async function findAuthUserId(email: string): Promise<string | null> {
  // listUsers paginates 50 at a time by default. Walk pages until we find
  // the email or exhaust the list. Fine for day-1 bootstrap on a small env.
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
    page += 1;
    if (page > 20) return null; // hard stop at 4k users
  }
}

async function ensureAuthUser(email: string, password: string): Promise<string> {
  const existing = await findAuthUserId(email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`auth.admin.createUser failed: ${error?.message ?? 'no user returned'}`);
  }
  return data.user.id;
}

async function upsertAdminProfile(userId: string, email: string, companyId: string): Promise<void> {
  // Service-role bypasses RLS; the upsert covers both the trigger-created
  // pending row and the no-row case.
  const { error } = await admin.from('profiles').upsert(
    {
      id: userId,
      email,
      name: email.split('@')[0],
      role: 'super_admin',
      company_id: companyId,
      access_scope: 'global',
      status: 'active',
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(`profiles upsert failed: ${error.message}`);
}

async function main() {
  const companyId = await ensureCompany(COMPANY_NAME);
  const userId = await ensureAuthUser(ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await upsertAdminProfile(userId, ADMIN_EMAIL!, companyId);
  console.info(
    JSON.stringify(
      {
        ok: true,
        email: ADMIN_EMAIL,
        userId,
        companyId,
        role: 'super_admin',
        status: 'active',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error('[bootstrap-admin] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
