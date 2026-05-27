import { describe, expect, it } from 'vitest';
import { buildApprovalInboxItems } from './approvalInbox';

describe('buildApprovalInboxItems', () => {
  it('keeps nullable production approval rows render-safe', () => {
    const items = buildApprovalInboxItems(
      ([{
        id: 'leave-1',
        status: 'pending',
        startDate: '2026-05-27',
        endDate: '2026-05-27',
        days: null,
        reason: { raw: 'not renderable' },
        updatedAt: '',
      }] as any),
      ([{
        id: 'payroll-1',
        periodMonth: null,
        periodYear: null,
        totalHeadcount: null,
        totalGross: null,
        totalNet: null,
        notes: { raw: 'not renderable' },
        updatedAt: null,
        approvalInstanceStatus: 'pending',
        currentApproverRole: 'hr_manager',
      }] as any),
      ([{
        id: 'appraisal-1',
        title: null,
        cycle: null,
        periodStart: null,
        periodEnd: null,
        updatedAt: null,
        approvalInstanceStatus: 'pending',
        currentApproverRole: 'hr_manager',
      }] as any),
      {
        id: 'user-1',
        hrmsRoleIds: [],
        hrmsRoleCodes: ['hr_manager'],
        canApproveRequests: true,
      },
    );

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.summary)).toEqual([undefined, undefined, undefined]);
    expect(items.find((item) => item.entityType === 'payroll_run')?.title).toContain('Unknown period');
    expect(items.find((item) => item.entityType === 'appraisal')?.subtitle).toContain('annual');
  });
});
