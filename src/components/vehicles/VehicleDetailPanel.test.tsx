import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { VehicleDetailPanel } from './VehicleDetailPanel';
import type { VehicleCanonical } from '@/types';

// ── Mock dependencies ──────────────────────────────────────────────────────

vi.mock('@/hooks/useColumnPermissions', () => ({
  useColumnPermissions: () => ({
    permissions: {
      columns: new Map<string, string>(),
      canViewDetails: true,
      canEdit: true,
      canBulkEdit: false,
    },
    isLoading: false,
  }),
  canViewField: () => true,
  canEditField: (_perms: unknown, _col: string) => true,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'company_admin' } }),
}));

vi.mock('@/services/auditService', () => ({
  getAuditLog: vi.fn().mockResolvedValue({ data: [] }),
}));

// Radix Dialog uses portals — render inline for tests.
vi.mock('@radix-ui/react-dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@radix-ui/react-dialog')>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// ── Test fixture ──────────────────────────────────────────────────────────

const makeVehicle = (overrides: Partial<VehicleCanonical> = {}): VehicleCanonical => ({
  id: 'v1',
  chassis_no: 'CH001',
  branch_code: 'KK',
  model: 'Hilux',
  payment_method: 'LOAN',
  salesman_name: 'Alice',
  customer_name: 'Bob',
  is_d2d: false,
  import_batch_id: 'b1',
  source_row_id: 'r1',
  bg_date: '2025-01-01',
  shipment_etd_pkg: '2025-01-15',
  shipment_eta_kk_twu_sdk: '2025-02-01',
  date_received_by_outlet: '2025-02-05',
  reg_date: '2025-02-10',
  delivery_date: '2025-02-20',
  disb_date: '2025-03-01',
  bg_to_delivery: 50,
  bg_to_shipment_etd: 14,
  etd_to_outlet: 21,
  outlet_to_reg: 5,
  reg_to_delivery: 10,
  delivery_to_disb: 9,
  bg_to_disb: 59,
  ...overrides,
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('VehicleDetailPanel', () => {
  const onClose = vi.fn();
  const onEdit = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open=false', () => {
    const { container } = render(
      <VehicleDetailPanel vehicle={makeVehicle()} open={false} onClose={onClose} />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders nothing when vehicle is null', () => {
    const { container } = render(
      <VehicleDetailPanel vehicle={null} open={true} onClose={onClose} />,
    );
    expect(container.textContent).toBe('');
  });

  it('shows chassis number and model in the header when open', () => {
    render(<VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} />);
    expect(screen.getByText('CH001')).toBeInTheDocument();
    // Hilux appears in the subtitle and info grid
    expect(screen.getAllByText(/Hilux/i).length).toBeGreaterThan(0);
    // KK appears in the subtitle
    expect(screen.getAllByText(/KK/i).length).toBeGreaterThan(0);
  });

  it('shows customer and salesman in the vehicle info grid', () => {
    render(<VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} />);
    // Bob appears only in info grid; Alice appears in both header chips and info grid
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
  });

  it('shows the lifecycle timeline by default (no tab required)', () => {
    render(<VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} />);
    // Milestone Timeline heading is always visible
    expect(screen.getByText(/Milestone Timeline/i)).toBeInTheDocument();
    // BG Date and Disbursement are always rendered
    expect(screen.getByText('BG Date')).toBeInTheDocument();
    expect(screen.getByText('Disbursement')).toBeInTheDocument();
  });

  it('renders all 7 lifecycle milestones', () => {
    render(<VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} />);
    expect(screen.getByText('BG Date')).toBeInTheDocument();
    expect(screen.getByText('Shipment ETD')).toBeInTheDocument();
    expect(screen.getByText('Shipment ETA')).toBeInTheDocument();
    expect(screen.getByText('Outlet Received')).toBeInTheDocument();
    expect(screen.getByText('Registration')).toBeInTheDocument();
    expect(screen.getByText('Delivery')).toBeInTheDocument();
    expect(screen.getByText('Disbursement')).toBeInTheDocument();
  });

  it('shows "BG Date" above "Disbursement" in the DOM (chronological top-to-bottom)', () => {
    render(<VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} />);
    const bgEl = screen.getByText('BG Date');
    const disbEl = screen.getByText('Disbursement');
    // BG Date should come before Disbursement in the DOM
    expect(
      bgEl.compareDocumentPosition(disbEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows KPI days badge on the timeline connector', () => {
    render(<VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} />);
    // delivery_to_disb = 9d — appears in timeline connector and/or KPI breakdown
    expect(screen.getAllByText('9d').length).toBeGreaterThan(0);
    // bg_to_shipment_etd = 14d — appears in timeline connector and/or KPI breakdown
    expect(screen.getAllByText('14d').length).toBeGreaterThan(0);
  });

  it('shows KPI breakdown section with SLA values', () => {
    render(<VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} />);
    expect(screen.getByText(/KPI Breakdown/i)).toBeInTheDocument();
    // SLA shown as "/ 45d" in the KPI row
    expect(screen.getAllByText('/ 45d').length).toBeGreaterThan(0);
  });

  it('shows formatted dates for completed milestones', () => {
    render(<VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} />);
    // formatDate for '2025-03-01' → '01/03/2025'
    expect(screen.getByText('01/03/2025')).toBeInTheDocument();
  });

  it('shows "Pending" for missing milestone dates', () => {
    const vehicle = makeVehicle({ disb_date: undefined, delivery_to_disb: undefined });
    render(<VehicleDetailPanel vehicle={vehicle} open={true} onClose={onClose} />);
    const pending = screen.getAllByText('Pending');
    expect(pending.length).toBeGreaterThan(0);
  });

  it('shows Edit button when canEdit=true', () => {
    render(
      <VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} canEdit={true} onEdit={onEdit} />,
    );
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('hides Edit button when canEdit=false', () => {
    render(
      <VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} canEdit={false} />,
    );
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('shows Audit view when Audit button is clicked', async () => {
    render(<VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} />);
    // Flush async audit log fetch
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /audit/i }));
    await waitFor(
      () => expect(screen.getByText('No audit history available')).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it('returns to main view when Back button is clicked from Audit view', async () => {
    render(<VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /audit/i }));
    await waitFor(() => screen.getByText('No audit history available'));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText(/Milestone Timeline/i)).toBeInTheDocument();
  });

  it('calls onClose when dialog is closed via X button', () => {
    render(<VehicleDetailPanel vehicle={makeVehicle()} open={true} onClose={onClose} />);
    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
