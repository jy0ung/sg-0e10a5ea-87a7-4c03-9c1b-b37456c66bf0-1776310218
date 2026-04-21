import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Shared Supabase browser client.
 *
 * Keys are read from Vite-style env vars. The fallbacks to NEXT_PUBLIC_* exist
 * so the same package can be consumed by the Next.js surfaces without change.
 * Missing config aborts early — we never silently ship an unconfigured client.
 */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing Supabase environment variables. Expected VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.',
  );
}

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      // PKCE is the recommended flow for SPAs — resistant to auth code
      // interception and required for enterprise SSO integrations.
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      // Namespaced storage key so multiple FLC apps on the same origin
      // (admin, mobile, customer portal) don't clobber each other's session.
      storageKey: 'flc.auth.session',
    },
    global: {
      headers: {
        'x-client-info': 'flc-bi-web',
      },
    },
  },
);
