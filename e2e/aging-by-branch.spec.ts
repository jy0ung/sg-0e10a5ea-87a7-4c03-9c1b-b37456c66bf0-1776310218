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

async function setupAgingMocks(page: Page, opts: { featureEnabled?: boolean; arRows?: unknown[]; apRows?: unknown[] } = {}) {
  const { featureEnabled = true, arRows, apRows } = opts;
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

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_ar_aging_by_branch*`, async route => {
    const defaultRows = [
      { branch_code: 'KCH', bucket: 'current',     invoice_count: 3, total_outstanding: 15000, overdue_amount: 0 },
      { branch_code: 'KCH', bucket: '31_60_days',  invoice_count: 1, total_outstanding: 8000,  overdue_amount: 8000 },
      { branch_code: 'BTU', bucket: 'over_90_days', invoice_count: 2, total_outstanding: 22000, overdue_amount: 22000 },
    ];
    await fulfillJson(route, arRows ?? defaultRows);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_ap_aging_by_branch*`, async route => {
    const defaultRows = [
      { branch_code: 'KCH', bucket: 'current',    invoice_count: 4, total_outstanding: 120000, overdue_amount: 0 },
      { branch_code: 'BTU', bucket: '61_90_days', invoice_count: 2, total_outstanding: 30000,  overdue_amount: 30000 },
    ];
    await fulfillJson(route, apRows ?? defaultRows);
  });
}

test('Aging by Branch shows AR rows grouped by branch with totals', async ({ page }) => {
  await setupAgingMocks(page);

  await page.goto('/accounts/aging-by-branch', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /aging by branch/i })).toBeVisible({ timeout: 30_000 });
  // AR tab is default
  await expect(page.getByTestId('aging-row-ar-KCH')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('aging-row-ar-BTU')).toBeVisible({ timeout: 30_000 });
  // Grand total = 15000 + 8000 + 22000 = 45000
  await expect(page.getByTestId('aging-total-ar')).toHaveText('45,000.00');
});

test('Aging by Branch switches to AP tab and shows payable rows', async ({ page }) => {
  await setupAgingMocks(page);

  await page.goto('/accounts/aging-by-branch', { waitUntil: 'domcontentloaded' });

  await page.getByRole('tab', { name: /accounts payable/i }).click();

  await expect(page.getByTestId('aging-row-ap-KCH')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('aging-row-ap-BTU')).toBeVisible({ timeout: 30_000 });
  // Total = 120k + 30k = 150k
  await expect(page.getByTestId('aging-total-ap')).toHaveText('150,000.00');
});

test('Aging by Branch shows feature unavailable when flag is disabled', async ({ page }) => {
  await setupAgingMocks(page, { featureEnabled: false });

  await page.goto('/accounts/aging-by-branch', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /aging by branch unavailable/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/phase3b\.financial-reports-v2/i)).toBeVisible({ timeout: 30_000 });
});

test('Aging by Branch shows empty AR state when no receivables outstanding', async ({ page }) => {
  await setupAgingMocks(page, { arRows: [] });

  await page.goto('/accounts/aging-by-branch', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/no outstanding receivables/i)).toBeVisible({ timeout: 30_000 });
});
