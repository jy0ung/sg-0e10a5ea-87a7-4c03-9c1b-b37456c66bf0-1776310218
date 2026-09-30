import { expect, test, type Page } from '@playwright/test';
import { MOCK_PROFILE, setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

test.describe.configure({ timeout: 90_000 });

const periodId = '44444444-4444-4444-4444-444444444445';
const period = {
  id: periodId,
  company_id: MOCK_PROFILE.company_id,
  name: 'May 2026',
  period_year: 2026,
  period_month: 5,
  start_date: '2026-05-01',
  end_date: '2026-05-31',
  status: 'open',
  closed_at: null as string | null,
  closed_by: null as string | null,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

async function setup(page: Page, closeError?: string) {
  await setupAuthMocks(page);
  let current = { ...period };
  await page.route(`${SUPABASE_URL}/rest/v1/accounting_periods*`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([current]),
  }));
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/close_accounting_period*`, route => {
    if (closeError) {
      return route.fulfill({
        status: 409, contentType: 'application/json',
        body: JSON.stringify({ code: 'P0001', message: closeError }),
      });
    }
    current = { ...current, status: 'closed', closed_at: '2026-06-01T00:00:00Z', closed_by: MOCK_PROFILE.id };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) });
  });
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/lock_accounting_period*`, route => {
    current = { ...current, status: 'locked' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) });
  });
}

test('Accounting Periods shows a server readiness rejection and keeps Close available', async ({ page }) => {
  await setup(page, 'Accounting period has unposted payments (AR: 1, AP: 0)');
  await page.goto('/accounts/periods', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Accounting Periods' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText(/system will revalidate payment posting and journal balance/i)).toBeVisible();
  await page.getByRole('button', { name: 'Close Period' }).click();
  await expect(page.getByText('Failed to close period')).toBeVisible();
  await expect(page.getByText(/unposted payments \(AR: 1, AP: 0\)/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await expect(page.getByText('Period closed', { exact: true })).toHaveCount(0);
});

test('Accounting Periods uses server close and lock commands on success', async ({ page }) => {
  await setup(page);
  await page.goto('/accounts/periods', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Accounting Periods' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Close Period' }).click();
  await expect(page.getByText('Period closed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lock', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await page.getByRole('button', { name: 'Lock Period' }).click();
  await expect(page.getByText('Period locked', { exact: true })).toBeVisible();
});
