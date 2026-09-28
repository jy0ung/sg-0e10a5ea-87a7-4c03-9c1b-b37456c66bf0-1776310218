import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  emitWebhookEvent,
  listWebhookDeliveries,
  listWebhookEndpoints,
  requeueWebhookDelivery,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  rotateWebhookEndpointSecret,
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
  it('uses a masked RPC projection and never exposes a stored secret', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
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
    } as never);

    const result = await listWebhookEndpoints('co-1');

    expect(supabase.rpc).toHaveBeenCalledWith('list_webhook_endpoints', { p_company_id: 'co-1' });
    expect(supabase.from).not.toHaveBeenCalledWith('webhook_endpoints');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'ep-1', companyId: 'co-1', eventTypes: ['vehicle.transferred'], active: true,
    });
    expect(JSON.stringify(result.data)).not.toContain('shh');
  });

  it('surfaces a sane error envelope on supabase failure', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } } as never);

    const result = await listWebhookEndpoints('co-1');

    expect(result.data).toEqual([]);
    expect(result.error?.message).toBe('permission denied');
  });
});

describe('webhook endpoint mutations', () => {
  it('creates a server-generated secret without sending one from the browser', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { id: 'new-id-1', secret: 'one-time-key' }, error: null } as never);

    const result = await createWebhookEndpoint({
      companyId: 'co-1', name: 'New', url: 'https://x',
      eventTypes: ['a'], active: true,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('create_webhook_endpoint', {
      p_company_id: 'co-1', p_name: 'New', p_url: 'https://x',
      p_event_types: ['a'], p_active: true,
    });
    expect(result.id).toBe('new-id-1');
    expect(result.secret).toBe('one-time-key');
  });

  it('returns an error envelope when the RPC rejects', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Webhook URL must be HTTPS' } } as never);

    const result = await createWebhookEndpoint({
      companyId: 'co-1', name: 'Bad', url: 'http://x',
      eventTypes: [], active: true,
    });

    expect(result.id).toBeNull();
    expect(result.error?.message).toBe('Webhook URL must be HTTPS');
  });

  it('edits metadata without round-tripping or replacing a signing key', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'ep-1', error: null } as never);
    const result = await updateWebhookEndpoint({
      id: 'ep-1', companyId: 'co-1', name: 'Renamed', url: 'https://x',
      eventTypes: ['a'], active: false,
    });
    expect(result.error).toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith('update_webhook_endpoint', {
      p_id: 'ep-1', p_company_id: 'co-1', p_name: 'Renamed', p_url: 'https://x',
      p_event_types: ['a'], p_active: false,
    });
  });

  it('rotates through a separate operation', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'replacement-key', error: null } as never);
    const result = await rotateWebhookEndpointSecret('ep-1');
    expect(result.secret).toBe('replacement-key');
    expect(supabase.rpc).toHaveBeenCalledWith('rotate_webhook_endpoint_secret', { p_id: 'ep-1' });
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
