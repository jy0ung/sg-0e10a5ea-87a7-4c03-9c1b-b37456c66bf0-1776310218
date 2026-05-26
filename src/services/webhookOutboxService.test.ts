import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  emitWebhookEvent,
  listWebhookDeliveries,
  listWebhookEndpoints,
  requeueWebhookDelivery,
  upsertWebhookEndpoint,
} from './webhookOutboxService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeFromChain(returnValue: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  ['select', 'eq', 'order', 'limit'].forEach(m => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(returnValue).then(resolve);
  return chain;
}

describe('listWebhookEndpoints', () => {
  it('selects by company_id and maps rows', async () => {
    const chain = makeFromChain({
      data: [
        {
          id: 'ep-1', company_id: 'co-1', name: 'Slack relay',
          url: 'https://hooks.example/abc', secret: 'shh',
          event_types: ['vehicle.transferred'], active: true,
          last_success_at: '2026-05-27T00:00:00Z', last_failure_at: null,
          consecutive_failures: 0,
          created_at: '2026-05-26T00:00:00Z', updated_at: '2026-05-27T00:00:00Z',
        },
      ],
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await listWebhookEndpoints('co-1');

    expect(supabase.from).toHaveBeenCalledWith('webhook_endpoints');
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'co-1');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'ep-1', companyId: 'co-1', eventTypes: ['vehicle.transferred'], active: true,
    });
  });

  it('surfaces a sane error envelope on supabase failure', async () => {
    const chain = makeFromChain({ data: null, error: { message: 'permission denied' } });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await listWebhookEndpoints('co-1');

    expect(result.data).toEqual([]);
    expect(result.error?.message).toBe('permission denied');
  });
});

describe('upsertWebhookEndpoint', () => {
  it('forwards every field including null id (create) to the RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'new-id-1', error: null } as never);

    const result = await upsertWebhookEndpoint({
      id: null, companyId: 'co-1', name: 'New', url: 'https://x',
      secret: 'k', eventTypes: ['a'], active: true,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('upsert_webhook_endpoint', {
      p_id: null, p_company_id: 'co-1', p_name: 'New', p_url: 'https://x',
      p_secret: 'k', p_event_types: ['a'], p_active: true,
    });
    expect(result.id).toBe('new-id-1');
  });

  it('returns an error envelope when the RPC rejects', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Webhook URL must be HTTPS' } } as never);

    const result = await upsertWebhookEndpoint({
      id: null, companyId: 'co-1', name: 'Bad', url: 'http://x',
      secret: 'k', eventTypes: [], active: true,
    });

    expect(result.id).toBeNull();
    expect(result.error?.message).toBe('Webhook URL must be HTTPS');
  });
});

describe('listWebhookDeliveries', () => {
  it('selects with default limit 50 and maps rows', async () => {
    const chain = makeFromChain({
      data: [
        {
          id: 'd-1', endpoint_id: 'ep-1', company_id: 'co-1',
          event_type: 'vehicle.transferred', payload: { chassis: '123' },
          status: 'delivered', attempts: 1, last_error: null,
          last_response_status: 200,
          next_retry_at: '2026-05-27T00:00:00Z',
          delivered_at: '2026-05-27T00:00:05Z',
          created_at: '2026-05-27T00:00:00Z', updated_at: '2026-05-27T00:00:05Z',
        },
      ],
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    const result = await listWebhookDeliveries('co-1');

    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(result.data[0].status).toBe('delivered');
    expect(result.data[0].payload).toEqual({ chassis: '123' });
  });
});

describe('requeueWebhookDelivery', () => {
  it('calls requeue_webhook_delivery with the delivery id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: true, error: null } as never);

    const result = await requeueWebhookDelivery('d-1');

    expect(supabase.rpc).toHaveBeenCalledWith('requeue_webhook_delivery', { p_id: 'd-1' });
    expect(result.ok).toBe(true);
  });
});

describe('emitWebhookEvent', () => {
  it('forwards (company, event, payload) to emit_webhook_event and returns the fan-out count', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 3, error: null } as never);

    const result = await emitWebhookEvent('co-1', 'vehicle.transferred', { chassis: 'ABC123' });

    expect(supabase.rpc).toHaveBeenCalledWith('emit_webhook_event', {
      p_company_id: 'co-1',
      p_event_type: 'vehicle.transferred',
      p_payload:    { chassis: 'ABC123' },
    });
    expect(result.fanned).toBe(3);
  });

  it('returns fanned=0 with the error message when the RPC rejects', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Unauthorized' } } as never);

    const result = await emitWebhookEvent('co-1', 'evt', {});

    expect(result.fanned).toBe(0);
    expect(result.error?.message).toBe('Unauthorized');
  });
});
