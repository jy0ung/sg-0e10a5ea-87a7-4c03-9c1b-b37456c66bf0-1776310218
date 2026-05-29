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
 *   • PostgREST code PGRST202 / PGRST204
 *   • PostgreSQL codes 42P01 / 42883 / 42703
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
  /PGRST20[24]|Could not find the (function|relation|table|column)|schema cache|relation .* does not exist|function .* does not exist|column .* does not exist/i;

const PLATFORM_MISMATCH_CODES = new Set([
  'PGRST202', // function not found in schema cache
  'PGRST204', // column not found in schema cache
  '42P01',    // undefined_table
  '42883',    // undefined_function
  '42703',    // undefined_column
]);

function errorParts(error: unknown): string[] {
  if (!error) return [];
  if (typeof error === 'string') return [error];
  if (error instanceof Error) return [error.message];
  if (typeof error !== 'object') return [String(error)];

  const record = error as Record<string, unknown>;
  return ['code', 'message', 'details', 'hint']
    .map((key) => record[key])
    .filter((value): value is string | number => (
      typeof value === 'string' || typeof value === 'number'
    ))
    .map(String);
}

export function isPlatformMismatchError(error: unknown): boolean {
  const parts = errorParts(error);
  return parts.some((part) => (
    PLATFORM_MISMATCH_CODES.has(part.toUpperCase()) || PLATFORM_MISMATCH_RE.test(part)
  ));
}
