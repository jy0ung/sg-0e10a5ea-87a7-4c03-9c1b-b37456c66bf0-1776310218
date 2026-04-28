#!/usr/bin/env -S npx tsx
/**
 * Seed two company tenants + one user each for the RLS matrix harness.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service role, never
 * the anon key). Idempotent — safe to re-run.
 *
 * Usage:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
 *   npx tsx scripts/seed-rls-users.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
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

async function main() {
  const companyAId = await upsertCompany('rls-a', 'RLS Company A', 'RLS-A');
  const companyBId = await upsertCompany('rls-b', 'RLS Company B', 'RLS-B');
  const userAId = await upsertUser('a@rls.test', 'Test1234!', companyAId);
  const userBId = await upsertUser('b@rls.test', 'Test1234!', companyBId);
  console.info(
    JSON.stringify(
      {
        companyAId,
        companyBId,
        userAId,
        userBId,
        credentials: {
          RLS_USER_A_EMAIL: 'a@rls.test',
          RLS_USER_A_PASSWORD: 'Test1234!',
          RLS_USER_B_EMAIL: 'b@rls.test',
          RLS_USER_B_PASSWORD: 'Test1234!',
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
