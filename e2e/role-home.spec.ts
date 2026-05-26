import { expect, test, type Page, type Route } from '@playwright/test';
import { setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

test.describe.configure({ timeout: 90_000 });

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function setupHomeMocks(page: Page, opts: {
  featureEnabled?: boolean;
  homeKpis?: unknown[];
  definitions?: unknown[];
} = {}) {
  const { featureEnabled = true, homeKpis, definitions } = opts;
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'flag-4b', company_id: null, code: 'phase4.role-home',
          enabled: featureEnabled, rollout_pct: featureEnabled ? 100 : 0,
          description: null, created_at: '2026-05-26T00:00:00Z', updated_at: '2026-05-26T00:00:00Z',
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_role_home_kpis`, async route => {
    await fulfillJson(route, homeKpis ?? [
      {
        code: 'sales.weekly_revenue',
        label: 'Sales (last 7 days)',
        description: 'Sum of sales order amounts created in the last 7 days.',
        formula: { source: 'sales_orders', aggregation: 'sum' },
        position: 1,
      },
      {
        code: 'vehicles.total_stock',
        label: 'Vehicles in stock',
        description: 'Count of vehicles currently in stock.',
        formula: { source: 'vehicles', aggregation: 'count' },
        position: 2,
      },
    ]);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/upsert_role_kpi_defaults`, async route => {
    await fulfillJson(route, 'role-default-1');
  });

  await page.route(`${SUPABASE_URL}/rest/v1/kpi_definitions*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, definitions ?? [
        {
          id: 'd1', company_id: null, code: 'sales.weekly_revenue', label: 'Sales (last 7 days)',
          description: 'Weekly revenue.', formula: { source: 'sales_orders' },
          version: 1, is_active: true,
          created_at: '2026-05-26T00:00:00Z', updated_at: '2026-05-26T00:00:00Z',
        },
        {
          id: 'd2', company_id: null, code: 'vehicles.total_stock', label: 'Vehicles in stock',
          description: 'Stock count.', formula: { source: 'vehicles' },
          version: 1, is_active: true,
          created_at: '2026-05-26T00:00:00Z', updated_at: '2026-05-26T00:00:00Z',
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });
}

test.describe('Role-aware Home', () => {
  test('shows feature-off banner when phase4.role-home is disabled', async ({ page }) => {
    await setupHomeMocks(page, { featureEnabled: false });
    await page.goto('/home');

    await expect(page.getByTestId('home-feature-off')).toBeVisible({ timeout: 30_000 });
  });

  test('renders curated KPI cards for the signed-in role', async ({ page }) => {
    await setupHomeMocks(page);
    await page.goto('/home');

    await expect(page.getByTestId('home-kpi-grid')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('home-kpi-sales.weekly_revenue')).toBeVisible();
    await expect(page.getByTestId('home-kpi-vehicles.total_stock')).toBeVisible();
    await expect(page.getByText(/Welcome/i)).toBeVisible();
  });

  test('shows empty state when no role defaults are configured', async ({ page }) => {
    await setupHomeMocks(page, { homeKpis: [] });
    await page.goto('/home');

    await expect(page.getByText(/no kpis configured for your role/i)).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('KPI Definition Studio', () => {
  test('shows feature-off banner when phase4.role-home is disabled', async ({ page }) => {
    await setupHomeMocks(page, { featureEnabled: false });
    await page.goto('/admin/kpi-studio');

    await expect(page.getByTestId('studio-feature-off')).toBeVisible({ timeout: 30_000 });
  });

  test('lists definitions and pre-selects the current role assignments', async ({ page }) => {
    await setupHomeMocks(page);
    await page.goto('/admin/kpi-studio');

    await expect(page.getByTestId('studio-kpi-list')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('studio-kpi-sales.weekly_revenue')).toBeVisible();
    await expect(page.getByTestId('studio-kpi-vehicles.total_stock')).toBeVisible();
  });

  test('saves updated assignments via the upsert RPC', async ({ page }) => {
    await setupHomeMocks(page);

    let upsertCalled = false;
    await page.route(`${SUPABASE_URL}/rest/v1/rpc/upsert_role_kpi_defaults`, async route => {
      upsertCalled = true;
      await fulfillJson(route, 'role-default-1');
    });

    await page.goto('/admin/kpi-studio');
    await expect(page.getByTestId('studio-kpi-list')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('studio-save-button').click();
    await expect.poll(() => upsertCalled, { timeout: 10_000 }).toBe(true);
  });
});
