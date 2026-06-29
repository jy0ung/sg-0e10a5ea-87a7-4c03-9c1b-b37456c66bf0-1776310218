import { describe, expect, it } from 'vitest';
import { APP_ROLES, ROLE_DEFAULT_SCOPE } from '@flc/types';
import { inviteUserSchema, userUpdateSchema } from './validations';

describe('inviteUserSchema', () => {
  it('requires a branch for normal app roles', () => {
    const result = inviteUserSchema.safeParse({
      email: 'user@example.com',
      name: 'New User',
      role: 'creator_updater',
      company_id: 'company-1',
      branch_id: '',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['branch_id'],
      message: 'Branch is required',
    });
  });

  it('allows super admin invites without a branch', () => {
    const result = inviteUserSchema.safeParse({
      email: 'admin@example.com',
      name: 'Global Admin',
      role: 'super_admin',
      company_id: 'company-1',
      branch_id: '',
    });

    expect(result.success).toBe(true);
    expect(result.data?.branch_id).toBe('');
  });

  it('accepts every canonical app role', () => {
    for (const role of APP_ROLES) {
      const result = userUpdateSchema.safeParse({
        name: 'Role User',
        role,
        access_scope: ROLE_DEFAULT_SCOPE[role],
        branch_id: role === 'super_admin' ? null : 'branch-1',
      });

      expect(result.success, `${role} should be a valid user-management role`).toBe(true);
    }
  });
});
