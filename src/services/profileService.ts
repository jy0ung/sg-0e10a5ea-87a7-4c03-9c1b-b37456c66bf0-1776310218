/**
 * Profile service — typed wrappers over `profiles` reads/writes used by
 * the Users & Roles admin page and the per-user Settings page.
 *
 * Centralizing these mutations here lets every call go through the same
 * DAL boundary (Phase 2 #14) and gives us a single place to attach audit
 * logging, zod validation, and RPC hardening later.
 */
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, AccessScope } from '@/types';

export interface ProfileRow {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  company_id: string;
  branch_id: string | null;
  access_scope: AccessScope;
  created_at: string;
}

export interface ListProfilesResult {
  data: ProfileRow[];
  error: string | null;
}

/** List all profiles (optionally scoped to a company for non-super-admins). */
export async function listProfiles(companyId?: string): Promise<ListProfilesResult> {
  let q = supabase
    .from('profiles')
    .select('id, email, name, role, company_id, branch_id, access_scope, created_at')
    .order('created_at', { ascending: true });
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as unknown as ProfileRow[], error: null };
}

export interface UpdateProfileInput {
  id: string;
  name?: string;
  role?: AppRole;
  access_scope?: AccessScope;
  branch_id?: string | null;
}

/** Admin-side user update (Users & Roles). */
export async function updateProfile(
  input: UpdateProfileInput,
): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined)         patch.name         = input.name;
  if (input.role !== undefined)         patch.role         = input.role;
  if (input.access_scope !== undefined) patch.access_scope = input.access_scope;
  if (input.branch_id !== undefined)    patch.branch_id    = input.branch_id;
  const { error } = await supabase.from('profiles').update(patch).eq('id', input.id);
  return { error: error?.message ?? null };
}

/** Send an invitation via the `invite-user` edge function. */
export async function inviteUser(payload: {
  email: string;
  name: string;
  role: AppRole;
  companyId: string;
}): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: {
      email: payload.email,
      name: payload.name,
      role: payload.role,
      company_id: payload.companyId,
    },
  });
  if (error) return { error: error.message };
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return { error: String(data.error) };
  }
  return { error: null };
}

/** Re-authenticate then update password (Settings → Change Password). */
export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ error: string | null; code?: 'wrong_current' | 'update_failed' }> {
  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (authError) return { error: 'Current password is incorrect', code: 'wrong_current' };
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) return { error: updateError.message, code: 'update_failed' };
  return { error: null };
}
