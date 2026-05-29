/**
 * Matches PostgREST / Supabase errors that indicate the deployed app is
 * calling database objects (RPCs, tables, columns) that don't exist or
 * aren't yet registered in the schema cache.
 *
 * When this matches, the user-facing surface is reframed from "Retry the
 * request" (which won't help) to "Platform configuration mismatch", and a
 * global banner (`PlatformHealthBanner` driven by `usePlatformHealth`)
 * picks up the same signal app-wide.
 *
 * Caught error shapes:
 *   • "Could not find the function public.x(...) in the schema cache"
 *   • "Could not find the table ..."
 *   • "relation \"public.x\" does not exist"
 *   • Anything else mentioning "schema cache"
 *
 * NOT caught (intentional):
 *   • RLS denials ("permission denied for relation x") — those mean the
 *     RPC is registered but the caller is not allowed, which is a real
 *     authorization issue, not a deploy-state issue.
 *   • Network errors, timeouts — those retry naturally.
 */
const PLATFORM_MISMATCH_RE =
  /Could not find the (function|relation|table)|schema cache|relation .* does not exist/i;

export function isPlatformMismatchError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return PLATFORM_MISMATCH_RE.test(msg);
}
