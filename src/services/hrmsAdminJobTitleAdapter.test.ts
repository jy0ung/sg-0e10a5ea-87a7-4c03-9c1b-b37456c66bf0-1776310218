import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listCanonicalMock,
  createCanonicalMock,
  updateCanonicalMock,
  deleteCanonicalMock,
  auditMock,
} = vi.hoisted(() => ({
  listCanonicalMock: vi.fn(),
  createCanonicalMock: vi.fn(),
  updateCanonicalMock: vi.fn(),
  deleteCanonicalMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('@flc/hrms-services', () => ({
  listJobTitles: listCanonicalMock,
  createJobTitle: createCanonicalMock,
  updateJobTitle: updateCanonicalMock,
  deleteJobTitle: deleteCanonicalMock,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('@/services/auditService', () => ({
  logUserAction: auditMock,
}));

import {
  createJobTitle,
  deleteJobTitle,
  listJobTitles,
  updateJobTitle,
} from './hrmsAdminService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UBS Job Title admin adapter', () => {
  it('lists through the package-owned canonical service', async () => {
    listCanonicalMock.mockResolvedValue([{ id: 'job-1', name: 'Sales Executive' }]);

    await expect(listJobTitles('c1')).resolves.toEqual({
      data: [{ id: 'job-1', name: 'Sales Executive' }],
      error: null,
    });
    expect(listCanonicalMock).toHaveBeenCalledWith('c1');
  });

  it('preserves audit logging for successful creates and updates', async () => {
    createCanonicalMock.mockResolvedValue({ id: 'job-1', name: 'Sales Executive' });
    updateCanonicalMock.mockResolvedValue(undefined);

    const input = {
      name: 'Sales Executive',
      departmentId: 'dept-1',
      level: 'executive' as const,
      description: 'Customer-facing sales role',
      isActive: true,
    };

    const created = await createJobTitle('c1', 'actor-1', input);
    const updated = await updateJobTitle('c1', 'job-1', 'actor-1', input);

    expect(created.error).toBeNull();
    expect(updated.error).toBeNull();
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'create', 'job_title', 'job-1', { name: 'Sales Executive' },
    );
    expect(auditMock).toHaveBeenCalledWith(
      'actor-1', 'update', 'job_title', 'job-1', { name: 'Sales Executive' },
    );
  });

  it('surfaces canonical Employee assignment errors on delete', async () => {
    deleteCanonicalMock.mockRejectedValue(
      new Error('Cannot delete: 2 employee(s) are assigned to this job title. Reassign them first.'),
    );

    const result = await deleteJobTitle('c1', 'job-1', 'actor-1');

    expect(result.error).toBe(
      'Cannot delete: 2 employee(s) are assigned to this job title. Reassign them first.',
    );
    expect(auditMock).not.toHaveBeenCalledWith(
      'actor-1', 'delete', 'job_title', 'job-1', {},
    );
  });
});
