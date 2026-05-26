import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  addLeadFollowup,
  getLeadDetail,
  getLeadsFeed,
} from './leadIntakeService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getLeadsFeed ──────────────────────────────────────────────────────────────

describe('getLeadsFeed', () => {
  it('calls get_leads_feed with null filters by default', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [
        {
          source_kind: 'lead', source_raw_id: 'raw-1',
          dms_external_id: 'L-001', dms_customer_id: 'CUST-1',
          branch_code: 'KCH', salesperson_code: 'SP1', status: 'new',
          source_created_at: '2026-05-20T08:00:00Z', fetched_at: '2026-05-25T08:00:00Z',
          followup_count: 2, last_followup_at: '2026-05-22T10:00:00Z',
          last_followup_outcome: 'contacted', next_action_date: '2026-05-26',
        },
      ],
      error: null,
    } as never);

    const result = await getLeadsFeed('co-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_leads_feed', {
      p_company_id: 'co-1', p_kind: null, p_status: null, p_branch_code: null, p_limit: 200,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      sourceKind: 'lead', sourceRawId: 'raw-1', dmsExternalId: 'L-001',
      followupCount: 2, lastFollowupOutcome: 'contacted', nextActionDate: '2026-05-26',
    });
  });

  it('passes through kind and status filters', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);

    await getLeadsFeed('co-1', { kind: 'prospect', status: 'qualified', branchCode: 'KCH', limit: 50 });

    expect(supabase.rpc).toHaveBeenCalledWith('get_leads_feed', {
      p_company_id: 'co-1', p_kind: 'prospect', p_status: 'qualified', p_branch_code: 'KCH', p_limit: 50,
    });
  });

  it('returns empty array on RPC error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null, error: { message: 'Unauthorized' },
    } as never);

    const result = await getLeadsFeed('co-bad');

    expect(result.data).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });
});

// ── getLeadDetail ─────────────────────────────────────────────────────────────

describe('getLeadDetail', () => {
  it('maps detail row including followups array', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [{
        source_kind: 'lead', source_raw_id: 'raw-1',
        dms_external_id: 'L-001', dms_customer_id: 'CUST-1',
        branch_code: 'KCH', salesperson_code: 'SP1', status: 'new',
        source_created_at: '2026-05-20T08:00:00Z', fetched_at: '2026-05-25T08:00:00Z',
        raw_payload: { name: 'ACME', phone: '0123' },
        followups: [
          { id: 'f1', company_id: 'co-1', source_kind: 'lead', source_raw_id: 'raw-1',
            notes: 'Called', outcome: 'contacted', next_action_date: '2026-05-26',
            author_id: 'user-1', created_at: '2026-05-22T10:00:00Z', updated_at: '2026-05-22T10:00:00Z' },
        ],
      }],
      error: null,
    } as never);

    const result = await getLeadDetail('co-1', 'lead', 'raw-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_lead_detail', {
      p_company_id: 'co-1', p_source_kind: 'lead', p_raw_id: 'raw-1',
    });
    expect(result.data!.followups).toHaveLength(1);
    expect(result.data!.followups[0]).toMatchObject({
      id: 'f1', notes: 'Called', outcome: 'contacted',
    });
    expect(result.data!.rawPayload).toMatchObject({ name: 'ACME', phone: '0123' });
  });

  it('returns null data when lead not found', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);

    const result = await getLeadDetail('co-1', 'lead', 'nope');

    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });
});

// ── addLeadFollowup ───────────────────────────────────────────────────────────

describe('addLeadFollowup', () => {
  it('calls add_lead_followup with required and optional fields', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'new-id', error: null } as never);

    const result = await addLeadFollowup('co-1', 'lead', 'raw-1', 'Test call', {
      outcome: 'qualified',
      nextActionDate: '2026-05-30',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('add_lead_followup', {
      p_company_id:       'co-1',
      p_source_kind:      'lead',
      p_source_raw_id:    'raw-1',
      p_notes:            'Test call',
      p_outcome:          'qualified',
      p_next_action_date: '2026-05-30',
    });
    expect(result.data).toBe('new-id');
  });

  it('omits outcome and next_action_date when not provided', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'id-2', error: null } as never);

    await addLeadFollowup('co-1', 'prospect', 'raw-2', 'Quick note');

    expect(supabase.rpc).toHaveBeenCalledWith('add_lead_followup', {
      p_company_id:       'co-1',
      p_source_kind:      'prospect',
      p_source_raw_id:    'raw-2',
      p_notes:            'Quick note',
      p_outcome:          null,
      p_next_action_date: null,
    });
  });

  it('returns Error on empty-note rejection from RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null, error: { message: 'Notes cannot be empty' },
    } as never);

    const result = await addLeadFollowup('co-1', 'lead', 'raw-1', '');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });
});
