export interface AuthConfig {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

interface AuthUser { id?: string }
interface Profile { id: string; role: string; status: string }

export async function authorizeRecoveryAdmin(token: string, config: AuthConfig): Promise<string | null> {
  if (!token || !config.supabaseUrl || !config.anonKey || !config.serviceRoleKey) return null;
  const base = config.supabaseUrl.replace(/\/$/, '');
  try {
    // GoTrue verifies the caller's token. The service-role key stays server-side
    // and is used only to read the authoritative, current Profile role/status.
    const auth = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: config.anonKey, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!auth.ok) return null;
    const user = await auth.json() as AuthUser;
    if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) return null;
    const profiles = await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,status&limit=1`, {
      headers: { apikey: config.serviceRoleKey, authorization: `Bearer ${config.serviceRoleKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!profiles.ok) return null;
    const rows = await profiles.json() as Profile[];
    return rows.length === 1 && rows[0].id === user.id && rows[0].role === 'super_admin' && rows[0].status === 'active'
      ? user.id : null;
  } catch { return null; }
}
