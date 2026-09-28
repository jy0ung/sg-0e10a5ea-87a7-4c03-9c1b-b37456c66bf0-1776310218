import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedBranding } from '@flc/platform-services';
import { profileUpdateSchema, type ProfileUpdateFormData } from '@/lib/validations';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProfileSettings } from './SettingsSections';

vi.mock('@/config/rolePermissions', () => ({ ROLE_LABELS: {} }));

const branding: ResolvedBranding = {
  companyName: 'FLC', legalName: '', companyRegNo: '', appName: 'UBS', appShortName: 'UBS',
  logoUrl: null, loginLogoUrl: null, faviconUrl: null, address: '', supportEmail: '',
  supportPhone: '', website: '', defaultTimezone: 'Asia/Kuala_Lumpur', defaultLocale: 'en-MY',
  accentColor: '', copyrightText: '',
};

function ProfileFixture({ onSave }: { onSave: (data: ProfileUpdateFormData) => void }) {
  const form = useForm<ProfileUpdateFormData>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: { name: 'Current User' },
    mode: 'onChange',
  });
  return (
    <ProfileSettings
      form={form}
      user={{ id: 'user-1', email: 'user@example.test', name: 'Current User', role: 'sales', branch_id: 'branch-1', company_id: 'company-1' }}
      branches={[{ id: 'branch-1', name: 'Kota Kinabalu', code: 'KK', orSeries: 'OR-KK', vdoSeries: 'VDO-KK', companyId: 'company-1', createdAt: '', updatedAt: '' }]}
      branding={branding}
      saving={false}
      onSave={onSave}
    />
  );
}

describe('ProfileSettings', () => {
  it('shows branch and role as read-only context and submits only personal fields', async () => {
    const onSave = vi.fn();
    render(<ProfileFixture onSave={onSave} />);

    expect(screen.getByLabelText('Branch Assignment')).toBeDisabled();
    expect(screen.getByLabelText('Branch Assignment')).toHaveValue('Kota Kinabalu');
    expect(screen.getByLabelText('Role')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Updated User' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Updated User' }, expect.anything()));
  });
});
