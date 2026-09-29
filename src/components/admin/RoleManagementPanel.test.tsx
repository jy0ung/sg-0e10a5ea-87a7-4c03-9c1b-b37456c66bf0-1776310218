import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROLE_SECTIONS } from '@/config/rolePermissions';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  save: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@flc/auth', async () => ({
  ...await import('../../../packages/auth/src/rolePermissions'),
  fetchRoleSectionMatrix: mocks.fetch,
  saveRoleSectionMatrix: mocks.save,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'company_admin', company_id: 'company-1' } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { RoleManagementPanel } from './RoleManagementPanel';

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RoleManagementPanel /></QueryClientProvider>);
  return client;
}

beforeEach(() => vi.clearAllMocks());

describe('RoleManagementPanel', () => {
  it('keeps dirty edits through a refetch and saves the loaded version once', async () => {
    const initialMatrix = { ...DEFAULT_ROLE_SECTIONS, manager: ['Sales'] };
    const remoteMatrix = { ...DEFAULT_ROLE_SECTIONS, manager: ['Auto Aging'] };
    mocks.fetch
      .mockResolvedValueOnce({ data: { version: 1, matrix: initialMatrix }, error: null })
      .mockResolvedValue({ data: { version: 2, matrix: remoteMatrix }, error: null });
    mocks.save.mockResolvedValue({ version: 3, error: null });
    const client = renderPanel();
    const grant = await screen.findByRole('button', { name: 'Manager - Sales: allowed' });
    await waitFor(() => expect(grant).toBeEnabled());
    fireEvent.click(grant);
    expect(screen.getByRole('button', { name: 'Manager - Sales: denied' })).toBeInTheDocument();
    await client.invalidateQueries({ queryKey: ['role-sections', 'company-1'] });
    expect(screen.getByRole('button', { name: 'Manager - Sales: denied' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith('company-1', 1, expect.objectContaining({ manager: [] }));
  });

  it('retains administrator recovery access during bulk Admin toggles', async () => {
    mocks.fetch.mockResolvedValue({ data: { version: 7, matrix: DEFAULT_ROLE_SECTIONS }, error: null });
    mocks.save.mockResolvedValue({ version: 8, error: null });
    renderPanel();
    const required = await screen.findByRole('button', { name: 'Super Admin - Admin: required' });
    await waitFor(() => expect(screen.getByTitle('Toggle eligible roles for Admin; administrator roles retain access')).toBeEnabled());
    expect(required).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Company Admin - Admin: required' })).toBeDisabled();
    const bulkToggle = screen.getByTitle('Toggle eligible roles for Admin; administrator roles retain access');
    fireEvent.click(bulkToggle);
    fireEvent.click(bulkToggle);
    fireEvent.click(screen.getByTitle('Toggle all for Super Admin'));
    expect(screen.getByRole('button', { name: 'Super Admin - Admin: required' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Company Admin - Admin: required' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Super Admin - Sales: denied' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('company-1', 7, expect.objectContaining({
      super_admin: expect.arrayContaining(['Admin']),
      company_admin: expect.arrayContaining(['Admin']),
    })));
  });
});
