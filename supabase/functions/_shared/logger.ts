/**
 * Structured logger for edge functions (Phase 5c).
 *
 * Emits one-line JSON to stdout (`console.log`) so the Supabase log explorer
 * and any downstream collector can parse fields without a custom regex.
 * Every record carries `ts`, `level`, `fn`, `request_id`, `msg`, plus any
 * caller-supplied context fields — never `Authorization`, `apikey`, or
 * other auth-bearing headers (sanitise at the call site).
 *
 * `newRequestId(req)` honours an inbound `x-request-id` header (so a caller
 * that already has a correlation id can stitch logs across systems) and
 * falls back to `crypto.randomUUID()` when missing or empty. Edge functions
 * should also reflect the value back to clients via the response header so
 * the round-trip is correlated end-to-end.
 *
 * This module is intentionally Deno-free at the module level: no `Deno.*`
 * references at import time, no top-level side effects. That makes it
 * unit-testable from vitest without a Deno polyfill.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface EdgeLogger {
  info:  (msg: string, ctx?: Record<string, unknown>) => void;
  warn:  (msg: string, ctx?: Record<string, unknown>) => void;
  error: (msg: string, ctx?: Record<string, unknown>) => void;
  /** Returns the request id this logger is bound to (handy for response headers). */
  requestId: string;
}

interface LoggerOptions {
  /** Override the clock for tests. Defaults to `() => new Date().toISOString()`. */
  now?: () => string;
  /** Override the sink for tests. Defaults to `console.log` (one JSON line per call). */
  sink?: (line: string) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_HEADER_RE = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Resolve a stable request id for the inbound Request. Prefers a caller-
 * supplied `x-request-id` (must look like a UUID or a safe ASCII slug to
 * avoid log-injection); falls back to a freshly-minted UUID.
 */
export function newRequestId(req: Request): string {
  const inbound = req.headers.get('x-request-id')?.trim();
  if (inbound && (UUID_RE.test(inbound) || SAFE_HEADER_RE.test(inbound))) {
    return inbound;
  }
  return crypto.randomUUID();
}

/**
 * Higher-order wrapper for `Deno.serve` handlers. Generates a request id,
 * builds a logger, logs `request.start` + `request.end` (with status and
 * elapsed ms), stamps `x-request-id` on the response, and turns thrown
 * errors into a 500 with a logged `request.error` event.
 *
 * Usage:
 *
 *   Deno.serve(withRequestLogging('invite-user', async ({ req, log }) => {
 *     log.info('invite.start', { ... });
 *     return new Response(...);
 *   }));
 */
export interface RequestLoggingContext {
  req:        Request;
  log:        EdgeLogger;
  requestId:  string;
}

export function withRequestLogging(
  fn: string,
  handler: (ctx: RequestLoggingContext) => Promise<Response> | Response,
  opts: LoggerOptions = {},
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const requestId = newRequestId(req);
    const log = createLogger(fn, requestId, opts);
    const start = Date.now();
    const url = (() => {
      try { return new URL(req.url).pathname; } catch { return req.url; }
    })();

    log.info('request.start', { method: req.method, path: url });

    let response: Response;
    try {
      response = await handler({ req, log, requestId });
    } catch (err) {
      log.error('request.error', {
        method: req.method,
        path:   url,
        error:  (err as Error)?.message ?? String(err),
      });
      response = new Response(
        JSON.stringify({ error: 'Internal error', request_id: requestId }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Reflect the request id back to the client so the round-trip is
    // correlated end-to-end. Build a fresh headers object so we don't
    // mutate any shared header instance returned by the handler.
    const headers = new Headers(response.headers);
    if (!headers.has('x-request-id')) {
      headers.set('x-request-id', requestId);
    }

    log.info('request.end', {
      method: req.method,
      path:   url,
      status: response.status,
      dur_ms: Date.now() - start,
    });

    return new Response(response.body, {
      status:     response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

export function createLogger(
  fn: string,
  requestId: string,
  opts: LoggerOptions = {},
): EdgeLogger {
  const now  = opts.now  ?? (() => new Date().toISOString());
  const sink = opts.sink ?? ((line: string) => { console.info(line); });

  function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
    const record: Record<string, unknown> = {
      ts:         now(),
      level,
      fn,
      request_id: requestId,
      msg,
    };
    if (ctx) {
      for (const [k, v] of Object.entries(ctx)) {
        // Don't shadow the canonical fields above.
        if (k === 'ts' || k === 'level' || k === 'fn' || k === 'request_id' || k === 'msg') continue;
        record[k] = v;
      }
    }
    sink(JSON.stringify(record));
  }

  return {
    info:  (msg, ctx) => emit('info',  msg, ctx),
    warn:  (msg, ctx) => emit('warn',  msg, ctx),
    error: (msg, ctx) => emit('error', msg, ctx),
    requestId,
  };
}
