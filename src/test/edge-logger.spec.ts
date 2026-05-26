/**
 * Vitest cover of the edge-function structured logger. The module is pure
 * (no Deno.* at import time) so we can import it directly from supabase/
 * and exercise it like any other library function.
 */
import { describe, expect, it, vi } from 'vitest';
import { createLogger, newRequestId, withRequestLogging } from '../../supabase/functions/_shared/logger';

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('https://edge.example/fn', { headers });
}

describe('newRequestId', () => {
  it('honours an inbound UUID x-request-id', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(newRequestId(makeReq({ 'x-request-id': id }))).toBe(id);
  });

  it('honours a safe ASCII slug for cross-system tracing', () => {
    expect(newRequestId(makeReq({ 'x-request-id': 'svc-A_42.run-9' }))).toBe('svc-A_42.run-9');
  });

  it('falls back to crypto.randomUUID when header is missing', () => {
    const id = newRequestId(makeReq());
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('rejects a header value that contains forbidden characters (log injection)', () => {
    // Headers API rejects literal newlines, so test with values the API
    // accepts but our allow-list refuses (spaces, semicolons, etc.).
    const malicious = 'evil; drop table users';
    const out = newRequestId(makeReq({ 'x-request-id': malicious }));
    expect(out).not.toBe(malicious);
    expect(out).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('falls back when header is the empty string', () => {
    const out = newRequestId(makeReq({ 'x-request-id': '' }));
    expect(out).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('createLogger', () => {
  it('emits one-line JSON with the canonical fields and caller context', () => {
    const sink = vi.fn();
    const log = createLogger('invite-user', 'req-1', {
      now: () => '2026-05-26T08:00:00.000Z',
      sink,
    });

    log.info('request.start', { method: 'POST', path: '/invite' });

    expect(sink).toHaveBeenCalledTimes(1);
    const line = sink.mock.calls[0][0];
    expect(line).toMatch(/^\{.*\}$/);
    expect(JSON.parse(line)).toEqual({
      ts:         '2026-05-26T08:00:00.000Z',
      level:      'info',
      fn:         'invite-user',
      request_id: 'req-1',
      msg:        'request.start',
      method:     'POST',
      path:       '/invite',
    });
  });

  it('emits each level (info / warn / error) at its declared level', () => {
    const sink = vi.fn();
    const log = createLogger('fn', 'r', { now: () => 'T', sink });

    log.info('a');
    log.warn('b');
    log.error('c', { reason: 'boom' });

    const levels = sink.mock.calls.map((c) => JSON.parse(c[0] as string).level);
    expect(levels).toEqual(['info', 'warn', 'error']);
    expect(JSON.parse(sink.mock.calls[2][0] as string).reason).toBe('boom');
  });

  it('refuses to let caller context overwrite canonical fields', () => {
    const sink = vi.fn();
    const log = createLogger('fn', 'r', { now: () => 'T', sink });

    log.info('shadowed', {
      ts:         'evil',
      level:      'critical',
      fn:         'attacker',
      request_id: 'forged',
      msg:        'shadow',
      // a non-canonical key should still come through
      extra:      'safe',
    } as Record<string, unknown>);

    const record = JSON.parse(sink.mock.calls[0][0] as string);
    expect(record.ts).toBe('T');
    expect(record.level).toBe('info');
    expect(record.fn).toBe('fn');
    expect(record.request_id).toBe('r');
    expect(record.msg).toBe('shadowed');
    expect(record.extra).toBe('safe');
  });

  it('exposes requestId so callers can stamp it on the response', () => {
    const log = createLogger('fn', 'req-xyz', { now: () => 'T', sink: () => undefined });
    expect(log.requestId).toBe('req-xyz');
  });
});

describe('withRequestLogging', () => {
  it('emits request.start and request.end and stamps x-request-id on the response', async () => {
    const sink = vi.fn();
    const wrapped = withRequestLogging(
      'invite-user',
      () => new Response('ok', { status: 201 }),
      { now: () => 'T', sink },
    );

    const res = await wrapped(makeReq({ 'x-request-id': 'caller-1' }));

    expect(res.status).toBe(201);
    expect(res.headers.get('x-request-id')).toBe('caller-1');

    const events = sink.mock.calls.map((c) => JSON.parse(c[0] as string).msg);
    expect(events).toEqual(['request.start', 'request.end']);
    const endRecord = JSON.parse(sink.mock.calls[1][0] as string);
    expect(endRecord.status).toBe(201);
    expect(endRecord.request_id).toBe('caller-1');
    expect(typeof endRecord.dur_ms).toBe('number');
  });

  it('turns thrown errors into a logged 500 carrying the request id', async () => {
    const sink = vi.fn();
    const wrapped = withRequestLogging(
      'invite-user',
      () => { throw new Error('boom'); },
      { now: () => 'T', sink },
    );

    const res = await wrapped(makeReq());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal error');
    expect(typeof body.request_id).toBe('string');
    expect(res.headers.get('x-request-id')).toBe(body.request_id);

    const events = sink.mock.calls.map((c) => JSON.parse(c[0] as string).msg);
    expect(events).toEqual(['request.start', 'request.error', 'request.end']);
    const errRecord = JSON.parse(sink.mock.calls[1][0] as string);
    expect(errRecord.error).toBe('boom');
    expect(errRecord.level).toBe('error');
  });

  it('does not overwrite x-request-id if the handler already set one', async () => {
    const sink = vi.fn();
    const wrapped = withRequestLogging(
      'fn',
      () => new Response('ok', {
        status: 200,
        headers: { 'x-request-id': 'handler-id' },
      }),
      { now: () => 'T', sink },
    );

    const res = await wrapped(makeReq({ 'x-request-id': 'caller-id' }));

    expect(res.headers.get('x-request-id')).toBe('handler-id');
  });
});
