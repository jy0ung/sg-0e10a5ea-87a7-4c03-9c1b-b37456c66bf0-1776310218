import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listCanonicalMock,
  createCanonicalMock,
  updateCanonicalMock,
  logErrorMock,
} = vi.hoisted(() => ({
  listCanonicalMock: vi.fn(),
  createCanonicalMock: vi.fn(),
  updateCanonicalMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock('@flc/hrms-services', () => ({
  listSalesAdvisors: listCanonicalMock,
  createSalesAdvisor: createCanonicalMock,
  updateSalesAdvisorStatus: updateCanonicalMock,
}));

vi.mock('./loggingService', () => ({
  loggingService: { error: logErrorMock },
}));

import {
  createSalesAdvisor,
  listSalesAdvisors,
  updateSalesAdvisorStatus,
} from './salesAdvisorService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HRMS Sales Advisor adapter', () => {
  it('uses the shared canonical registry', async () => {
    listCanonicalMock.mockResolvedValue([{ id: 'employee-1', code: 'SA001' }]);

    await expect(listSalesAdvisors('c1')).resolves.toEqual([{ id: 'employee-1', code: 'SA001' }]);
    expect(listCanonicalMock).toHaveBeenCalledWith('c1');
  });

  it('creates through the shared atomic command', async () => {
    createCanonicalMock.mockResolvedValue('employee-1');

    const result = await createSalesAdvisor({
      companyId: 'c1',
      code: 'SA001',
      name: 'Aisyah',
      branchId: 'branch-1',
    });

    expect(result.error).toBeNull();
    expect(createCanonicalMock).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch-1' }));
  });

  it('updates canonical Employee status', async () => {
    updateCanonicalMock.mockResolvedValue(undefined);

    const result = await updateSalesAdvisorStatus('c1', 'employee-1', 'inactive');

    expect(result.error).toBeNull();
    expect(updateCanonicalMock).toHaveBeenCalledWith('c1', 'employee-1', 'inactive');
  });
});
