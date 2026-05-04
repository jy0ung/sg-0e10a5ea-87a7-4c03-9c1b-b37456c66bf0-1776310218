import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import VehicleDetail from './VehicleDetail';
import type { VehicleCanonical } from '@/types';

const mockUseData = vi.fn();

vi.mock('@/contexts/DataContext', () => ({
  useData: () => mockUseData(),
}));

vi.mock('@/components/vehicles/VehicleEditDialog', () => ({
  VehicleEditDialog: () => null,
}));

vi.mock('@/utils/forecasting', () => ({
  forecastVehicleMilestones: () => [],
  getVehicleRisk: () => 'on_track',
}));

const vehicle: VehicleCanonical = {
  id: 'vehicle-1',
  chassis_no: 'CHASSIS-001',
  branch_code: 'KK',
  model: 'Hilux',
  payment_method: 'LOAN',
  salesman_name: 'Alice',
  customer_name: 'Bob',
  is_d2d: false,
  import_batch_id: 'batch-1',
  source_row_id: 'row-1',
  bg_date: '2026-01-01',
  shipment_etd_pkg: '2026-01-03',
  date_received_by_outlet: '2026-01-10',
  reg_date: '2026-01-12',
  delivery_date: '2026-01-15',
  disb_date: '2026-01-20',
  bg_to_delivery: 14,
  bg_to_shipment_etd: 2,
  etd_to_outlet: 7,
  outlet_to_reg: 2,
  reg_to_delivery: 3,
  delivery_to_disb: 5,
  bg_to_disb: 19,
};

function renderPage(initialEntry = '/auto-aging/vehicles/CHASSIS-001') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/auto-aging/vehicles/:chassisNo" element={<VehicleDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VehicleDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseData.mockReturnValue({
      vehicles: [vehicle],
      qualityIssues: [],
      kpiSummaries: [],
      slas: [],
      loading: false,
      reloadFromDb: vi.fn(),
    });
  });

  it('loads the vehicle from the chassis route parameter', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'CHASSIS-001' })).toBeInTheDocument();
    expect(screen.getAllByText(/Hilux/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('Vehicle Not Found')).not.toBeInTheDocument();
  });
});