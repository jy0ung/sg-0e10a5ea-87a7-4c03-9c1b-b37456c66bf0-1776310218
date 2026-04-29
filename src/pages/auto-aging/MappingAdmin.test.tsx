import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MappingAdmin from './MappingAdmin';
import type { BranchMapping, PaymentMethodMapping } from '@/types';

const mockToast = vi.fn();
const mockGetBranchMappings = vi.fn();
const mockCreateBranchMapping = vi.fn();
const mockUpdateBranchMapping = vi.fn();
const mockDeleteBranchMapping = vi.fn();
const mockGetPaymentMethodMappings = vi.fn();
const mockCreatePaymentMethodMapping = vi.fn();
const mockUpdatePaymentMethodMapping = vi.fn();
const mockDeletePaymentMethodMapping = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', role: 'company_admin' } }),
}));

vi.mock('@/hooks/useCompanyId', () => ({
  useCompanyId: () => 'company-1',
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/services/mappingService', () => ({
  getBranchMappings: (...args: unknown[]) => mockGetBranchMappings(...args),
  createBranchMapping: (...args: unknown[]) => mockCreateBranchMapping(...args),
  updateBranchMapping: (...args: unknown[]) => mockUpdateBranchMapping(...args),
  deleteBranchMapping: (...args: unknown[]) => mockDeleteBranchMapping(...args),
  getPaymentMethodMappings: (...args: unknown[]) => mockGetPaymentMethodMappings(...args),
  createPaymentMethodMapping: (...args: unknown[]) => mockCreatePaymentMethodMapping(...args),
  updatePaymentMethodMapping: (...args: unknown[]) => mockUpdatePaymentMethodMapping(...args),
  deletePaymentMethodMapping: (...args: unknown[]) => mockDeletePaymentMethodMapping(...args),
}));

let branchMappings: BranchMapping[];
let paymentMappings: PaymentMethodMapping[];

function getPanel(title: string) {
  const heading = screen.getByText(title);
  const panel = heading.closest('.glass-panel');

  if (!panel) {
    throw new Error(`Unable to locate panel for ${title}`);
  }

  return panel as HTMLDivElement;
}

describe('MappingAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    branchMappings = [
      {
        id: 'branch-1',
        rawValue: 'RAW-KK',
        canonicalCode: 'KK',
        notes: 'Initial branch mapping',
        companyId: 'company-1',
      },
    ];

    paymentMappings = [
      {
        id: 'payment-1',
        rawValue: 'CASH',
        canonicalValue: 'Cash',
        notes: 'Initial payment mapping',
        companyId: 'company-1',
      },
    ];

    mockGetBranchMappings.mockImplementation(async () => ({ data: [...branchMappings], error: null }));
    mockGetPaymentMethodMappings.mockImplementation(async () => ({ data: [...paymentMappings], error: null }));

    mockCreateBranchMapping.mockImplementation(async ({ rawValue, canonicalCode, notes, companyId }) => {
      branchMappings = [
        ...branchMappings,
        {
          id: 'branch-2',
          rawValue,
          canonicalCode,
          notes,
          companyId,
        },
      ];
      return { error: null };
    });

    mockUpdateBranchMapping.mockImplementation(async (companyId, id, payload) => {
      branchMappings = branchMappings.map((mapping) => (
        mapping.id === id
          ? { ...mapping, rawValue: payload.rawValue, canonicalCode: payload.canonicalCode, notes: payload.notes, companyId }
          : mapping
      ));
      return { error: null };
    });

    mockDeleteBranchMapping.mockImplementation(async (_companyId, id) => {
      branchMappings = branchMappings.filter((mapping) => mapping.id !== id);
      return { error: null };
    });

    mockCreatePaymentMethodMapping.mockImplementation(async ({ rawValue, canonicalValue, notes, companyId }) => {
      paymentMappings = [
        ...paymentMappings,
        {
          id: 'payment-2',
          rawValue,
          canonicalValue,
          notes,
          companyId,
        },
      ];
      return { error: null };
    });

    mockUpdatePaymentMethodMapping.mockImplementation(async (companyId, id, payload) => {
      paymentMappings = paymentMappings.map((mapping) => (
        mapping.id === id
          ? { ...mapping, rawValue: payload.rawValue, canonicalValue: payload.canonicalValue, notes: payload.notes, companyId }
          : mapping
      ));
      return { error: null };
    });

    mockDeletePaymentMethodMapping.mockImplementation(async (_companyId, id) => {
      paymentMappings = paymentMappings.filter((mapping) => mapping.id !== id);
      return { error: null };
    });
  });

  it('creates a new branch mapping and reloads the table', async () => {
    render(<MappingAdmin />);

    await screen.findByText('RAW-KK');

    const branchPanel = getPanel('Branch Mappings');
    fireEvent.click(within(branchPanel).getByRole('button', { name: /add/i }));

    fireEvent.change(within(branchPanel).getByPlaceholderText('RAW'), { target: { value: 'RAW-JB' } });
    fireEvent.change(within(branchPanel).getByPlaceholderText('Canonical'), { target: { value: 'JB' } });
    fireEvent.change(within(branchPanel).getByPlaceholderText('Notes'), { target: { value: 'Johor branch' } });

    const newRow = within(branchPanel).getByPlaceholderText('RAW').closest('tr');
    fireEvent.click(within(newRow as HTMLTableRowElement).getAllByRole('button')[0]);

    await waitFor(() => {
      expect(mockCreateBranchMapping).toHaveBeenCalledWith({
        rawValue: 'RAW-JB',
        canonicalCode: 'JB',
        notes: 'Johor branch',
        companyId: 'company-1',
      });
    });

    expect(await screen.findByText('RAW-JB')).toBeInTheDocument();
    expect(within(getPanel('Branch Mappings')).getByText('RAW-JB')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith({ title: 'Branch mapping added' });
  });

  it('updates a payment mapping and persists the edited values', async () => {
    render(<MappingAdmin />);

    await screen.findByText('CASH');

    const paymentPanel = getPanel('Payment Method Mappings');
    const paymentRow = within(paymentPanel).getByText('CASH').closest('tr');
    fireEvent.click(within(paymentRow as HTMLTableRowElement).getAllByRole('button')[0]);

    const editingRow = within(paymentPanel).getByDisplayValue('CASH').closest('tr');
    const inputs = within(editingRow as HTMLTableRowElement).getAllByRole('textbox');

    fireEvent.change(inputs[1], { target: { value: 'Retail Cash' } });
    fireEvent.change(inputs[2], { target: { value: 'Updated payment mapping' } });
    fireEvent.click(within(editingRow as HTMLTableRowElement).getAllByRole('button')[0]);

    await waitFor(() => {
      expect(mockUpdatePaymentMethodMapping).toHaveBeenCalledWith(
        'company-1',
        'payment-1',
        {
          rawValue: 'CASH',
          canonicalValue: 'Retail Cash',
          notes: 'Updated payment mapping',
        },
        'user-1',
      );
    });

    expect(await screen.findByText('Retail Cash')).toBeInTheDocument();
    expect(within(getPanel('Payment Method Mappings')).getByText('Retail Cash')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith({ title: 'Payment mapping updated' });
  });

  it('deletes a branch mapping and refreshes the list', async () => {
    render(<MappingAdmin />);

    await screen.findByText('RAW-KK');

    const branchPanel = getPanel('Branch Mappings');
    const branchRow = within(branchPanel).getByText('RAW-KK').closest('tr');
    fireEvent.click(within(branchRow as HTMLTableRowElement).getAllByRole('button')[1]);

    await waitFor(() => {
      expect(mockDeleteBranchMapping).toHaveBeenCalledWith('company-1', 'branch-1', 'user-1');
    });

    await waitFor(() => {
      expect(within(branchPanel).queryByText('RAW-KK')).not.toBeInTheDocument();
    });

    expect(mockToast).toHaveBeenCalledWith({ title: 'Branch mapping deleted' });
  });
});