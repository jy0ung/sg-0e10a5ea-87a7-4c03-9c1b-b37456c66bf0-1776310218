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

const PERIOD_ID = '33333333-3333-3333-3333-333333333333';

async function setupBalanceSheetMocks(page: Page, opts: { featureEnabled?: boolean; rows?: unknown[] } = {}) {
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

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_balance_sheet*`, async route => {
    const defaultRows = [
      { account_id: 'acc-asset-1', account_code: '1000', account_name: 'Cash and Bank',     account_type: 'asset',     balance: 150000 },
      { account_id: 'acc-asset-2', account_code: '1100', account_name: 'Accounts Receivable', account_type: 'asset',    balance: 50000 },
      { account_id: 'acc-liab-1',  account_code: '2100', account_name: 'Accounts Payable',   account_type: 'liability', balance: 40000 },
      { account_id: 'acc-eq-1',    account_code: '3100', account_name: 'Retained Earnings',  account_type: 'equity',    balance: 90000 },
      { account_id: null,          account_code: '9999', account_name: 'Current Period Earnings (unclosed)', account_type: 'equity', balance: 70000 },
    ];
    await fulfillJson(route, rows ?? defaultRows);
  });
}

test('Balance Sheet page renders assets, liabilities, equity, and balanced totals', async ({ page }) => {
  await setupBalanceSheetMocks(page);

  await page.goto('/accounts/balance-sheet', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /balance sheet/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/cash and bank/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/accounts payable/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/retained earnings/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/current period earnings/i)).toBeVisible({ timeout: 30_000 });

  // Assets 150k+50k=200k; Liabilities 40k; Equity 90k+70k=160k; Total L+E = 200k. Balanced.
  await expect(page.getByTestId('bs-total-asset')).toHaveText('200,000.00');
  await expect(page.getByTestId('bs-total-liability')).toHaveText('40,000.00');
  await expect(page.getByTestId('bs-total-equity')).toHaveText('160,000.00');
  await expect(page.getByTestId('bs-balance-check')).toContainText(/balanced/i);
});

test('Balance Sheet flags out-of-balance state', async ({ page }) => {
  await setupBalanceSheetMocks(page, {
    rows: [
      { account_id: 'acc-asset-1', account_code: '1000', account_name: 'Cash', account_type: 'asset',     balance: 100000 },
      { account_id: 'acc-liab-1',  account_code: '2100', account_name: 'AP',   account_type: 'liability', balance: 30000 },
      { account_id: 'acc-eq-1',    account_code: '3100', account_name: 'RE',   account_type: 'equity',    balance: 50000 },
    ],
  });

  await page.goto('/accounts/balance-sheet', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('bs-balance-check')).toContainText(/out of balance/i);
});

test('Balance Sheet shows feature unavailable when flag is disabled', async ({ page }) => {
  await setupBalanceSheetMocks(page, { featureEnabled: false });

  await page.goto('/accounts/balance-sheet', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /balance sheet unavailable/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/phase3b\.financial-reports-v2/i)).toBeVisible({ timeout: 30_000 });
});

test('Balance Sheet shows empty state when period has no balances', async ({ page }) => {
  await setupBalanceSheetMocks(page, { rows: [] });

  await page.goto('/accounts/balance-sheet', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/no balance sheet activity through this period/i)).toBeVisible({ timeout: 30_000 });
});
