import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listCanonicalMock,
  createCanonicalMock,
  updateCanonicalMock,
  logErrorMock,
  auditMock,
} = vi.hoisted(() => ({
  listCanonicalMock: vi.fn(),
  createCanonicalMock: vi.fn(),
  updateCanonicalMock: vi.fn(),
  logErrorMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('@flc/hrms-services', () => ({
  listSalesAdvisors: listCanonicalMock,
  createSalesAdvisor: createCanonicalMock,
  updateSalesAdvisorStatus: updateCanonicalMock,
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: logErrorMock },
}));

vi.mock('./auditService', () => ({
  logUserAction: auditMock,
}));

import {
  createSalesAdvisor,
  listSalesAdvisors,
  updateSalesAdvisorStatus,
} from './salesAdvisorService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Sales Advisor UBS adapter', () => {
  it('reads the canonical Employee-backed registry', async () => {
    listCanonicalMock.mockResolvedValue([{ id: 'employee-1', code: 'SA001' }]);

    await expect(listSalesAdvisors('c1')).resolves.toEqual([{ id: 'employee-1', code: 'SA001' }]);
    expect(listCanonicalMock).toHaveBeenCalledWith('c1');
  });

  it('creates through the canonical atomic command', async () => {
    createCanonicalMock.mockResolvedValue('employee-1');

    const result = await createSalesAdvisor({
      companyId: 'c1',
      code: 'SA001',
      name: 'Aisyah',
      branchId: 'branch-1',
    });

    expect(result.error).toBeNull();
    expect(createCanonicalMock).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'c1',
      branchId: 'branch-1',
      code: 'SA001',
    }));
  });

  it('surfaces canonical create errors without writing a legacy store', async () => {
    createCanonicalMock.mockRejectedValue(new Error('duplicate staff code'));

    const result = await createSalesAdvisor({
      companyId: 'c1',
      code: 'SA001',
      name: 'Aisyah',
      branchId: 'branch-1',
    });

    expect(result.error?.message).toBe('duplicate staff code');
    expect(logErrorMock).toHaveBeenCalled();
  });

  it('updates Employee status and retains audit behavior', async () => {
    updateCanonicalMock.mockResolvedValue(undefined);

    const result = await updateSalesAdvisorStatus('c1', 'employee-1', 'inactive', 'actor-1');

    expect(result.error).toBeNull();
    expect(updateCanonicalMock).toHaveBeenCalledWith('c1', 'employee-1', 'inactive');
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1',
      'update',
      'sales_advisor',
      'employee-1',
      { status: 'inactive' },
    );
  });
});
