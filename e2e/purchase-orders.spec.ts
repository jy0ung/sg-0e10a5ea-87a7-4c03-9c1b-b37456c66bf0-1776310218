import { expect, test, type Page, type Route } from '@playwright/test';
import { MOCK_PROFILE, setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

test.describe.configure({ timeout: 90_000 });

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

const PO_ID = '55555555-5555-5555-5555-555555555555';

async function setupPoMocks(page: Page, opts: {
  featureEnabled?: boolean;
  list?: unknown[];
  detail?: Record<string, unknown> | null;
  lines?: unknown[];
} = {}) {
  const { featureEnabled = true, list, detail, lines } = opts;
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'flag-3e',
          company_id: null,
          code: 'phase3e.po-grn-v2',
          enabled: featureEnabled,
          rollout_pct: featureEnabled ? 100 : 0,
          description: null,
          created_at: '2026-05-25T00:00:00Z',
          updated_at: '2026-05-25T00:00:00Z',
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/purchase_orders*`, async route => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === 'GET') {
      // Detail fetch uses .maybeSingle() — typically Supabase adds `&select=...&id=eq.X`
      // List fetch uses `&order=...`
      const defaultList = [
        {
          id: PO_ID, company_id: MOCK_PROFILE.company_id, po_no: 'PO-2026-001',
          supplier: 'Proton', order_date: '2026-05-20', expected_delivery_date: '2026-06-01',
          lifecycle_status: 'draft', total_amount: 150000, notes: null,
          created_by: 'user-1', approved_by: null, approved_at: null,
          created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        },
        {
          id: 'po-2', company_id: MOCK_PROFILE.company_id, po_no: 'PO-2026-002',
          supplier: 'Toyota', order_date: '2026-05-22', expected_delivery_date: null,
          lifecycle_status: 'approved', total_amount: 80000, notes: null,
          created_by: 'user-1', approved_by: 'user-2', approved_at: '2026-05-23T10:00:00Z',
          created_at: '2026-05-22T08:00:00Z', updated_at: '2026-05-23T10:00:00Z',
        },
      ];
      // If the URL has a specific id filter, return single-row detail
      if (url.includes('id=eq.')) {
        const defaultDetail = detail === undefined ? defaultList[0] : detail;
        await fulfillJson(route, defaultDetail ? [defaultDetail] : []);
        return;
      }
      await fulfillJson(route, list ?? defaultList);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/purchase_order_lines*`, async route => {
    if (route.request().method() === 'GET') {
      const defaultLines = [
        {
          id: 'line-1', company_id: MOCK_PROFILE.company_id, purchase_order_id: PO_ID, line_no: 1,
          chassis_no: 'CHASS-001', model: 'Hilux', variant: '2.4L',
          quantity: 1, unit_price: 100000, line_amount: 100000,
          created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        },
        {
          id: 'line-2', company_id: MOCK_PROFILE.company_id, purchase_order_id: PO_ID, line_no: 2,
          chassis_no: 'CHASS-002', model: 'Vios', variant: null,
          quantity: 2, unit_price: 25000, line_amount: 50000,
          created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
        },
      ];
      await fulfillJson(route, lines ?? defaultLines);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/create_purchase_order*`, async route => {
    await fulfillJson(route, PO_ID);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/transition_po_status*`, async route => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    await fulfillJson(route, body.p_id ?? PO_ID);
  });
}

test('Purchase Orders list renders rows with statuses and totals', async ({ page }) => {
  await setupPoMocks(page);

  await page.goto('/purchasing/orders', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /purchase orders/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`po-row-${PO_ID}`)).toBeVisible();
  await expect(page.getByTestId(`po-row-${PO_ID}`)).toContainText('PO-2026-001');
  await expect(page.getByTestId(`po-row-${PO_ID}`)).toContainText('Proton');
  await expect(page.getByTestId(`po-row-${PO_ID}`)).toContainText('150,000.00');
});

test('Purchase Order detail shows lines and transition buttons for draft state', async ({ page }) => {
  await setupPoMocks(page);

  await page.goto(`/purchasing/orders/${PO_ID}`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /PO PO-2026-001/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('po-status-badge')).toContainText(/draft/i);
  await expect(page.getByTestId('po-total-amount')).toContainText(/150,000\.00/);
  await expect(page.getByTestId('po-detail-line-1')).toContainText('Hilux');
  await expect(page.getByTestId('po-detail-line-2')).toContainText('Vios');
  // Draft → submitted / cancelled
  await expect(page.getByTestId('po-transition-submitted')).toBeVisible();
  await expect(page.getByTestId('po-transition-cancelled')).toBeVisible();
});

test('Purchase Order detail transitions draft to submitted and shows toast', async ({ page }) => {
  let postCalled = false;
  await setupPoMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/transition_po_status*`, async route => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    postCalled = true;
    expect(body.p_target_status).toBe('submitted');
    await fulfillJson(route, body.p_id ?? PO_ID);
  });

  await page.goto(`/purchasing/orders/${PO_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('po-transition-submitted').click();

  await expect(page.getByText(/PO submitted/i)).toBeVisible({ timeout: 30_000 });
  expect(postCalled).toBe(true);
});

test('New PO creation page computes line totals and posts to create RPC', async ({ page }) => {
  let createCalled = false;
  await setupPoMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/create_purchase_order*`, async route => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    createCalled = true;
    expect(body.p_po_no).toBe('PO-NEW-001');
    expect(body.p_supplier).toBe('Toyota');
    expect((body.p_lines as unknown[]).length).toBe(1);
    await fulfillJson(route, PO_ID);
  });

  await page.goto('/purchasing/orders/new', { waitUntil: 'domcontentloaded' });

  await page.getByTestId('po-no-input').fill('PO-NEW-001');
  await page.getByTestId('po-supplier-input').fill('Toyota');
  await page.getByTestId('po-line-0-model').fill('Hilux');
  // Quantity defaults to 1; price defaults to 0. Update price to see total.
  await page.locator('[data-testid="po-line-0"] input[type="number"]').nth(1).fill('45000');
  await expect(page.getByTestId('po-total')).toContainText('45,000.00');

  await page.getByTestId('save-po-button').click();
  await expect(page.getByText(/purchase order created/i)).toBeVisible({ timeout: 30_000 });
  expect(createCalled).toBe(true);
});

test('Purchase Orders shows feature unavailable when flag is disabled', async ({ page }) => {
  await setupPoMocks(page, { featureEnabled: false });

  await page.goto('/purchasing/orders', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/feature not available/i)).toBeVisible({ timeout: 30_000 });
});

test('Purchase Orders list shows empty state when no POs exist', async ({ page }) => {
  await setupPoMocks(page, { list: [] });

  await page.goto('/purchasing/orders', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/no purchase orders match/i)).toBeVisible({ timeout: 30_000 });
});
