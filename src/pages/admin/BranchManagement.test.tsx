import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BranchManagement from './BranchManagement';
import { deleteBranch, getBranches, upsertBranch } from '@/services/masterDataService';
import type { BranchRecord } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasRole: () => true,
  }),
}));

vi.mock('@/hooks/useCompanyId', () => ({
  useCompanyId: () => 'company-1',
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/services/masterDataService', () => ({
  getBranches: vi.fn(),
  upsertBranch: vi.fn(),
  deleteBranch: vi.fn(),
}));

const branch: BranchRecord = {
  id: 'branch-1',
  code: 'KK',
  name: 'Kota Kinabalu',
  orSeries: 'OR-KK',
  vdoSeries: 'VDO-KK',
  companyId: 'company-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BranchManagement />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BranchManagement', () => {
  beforeEach(() => {
    vi.mocked(getBranches).mockResolvedValue({ data: [branch], error: null });
    vi.mocked(upsertBranch).mockResolvedValue({ error: null });
    vi.mocked(deleteBranch).mockResolvedValue({ error: null });
  });

  it('renders inline validation messages for required fields', async () => {
    renderPage();
    await screen.findAllByText('Kota Kinabalu');

    fireEvent.click(screen.getByRole('button', { name: 'Add Branch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findAllByText('Required')).toHaveLength(2);
    expect(upsertBranch).not.toHaveBeenCalled();
  });

  it('creates a branch with normalized values', async () => {
    renderPage();
    await screen.findAllByText('Kota Kinabalu');

    fireEvent.click(screen.getByRole('button', { name: 'Add Branch' }));
    fireEvent.change(screen.getByLabelText('Branch Code'), { target: { value: 'sdk' } });
    fireEvent.change(screen.getByLabelText('Branch Name'), { target: { value: 'Sandakan' } });
    fireEvent.change(screen.getByLabelText('OR Series'), { target: { value: 'OR-SDK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(upsertBranch).toHaveBeenCalledWith('company-1', {
        id: undefined,
        code: 'SDK',
        name: 'Sandakan',
        orSeries: 'OR-SDK',
        vdoSeries: undefined,
      });
    });
  });

  it('supports edit and delete flows', async () => {
    renderPage();
    await screen.findAllByText('Kota Kinabalu');

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit KK' })[0]);
    fireEvent.change(screen.getByLabelText('Branch Name'), { target: { value: 'Kota Kinabalu HQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(upsertBranch).toHaveBeenCalledWith('company-1', expect.objectContaining({
        id: 'branch-1',
        name: 'Kota Kinabalu HQ',
      }));
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete KK' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deleteBranch).toHaveBeenCalledWith('company-1', 'branch-1');
    });
  });
});
