/**
 * Shared CORS helpers for edge functions.
 *
 * Phase 0 hotfix: wildcard `Access-Control-Allow-Origin: *` is replaced with a
 * server-side allow-list derived from the `ALLOWED_ORIGINS` environment
 * variable (comma-separated). Requests from unknown origins still get an
 * echo-less response with no credentials permitted.
 */

const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function getAllowedOrigins(): string[] {
  const fromEnv = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : defaultAllowedOrigins;
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = getAllowedOrigins();
  const matched = allowed.includes(origin) ? origin : allowed[0] ?? '';
  return {
    'Access-Control-Allow-Origin': matched,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

// Backwards-compat export for callers that don't yet pass `req`.
// Emits no origin (browsers will reject); use buildCorsHeaders(req) instead.
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Vary': 'Origin',
};
