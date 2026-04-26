import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { deleteCustomer, updateCustomer } from './customerService';
import { logUserAction } from './auditService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('./auditService', () => ({
  logUserAction: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    error: vi.fn(),
  },
}));

vi.mock('./performanceService', () => ({
  performanceService: {
    startQueryTimer: vi.fn(() => 'timer'),
    endQueryTimer: vi.fn(),
  },
}));

function createBuilder(result: Record<string, unknown> = { id: 'cust-1', company_id: 'company-1', name: 'A', created_at: 'now', updated_at: 'now' }) {
  const builder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
  return builder;
}

describe('customerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes customer updates by company before id', async () => {
    const builder = createBuilder();
    vi.mocked(supabase.from).mockReturnValue(builder as any);

    const result = await updateCustomer('company-1', 'cust-1', { name: 'Updated' }, 'actor-1');

    expect(result.error).toBeNull();
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated' }));
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'company_id', 'company-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'id', 'cust-1');
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'update', 'customer', 'cust-1', { component: 'CustomerService' });
  });

  it('scopes customer soft deletes by company before id', async () => {
    const builder = createBuilder();
    vi.mocked(supabase.from).mockReturnValue(builder as any);

    const result = await deleteCustomer('company-1', 'cust-1', 'actor-1');

    expect(result.error).toBeNull();
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ is_deleted: true }));
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'company_id', 'company-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'id', 'cust-1');
    expect(logUserAction).toHaveBeenCalledWith('actor-1', 'delete', 'customer', 'cust-1', { component: 'CustomerService' });
  });
});
