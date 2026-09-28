import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getVehiclePermissionDraft, saveVehiclePermissionDraft } from '@flc/auth';
import { PermissionEditor } from './PermissionEditor';

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@flc/auth', () => ({
  getVehiclePermissionDraft: vi.fn(),
  saveVehiclePermissionDraft: vi.fn(),
}));

vi.mock('@flc/platform-services', () => ({
  loggingService: { error: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getVehiclePermissionDraft).mockResolvedValue({
    canEdit: false,
    canBulkEdit: false,
    canViewDetails: true,
    columns: { chassis_no: 'view' },
  });
  vi.mocked(saveVehiclePermissionDraft).mockResolvedValue({ error: null });
});

describe('PermissionEditor', () => {
  it('persists a general-only change through the atomic command', async () => {
    render(<PermissionEditor userId="target-1" userName="Target User" userRole="sales" />);
    await screen.findByText('Target User');
    fireEvent.click(screen.getAllByRole('switch')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(saveVehiclePermissionDraft).toHaveBeenCalledWith('target-1', {
      canEdit: true,
      canBulkEdit: false,
      canViewDetails: true,
      columns: { chassis_no: 'view' },
    }));
  });

  it('saves a template without a hidden form field', async () => {
    render(<PermissionEditor userId="target-1" userName="Target User" userRole="sales" />);
    await screen.findByText('Target User');
    fireEvent.click(screen.getByRole('button', { name: 'Full Access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(saveVehiclePermissionDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveVehiclePermissionDraft).mock.calls[0][1].columns).toMatchObject({
      chassis_no: 'edit',
      branch_code: 'edit',
      remark: 'edit',
    });
  });
});
