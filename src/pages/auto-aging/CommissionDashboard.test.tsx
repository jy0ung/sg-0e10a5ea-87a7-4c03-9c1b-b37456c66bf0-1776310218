import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CommissionDashboard from './CommissionDashboard';
import type { CommissionRecord, CommissionRule, VehicleCanonical } from '@/types';

const mockToast = vi.fn();
const mockGetCommissionRules = vi.fn();
const mockCreateCommissionRule = vi.fn();
const mockUpdateCommissionRule = vi.fn();
const mockDeleteCommissionRule = vi.fn();
const mockGetCommissionRecords = vi.fn();
const mockUpdateCommissionRecordStatus = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', role: 'company_admin' } }),
}));

vi.mock('@/contexts/DataContext', () => ({
  useData: () => ({
    vehicles: [
      {
        id: 'vehicle-1',
        chassis_no: 'CHASSIS-001',
        branch_code: 'KK',
        salesman_name: 'Alice',
      },
      {
        id: 'vehicle-2',
        chassis_no: 'CHASSIS-002',
        branch_code: 'JB',
        salesman_name: 'Bob',
      },
    ] as VehicleCanonical[],
  }),
}));

vi.mock('@/hooks/useCompanyId', () => ({
  useCompanyId: () => 'company-1',
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/services/commissionService', () => ({
  getCommissionRules: (...args: unknown[]) => mockGetCommissionRules(...args),
  createCommissionRule: (...args: unknown[]) => mockCreateCommissionRule(...args),
  updateCommissionRule: (...args: unknown[]) => mockUpdateCommissionRule(...args),
  deleteCommissionRule: (...args: unknown[]) => mockDeleteCommissionRule(...args),
  getCommissionRecords: (...args: unknown[]) => mockGetCommissionRecords(...args),
  updateCommissionRecordStatus: (...args: unknown[]) => mockUpdateCommissionRecordStatus(...args),
}));

let commissionRules: CommissionRule[];
let commissionRecords: CommissionRecord[];

function getRecordRow(chassisNo: string) {
  const row = screen.getByText(chassisNo).closest('tr');

  if (!row) {
    throw new Error(`Unable to locate record row for ${chassisNo}`);
  }

  return row as HTMLTableRowElement;
}

describe('CommissionDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    commissionRules = [
      {
        id: 'rule-1',
        ruleName: 'Fast Delivery Bonus',
        amount: 500,
        thresholdDays: 30,
        companyId: 'company-1',
      },
    ];

    commissionRecords = [
      {
        id: 'record-1',
        vehicleId: 'vehicle-1',
        chassisNo: 'CHASSIS-001',
        salesmanName: 'Alice',
        ruleId: 'rule-1',
        ruleName: 'Fast Delivery Bonus',
        status: 'pending',
        amount: 500,
        period: '2026-04',
        companyId: 'company-1',
        createdAt: '2026-04-29T10:00:00.000Z',
      },
      {
        id: 'record-2',
        vehicleId: 'vehicle-2',
        chassisNo: 'CHASSIS-002',
        salesmanName: 'Bob',
        ruleId: 'rule-1',
        ruleName: 'Fast Delivery Bonus',
        status: 'approved',
        amount: 500,
        period: '2026-04',
        companyId: 'company-1',
        createdAt: '2026-04-29T10:05:00.000Z',
      },
    ];

    mockGetCommissionRules.mockResolvedValue({ data: commissionRules, error: null });
    mockGetCommissionRecords.mockImplementation(async () => ({ data: [...commissionRecords], error: null }));
    mockCreateCommissionRule.mockResolvedValue({ data: null, error: null });
    mockUpdateCommissionRule.mockResolvedValue({ error: null });
    mockDeleteCommissionRule.mockResolvedValue({ error: null });
    mockUpdateCommissionRecordStatus.mockImplementation(async (_companyId, recordId, status) => {
      commissionRecords = commissionRecords.map((record) => (
        record.id === recordId ? { ...record, status } : record
      ));
      return { error: null };
    });
  });

  it('approves pending commission records and updates the row actions', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><CommissionDashboard /></QueryClientProvider>);

    await screen.findByText('CHASSIS-001');

    const pendingRow = getRecordRow('CHASSIS-001');
    fireEvent.click(within(pendingRow).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(mockUpdateCommissionRecordStatus).toHaveBeenCalledWith('company-1', 'record-1', 'approved');
    });

    await waitFor(() => {
      const updatedRow = getRecordRow('CHASSIS-001');
      expect(within(updatedRow).getByText('approved')).toBeInTheDocument();
      expect(within(updatedRow).getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument();
    });
  });

  it('marks approved commission records as paid and removes the action button', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><CommissionDashboard /></QueryClientProvider>);

    await screen.findByText('CHASSIS-002');

    const approvedRow = getRecordRow('CHASSIS-002');
    fireEvent.click(within(approvedRow).getByRole('button', { name: 'Mark Paid' }));

    await waitFor(() => {
      expect(mockUpdateCommissionRecordStatus).toHaveBeenCalledWith('company-1', 'record-2', 'paid');
    });

    await waitFor(() => {
      const updatedRow = getRecordRow('CHASSIS-002');
      expect(within(updatedRow).getByText('paid')).toBeInTheDocument();
      expect(within(updatedRow).queryByRole('button', { name: 'Mark Paid' })).not.toBeInTheDocument();
    });
  });
});