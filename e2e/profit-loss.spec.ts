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

const PERIOD_ID = '22222222-2222-2222-2222-222222222222';

async function setupProfitLossMocks(page: Page, opts: { featureEnabled?: boolean; rows?: unknown[] } = {}) {
  const { featureEnabled = true, rows } = opts;
  await setupAuthMocks(page);

  // Feature flag
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

  // Accounting periods
  await page.route(`${SUPABASE_URL}/rest/v1/accounting_periods*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: PERIOD_ID,
          company_id: MOCK_PROFILE.company_id,
          name: 'May 2026',
          period_year: 2026,
          period_month: 5,
          start_date: '2026-05-01',
          end_date: '2026-05-31',
          status: 'open',
          closed_at: null,
          closed_by: null,
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });

  // get_profit_loss RPC
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_profit_loss*`, async route => {
    const defaultRows = [
      { account_id: 'acc-rev-1', account_code: '4100', account_name: 'Sales Revenue', account_type: 'revenue', amount: 250000 },
      { account_id: 'acc-rev-2', account_code: '4200', account_name: 'Service Revenue', account_type: 'revenue', amount: 50000 },
      { account_id: 'acc-exp-1', account_code: '5100', account_name: 'Cost of Goods Sold', account_type: 'expense', amount: 180000 },
      { account_id: 'acc-exp-2', account_code: '6000', account_name: 'Operating Expenses', account_type: 'expense', amount: 40000 },
    ];
    await fulfillJson(route, rows ?? defaultRows);
  });
}

test('Profit & Loss page renders revenue, expense, and net income', async ({ page }) => {
  await setupProfitLossMocks(page);

  await page.goto('/accounts/profit-loss', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /profit & loss/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/sales revenue/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/cost of goods sold/i)).toBeVisible({ timeout: 30_000 });

  // Totals: revenue 250k+50k=300k, expense 180k+40k=220k, net 80k
  await expect(page.getByTestId('pl-total-revenue')).toHaveText('300,000.00');
  await expect(page.getByTestId('pl-total-expense')).toHaveText('220,000.00');
  await expect(page.getByTestId('pl-net-income')).toContainText(/net income/i);
  await expect(page.getByTestId('pl-net-income')).toContainText('80,000.00');
});

test('Profit & Loss shows net loss when expenses exceed revenue', async ({ page }) => {
  await setupProfitLossMocks(page, {
    rows: [
      { account_id: 'acc-rev-1', account_code: '4100', account_name: 'Sales Revenue', account_type: 'revenue', amount: 100000 },
      { account_id: 'acc-exp-1', account_code: '5100', account_name: 'Cost of Goods Sold', account_type: 'expense', amount: 150000 },
    ],
  });

  await page.goto('/accounts/profit-loss', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('pl-net-income')).toContainText(/net loss/i);
  await expect(page.getByTestId('pl-net-income')).toContainText('50,000.00');
});

test('Profit & Loss page shows feature unavailable when flag is disabled', async ({ page }) => {
  await setupProfitLossMocks(page, { featureEnabled: false });

  await page.goto('/accounts/profit-loss', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/feature not available/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/financial reporting is not enabled/i)).toBeVisible({ timeout: 30_000 });
});

test('Profit & Loss shows empty state when period has no revenue or expense activity', async ({ page }) => {
  await setupProfitLossMocks(page, { rows: [] });

  await page.goto('/accounts/profit-loss', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/no revenue or expense activity/i)).toBeVisible({ timeout: 30_000 });
});
