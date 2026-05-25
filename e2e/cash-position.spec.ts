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

async function setupCashMocks(page: Page, opts: { featureEnabled?: boolean; rows?: unknown[] } = {}) {
  const { featureEnabled = true, rows } = opts;
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'flag-3b',
          company_id: null,
          code: 'phase3b.financial-reports-v2',
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

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_cash_position*`, async route => {
    const defaultRows = [
      // Opening balance derived from first row = running - daily_net = 100000 - 8000 = 92000
      { position_date: '2026-05-01', daily_debit: 10000, daily_credit: 2000, daily_net: 8000,   running_balance: 100000 },
      { position_date: '2026-05-02', daily_debit: 0,     daily_credit: 0,    daily_net: 0,      running_balance: 100000 },
      { position_date: '2026-05-03', daily_debit: 5000,  daily_credit: 7500, daily_net: -2500,  running_balance: 97500 },
    ];
    await fulfillJson(route, rows ?? defaultRows);
  });
}

test('Cash Position page renders KPI cards with opening, inflow, outflow, closing', async ({ page }) => {
  await setupCashMocks(page);

  await page.goto('/accounts/cash-position', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /cash position/i })).toBeVisible({ timeout: 30_000 });

  // Opening = 92,000 (100000 - 8000)
  await expect(page.getByTestId('cash-opening')).toHaveText('92,000.00');
  // Inflow (sum of debits) = 10000 + 0 + 5000 = 15000
  await expect(page.getByTestId('cash-inflow')).toHaveText('15,000.00');
  // Outflow (sum of credits) = 2000 + 0 + 7500 = 9500
  await expect(page.getByTestId('cash-outflow')).toHaveText('9,500.00');
  // Closing = last running_balance = 97,500
  await expect(page.getByTestId('cash-closing')).toHaveText('97,500.00');
});

test('Cash Position table shows daily rows with chart', async ({ page }) => {
  await setupCashMocks(page);

  await page.goto('/accounts/cash-position', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('2026-05-01')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('2026-05-02')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('2026-05-03')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/running balance/i)).toBeVisible({ timeout: 30_000 });
});

test('Cash Position shows feature unavailable when flag is disabled', async ({ page }) => {
  await setupCashMocks(page, { featureEnabled: false });

  await page.goto('/accounts/cash-position', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/feature not available/i)).toBeVisible({ timeout: 30_000 });
});

test('Cash Position shows empty state when no cash account is seeded', async ({ page }) => {
  await setupCashMocks(page, { rows: [] });

  await page.goto('/accounts/cash-position', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/no cash account activity/i)).toBeVisible({ timeout: 30_000 });
});
