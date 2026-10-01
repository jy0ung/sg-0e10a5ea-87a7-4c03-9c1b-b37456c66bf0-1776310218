/** COMPONENT/MOCKED: actual pages/router; service responses are fixtures, not browser-to-DB E2E.
 * CP-01/02 in dms-case-ro-characterization.rls.spec.ts separately execute the real service.
 * KNOWN GAP witnesses must be revised when a governed implementation replaces this behavior.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LeadDetail } from '@/types';
import NewDeal from './NewDeal';
import LeadIntakeDetail from './LeadIntakeDetail';
import SalesDashboard from './SalesDashboard';

const fixtures = vi.hoisted(() => ({
  user: { id: 'profile-uuid', company_id: 'fixture-company', employee_id: 'employee-uuid' as string | null,
    name: 'Fixture advisor', email: 'fixture@example.test', access_scope: 'company' },
  create: vi.fn(), detail: vi.fn(), dashboard: vi.fn(), vehicleKpi: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: fixtures.user }) }));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => fixtures.user.company_id }));
vi.mock('@/hooks/useFeatureFlag', () => ({ useFeatureFlag: () => true }));
vi.mock('@/services/dealService', () => ({ createDeal: fixtures.create }));
vi.mock('@/services/leadIntakeService', () => ({ getLeadDetail: fixtures.detail, addLeadFollowup: vi.fn() }));
vi.mock('@/services/salesOrderService', () => ({ getSalesDashboardSummary: fixtures.dashboard }));
vi.mock('@/services/vehicleService', () => ({ getVehicleKpiSummary: fixtures.vehicleKpi }));
vi.mock('@/services/branchService', () => ({ resolveBranchCode: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function LocationWitness() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}
function mount(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <MemoryRouter initialEntries={[path]}>
        <LocationWitness />
        <Routes>
          <Route path="/sales/deals/new" element={<NewDeal />} />
          <Route path="/sales/lead-intake/:kind/:rawId" element={<LeadIntakeDetail />} />
          <Route path="/sales/deals/:id" element={<div>Persisted Deal route</div>} />
          <Route path="/sales" element={<SalesDashboard />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function enter(deposit: number) {
  fireEvent.change(screen.getByPlaceholderText('Full name'), { target: { value: 'Repeated customer' } });
  fireEvent.change(screen.getByPlaceholderText('IC number'), { target: { value: 'Synthetic IC' } });
  fireEvent.change(screen.getByPlaceholderText('Phone number'), { target: { value: '000-test' } });
  fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'customer@example.test' } });
  const prices = screen.getAllByRole('spinbutton');
  [85000, deposit, 1000, 200].forEach((value, i) => fireEvent.change(prices[i], { target: { value: String(value) } }));
  fireEvent.change(screen.getByPlaceholderText('Additional notes...'), { target: { value: 'Retain local notes' } });
}
async function submit(expected: Record<string, unknown>, uuid = 'returned-deal-uuid') {
  fireEvent.click(screen.getByRole('button', { name: 'Create Deal' }));
  await waitFor(() => expect(fixtures.create).toHaveBeenCalledExactlyOnceWith(expected, fixtures.user.id));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/sales/deals/${uuid}`));
}
function input(deposit: number) {
  return {
    company_id: 'fixture-company', customer_name: 'Repeated customer', customer_ic: 'Synthetic IC',
    customer_phone: '000-test', customer_email: 'customer@example.test', model_name: '', variant: '', colour: '',
    chassis_no: '', selling_price: 85000, deposit_amount: deposit, discount_amount: 1000, accessories_amount: 200,
    lead_source: 'auto_aging', lead_source_detail: '', notes: 'Retain local notes', sales_advisor_id: fixtures.user.id,
    sales_advisor_employee_id: fixtures.user.employee_id, sales_advisor_name: fixtures.user.name || fixtures.user.email,
  };
}

describe('COMPONENT/MOCKED Case creation compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.user.employee_id = 'employee-uuid';
    fixtures.user.name = 'Fixture advisor';
    fixtures.create.mockResolvedValue({ data: { id: 'returned-deal-uuid' }, error: null });
  });

  for (const deposit of [0, 500]) {
    it(`CP-03 standalone deposit ${deposit} preserves vehicle prefill, actor binding, input and UUID navigation`, async () => {
      mount('/sales/deals/new?model=Proton%20Saga&variant=Premium&colour=Grey&chassis=SYNTHETIC-CHASSIS');
      expect(screen.getByDisplayValue('Proton Saga')).toBeVisible();
      expect(screen.getByDisplayValue('Premium')).toBeVisible();
      expect(screen.getByDisplayValue('Grey')).toBeVisible();
      enter(deposit);
      await submit({ ...input(deposit), model_name: 'Proton Saga', variant: 'Premium', colour: 'Grey',
        chassis_no: 'SYNTHETIC-CHASSIS', lead_source_detail: 'From Auto Aging vehicle explorer' });
    });
  }

  for (const kind of ['lead', 'prospect'] as const) {
    for (const deposit of [0, 500]) {
      it(`CP-03 KNOWN GAP ${kind} conversion deposit ${deposit} carries only repeated customer ID and ignores raw origin`, async () => {
        // Identical customer evidence on two distinct origins must not certify either origin.
        const rawId = kind === 'lead' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222';
        const detail: LeadDetail = { sourceKind: kind, sourceRawId: rawId, dmsExternalId: 'SAME-EXTERNAL',
          dmsCustomerId: 'REPEATED/CUSTOMER', branchCode: 'FIXTURE', salespersonCode: 'SAME-ADVISOR', status: 'open',
          sourceCreatedAt: null, fetchedAt: '2026-10-01T00:00:00Z', rawPayload: { synthetic: true }, followups: [] };
        fixtures.detail.mockResolvedValue({ data: detail, error: null });
        mount(`/sales/lead-intake/${kind}/${rawId}`);
        fireEvent.click(await screen.findByTestId('convert-to-so'));
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/sales/deals/new?dmsCustomerId=REPEATED%2FCUSTOMER'));
        expect(fixtures.detail).toHaveBeenCalledExactlyOnceWith('fixture-company', kind, rawId);
        expect(screen.getByPlaceholderText('Full name')).toHaveValue('');
        enter(deposit);
        // Exact argument comparison proves no customer/source ID is silently submitted.
        await submit(input(deposit));
      });
    }
  }

  it('CP-03 KNOWN GAP minimal standalone form accepts no documents, defaults auto_aging and permits absent Employee', async () => {
    fixtures.user.employee_id = null;
    fixtures.user.name = '';
    mount('/sales/deals/new');
    fireEvent.change(screen.getByPlaceholderText('Full name'), { target: { value: 'Only supplied field' } });
    await submit({ ...input(0), customer_name: 'Only supplied field', customer_ic: '', customer_phone: '', customer_email: '',
      selling_price: 0, discount_amount: 0, accessories_amount: 0, notes: '' });
    // This observed form behavior does not resolve the OPEN POLICY document/creator gate.
  });

  it('CP-04 legacy dashboard labels its fixture population MTD Orders', async () => {
    fixtures.dashboard.mockResolvedValue({ data: { mtd: { orderCount: 2, totalValue: 300 }, vehiclesLinked: 0,
      branchBreakdown: [], monthlyTrend: [], outstandingAr: 0 }, error: null });
    fixtures.vehicleKpi.mockResolvedValue({ data: { total: 0 }, error: null });
    mount('/sales');
    const label = await screen.findByText('MTD Orders');
    expect(label.parentElement).toHaveTextContent('2');
    expect(fixtures.dashboard).toHaveBeenCalledWith('fixture-company', null);
    // LIVE DB CP-04 identifies the counted rows; this fixture is not an official Booking KPI.
  });
});
