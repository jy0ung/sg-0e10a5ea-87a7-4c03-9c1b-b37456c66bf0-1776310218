import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { createSharedAuthStorage } from './authStorage';

/**
 * Shared Supabase browser client.
 *
 * Keys are read from Vite-style env vars. The fallbacks to NEXT_PUBLIC_* exist
 * so the same package can be consumed by the Next.js surfaces without change.
 * Missing config aborts early — we never silently ship an unconfigured client.
 */
const isHrmsWebApp = import.meta.env.VITE_HRMS_WEB_APP === 'true';

const _rawSupabaseUrl =
  isHrmsWebApp
    ? import.meta.env.VITE_HRMS_SUPABASE_URL
    : import.meta.env.VITE_SUPABASE_URL ||
      import.meta.env.NEXT_PUBLIC_SUPABASE_URL;

// Support a relative proxy path (e.g. "/__supabase") used in Codespaces / local dev
// so the URL always resolves against whichever origin the browser loaded the app from
// — localhost, the Codespaces forwarded domain, or the production domain.
const SUPABASE_URL =
  _rawSupabaseUrl?.startsWith('/')
    ? `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}${_rawSupabaseUrl}`
    : _rawSupabaseUrl;
const SUPABASE_PUBLISHABLE_KEY =
  isHrmsWebApp
    ? import.meta.env.VITE_HRMS_SUPABASE_ANON_KEY
    : import.meta.env.VITE_SUPABASE_ANON_KEY ||
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  const expected = isHrmsWebApp
    ? 'VITE_HRMS_SUPABASE_URL and VITE_HRMS_SUPABASE_ANON_KEY'
    : 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY';
  throw new Error(
    `Missing Supabase environment variables. Expected ${expected}. ` +
      'Copy .env.example to .env.local and fill them in.',
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
      // Auth callback routes exchange invite/recovery tokens explicitly.
      // Global URL detection can race those pages and consume PKCE codes before
      // the route-specific UX knows which flow is being completed.
      detectSessionInUrl: false,
      // Namespaced storage key so multiple FLC apps on the same origin
      // (admin, mobile, customer portal) don't clobber each other's session.
      storageKey: isHrmsWebApp ? 'flc.hrms.auth.session' : 'flc.ubs.auth.session',
      storage: createSharedAuthStorage(),
    },
    global: {
      headers: {
        'x-client-info': isHrmsWebApp ? 'flc-hrms-web' : 'flc-ubs-web',
      },
    },
  },
);
