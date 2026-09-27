import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import BackupRecovery from './BackupRecovery';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'super_admin' } }) }));
vi.mock('@/services/recoveryService', () => ({
  recoveryApiConfigured: false,
  getRecoveryCapabilities: vi.fn(), listRecoveryJobs: vi.fn(),
  startManualBackup: vi.fn(), downloadManualBackup: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe('Backup & Recovery admin page', () => {
  it('disables unconfigured destinations and explains manual export and restore limits', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><BackupRecovery /></QueryClientProvider></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Backup & Recovery' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create backup' })).toBeDisabled();
    expect(screen.getByText('The Backup & Recovery service has not been connected to this environment.')).toBeInTheDocument();
    expect(screen.getByText('S3-compatible storage')).toBeInTheDocument();
    expect(screen.getByText('No automatic restore')).toBeInTheDocument();
  });
});
