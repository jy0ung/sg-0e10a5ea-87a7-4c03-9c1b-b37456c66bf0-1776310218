/**
 * Phase 2 close-out (AUDIT F-2) — verifies the approval inbox subscribes
 * to Supabase changes on the three approval sources and that the channel
 * onChange invalidates the React Query cache for the caller's company.
 *
 * The hook is exercised through @testing-library/react's renderHook so we
 * pick up the real react-query wiring; @flc/supabase's useSupabaseChannel
 * is stubbed so we can assert the subscription shape without a live channel.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const supabaseMock = vi.hoisted(() => ({
  useSupabaseChannel: vi.fn(),
}));
vi.mock('@flc/supabase', () => supabaseMock);

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', companyId: 'co-1' } }),
}));

vi.mock('@/hooks/useHrmsAccess', () => ({
  useHrmsAccess: () => ({
    canAccessRoute: () => true,
    canApproveRequests: true,
    roleCodes: ['hrms_admin'],
    roleIds: ['role-1'],
  }),
}));

vi.mock('@/services/hrmsService', () => ({
  listLeaveRequests: vi.fn().mockResolvedValue({ data: [], error: null }),
  listPayrollRuns:   vi.fn().mockResolvedValue({ data: [], error: null }),
  listAppraisals:    vi.fn().mockResolvedValue({ data: [], error: null }),
}));

import { approvalInboxQueryKey, useApprovalInboxItems } from './useApprovalInboxItems';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { client, Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useApprovalInboxItems realtime subscription (Phase 2 / AUDIT F-2)', () => {
  it('subscribes to leave_requests, payroll_runs, and appraisals scoped to the caller company', async () => {
    const { Wrapper } = makeWrapper();

    renderHook(() => useApprovalInboxItems(), { wrapper: Wrapper });

    await waitFor(() => expect(supabaseMock.useSupabaseChannel).toHaveBeenCalled());
    const call = supabaseMock.useSupabaseChannel.mock.calls.at(-1)![0];

    expect(call.enabled).toBe(true);
    expect(call.name).toBe('approval-inbox:co-1');
    expect(call.subscriptions).toEqual([
      { event: '*', table: 'leave_requests', filter: 'company_id=eq.co-1' },
      { event: '*', table: 'payroll_runs',   filter: 'company_id=eq.co-1' },
      { event: '*', table: 'appraisals',     filter: 'company_id=eq.co-1' },
    ]);
    expect(typeof call.onChange).toBe('function');
  });

  it('invalidates the approval-inbox query when the channel fires', async () => {
    const { client, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useApprovalInboxItems(), { wrapper: Wrapper });

    await waitFor(() => expect(supabaseMock.useSupabaseChannel).toHaveBeenCalled());
    const { onChange } = supabaseMock.useSupabaseChannel.mock.calls.at(-1)![0];

    onChange({
      schema: 'public',
      table: 'leave_requests',
      eventType: 'INSERT',
      new: { id: 'lr-1', company_id: 'co-1' },
      old: {},
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: approvalInboxQueryKey('co-1'),
    });
  });
});
