import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AutoAgingDashboard from './AutoAgingDashboard';
import type { VehicleCanonical } from '@/types';

const mockNavigate = vi.fn();
const mockReloadFromDb = vi.fn().mockResolvedValue(undefined);
const mockGetAutoAgingDashboardSummary = vi.fn();
const mockSearchVehicles = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', company_id: 'company-1' } }),
}));

vi.mock('@/contexts/DataContext', () => ({
  useData: () => ({
    lastRefresh: '2026-04-29T15:00:00.000Z',
    reloadFromDb: mockReloadFromDb,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/services/vehicleService', () => ({
  getAutoAgingDashboardSummary: (...args: unknown[]) => mockGetAutoAgingDashboardSummary(...args),
  searchVehicles: (...args: unknown[]) => mockSearchVehicles(...args),
}));

vi.mock('@/components/charts/AgingTrendChart', () => ({
  AgingTrendChart: () => <div>Aging Trend Chart</div>,
}));

vi.mock('@/components/charts/OutlierScatterChart', () => ({
  OutlierScatterChart: () => <div>Outlier Scatter Chart</div>,
}));

vi.mock('@/components/charts/PaymentPieChart', () => ({
  PaymentPieChart: () => <div>Payment Pie Chart</div>,
}));

vi.mock('@/components/charts/StagePipelineCard', () => ({
  StagePipelineCard: () => <div>Stage Pipeline Card</div>,
}));

vi.mock('@/components/charts/KpiTrendChart', () => ({
  KpiTrendChart: () => <div>KPI Trend Chart</div>,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function createVehicle(index: number): VehicleCanonical {
  const chassisNo = `CHASSIS-${String(index).padStart(3, '0')}`;
  return {
    id: `vehicle-${index}`,
    chassis_no: chassisNo,
    branch_code: 'KK',
    model: 'X50',
    payment_method: 'LOAN',
    salesman_name: `Sales ${index}`,
    customer_name: `Customer ${index}`,
    is_d2d: false,
    import_batch_id: 'batch-1',
    source_row_id: `row-${index}`,
    bg_date: '2026-04-01',
    bg_to_delivery: 40 + index,
    bg_to_shipment_etd: 2,
    etd_to_outlet: 3,
    outlet_to_reg: 4,
    reg_to_delivery: 5,
    delivery_to_disb: 6,
    bg_to_disb: 46 + index,
  } as VehicleCanonical;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/auto-aging']}>
      <QueryClientProvider client={queryClient}>
        <AutoAgingDashboard />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AutoAgingDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    mockGetAutoAgingDashboardSummary.mockResolvedValue({
      data: {
        availableBranches: ['KK'],
        availableModels: ['X50'],
        kpiSummaries: [
          {
            kpiId: 'bg_to_delivery',
            label: 'BG Date to Delivery Date',
            shortLabel: 'BG → Delivery',
            validCount: 51,
            invalidCount: 0,
            missingCount: 0,
            median: 52,
            average: 54,
            p90: 80,
            overdueCount: 12,
            slaDays: 45,
          },
        ],
        qualityIssueCount: 1,
        qualityIssueSample: [
          {
            id: 'issue-1',
            chassisNo: 'CHASSIS-001',
            field: 'delivery_date',
            issueType: 'missing',
            message: 'Delivery date is required',
            severity: 'warning',
            importBatchId: 'batch-1',
          },
        ],
      },
      error: null,
    });

    mockSearchVehicles.mockResolvedValue({
      data: {
        rows: Array.from({ length: 51 }, (_, index) => createVehicle(index + 1)),
        totalCount: 51,
      },
      error: null,
    });
  });

  it('opens KPI vehicle details and routes overflow drill-downs to the explorer', async () => {
    renderPage();

    await screen.findByText('BG → Delivery');
    fireEvent.click(screen.getByText('BG → Delivery'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('BG Date to Delivery Date — Vehicle Details')).toBeInTheDocument();
    expect(within(dialog).getByText('Showing 50 of 51 vehicles.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'View all →' }));

    expect(mockNavigate).toHaveBeenCalledWith('/auto-aging/vehicles');
  });

  it('routes clicked KPI detail rows to the matching vehicle detail page', async () => {
    renderPage();

    await screen.findByText('BG → Delivery');
    fireEvent.click(screen.getByText('BG → Delivery'));

    const dialog = await screen.findByRole('dialog');
    const firstVehicleRow = within(dialog).getByText('CHASSIS-051');

    fireEvent.click(firstVehicleRow);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auto-aging/vehicles/CHASSIS-051');
    });
  });
});