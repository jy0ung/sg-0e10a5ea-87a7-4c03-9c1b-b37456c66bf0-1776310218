import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';

const emitWebhookEventMock = vi.hoisted(() => vi.fn().mockResolvedValue({ fanned: 0, error: null }));
vi.mock('./webhookOutboxService', () => ({ emitWebhookEvent: emitWebhookEventMock }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('./auditService', () => ({
  logUserAction: vi.fn().mockResolvedValue(undefined),
}));

import { createVehicleTransfer, updateVehicleTransferStatus } from './inventoryService';

function makeInsertChain(returnValue: { error: unknown }) {
  return {
    insert: vi.fn().mockResolvedValue(returnValue),
  };
}

function makeUpdateChain(returnValue: { error: unknown }) {
  const chain: Record<string, unknown> = {};
  ['update', 'eq'].forEach(m => { chain[m] = vi.fn().mockReturnValue(chain); });
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(returnValue).then(resolve);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createVehicleTransfer (Phase 6a producer adoption)', () => {
  it('emits vehicle.transfer.requested after a successful insert', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeInsertChain({ error: null }) as never);

    const result = await createVehicleTransfer({
      companyId: 'co-1', runningNo: 'TX-001',
      fromBranch: 'BR-A', toBranch: 'BR-B',
      chassisNo: 'abc123', model: 'Model X',
    });

    expect(result.error).toBeNull();
    expect(emitWebhookEventMock).toHaveBeenCalledTimes(1);
    expect(emitWebhookEventMock).toHaveBeenCalledWith('co-1', 'vehicle.transfer.requested', {
      running_no:  'TX-001',
      from_branch: 'BR-A',
      to_branch:   'BR-B',
      chassis_no:  'ABC123',
      model:       'Model X',
      colour:      null,
    });
  });

  it('skips the emit when the insert fails (mutation never happened)', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeInsertChain({ error: { message: 'duplicate key' } }) as never,
    );

    const result = await createVehicleTransfer({
      companyId: 'co-1', runningNo: 'TX-002',
      fromBranch: 'BR-A', toBranch: 'BR-B',
      chassisNo: 'XYZ789', model: 'Model Y',
    });

    expect(result.error?.message).toBe('duplicate key');
    expect(emitWebhookEventMock).not.toHaveBeenCalled();
  });
});

describe('updateVehicleTransferStatus (Phase 6a producer adoption)', () => {
  it('emits vehicle.transfer.arrived with the resolved arrival date', async () => {
    // First update: vehicle_transfers row. Second update: vehicles row.
    vi.mocked(supabase.from)
      .mockReturnValueOnce(makeUpdateChain({ error: null }) as never)
      .mockReturnValueOnce(makeUpdateChain({ error: null }) as never);

    const result = await updateVehicleTransferStatus('t-1', 'arrived', {
      companyId: 'co-1',
      chassisNo: 'ABC123',
      toBranch:  'BR-B',
    });

    expect(result.error).toBeNull();
    expect(emitWebhookEventMock).toHaveBeenCalledTimes(1);
    const [companyId, eventType, payload] = emitWebhookEventMock.mock.calls[0];
    expect(companyId).toBe('co-1');
    expect(eventType).toBe('vehicle.transfer.arrived');
    expect(payload).toMatchObject({
      transfer_id: 't-1',
      chassis_no:  'ABC123',
      to_branch:   'BR-B',
      status:      'arrived',
    });
    expect(typeof payload.arrived_at).toBe('string');
  });

  it('emits vehicle.transfer.cancelled for the cancelled transition', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(makeUpdateChain({ error: null }) as never);

    await updateVehicleTransferStatus('t-2', 'cancelled', { companyId: 'co-1' });

    expect(emitWebhookEventMock).toHaveBeenCalledWith('co-1', 'vehicle.transfer.cancelled', expect.any(Object));
  });

  it('does not emit when the underlying update fails', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      makeUpdateChain({ error: { message: 'row not found' } }) as never,
    );

    const result = await updateVehicleTransferStatus('t-3', 'in_transit', { companyId: 'co-1' });

    expect(result.error?.message).toBe('row not found');
    expect(emitWebhookEventMock).not.toHaveBeenCalled();
  });
});
