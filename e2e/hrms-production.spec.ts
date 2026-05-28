import { expect, test } from '@playwright/test';
import { setupAuthMocks } from './helpers/auth-mock';

const productionHrmsOrigin = process.env.E2E_EXPECTED_HRMS_APP_URL ?? 'https://hrms.protonfookloi.com';
const productionHrmsBase = new URL(productionHrmsOrigin).origin;

function expectedHrmsUrl(path: string, search = '', hash = '') {
  const url = new URL(productionHrmsOrigin);
  url.pathname = path;
  url.search = search;
  url.hash = hash;
  return url.toString();
}

test.describe('HRMS production deployment handoff', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
    await page.route(`${productionHrmsBase}/**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>FLC HRMS</title><main>Dedicated HRMS production app</main>',
      });
    });
  });

  test('home page launches the dedicated HRMS production origin', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /hrms/i })).toBeVisible({ timeout: 8000 });
    await Promise.all([
      page.waitForURL(expectedHrmsUrl('/'), { timeout: 10_000 }),
      page.getByRole('button', { name: /hrms/i }).click(),
    ]);
  });

  test('legacy main-app HRMS deep links map to dedicated HRMS routes', async ({ page }) => {
    await page.goto('/hrms/admin', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(expectedHrmsUrl('/settings'), { timeout: 10_000 });

    await page.goto('/hrms/leave-calendar?view=team#month', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(expectedHrmsUrl('/leave/calendar', '?view=team', '#month'), { timeout: 10_000 });
  });

  test('main app no longer renders embedded HRMS administration screens', async ({ page }) => {
    await page.goto('/hrms/employees', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(expectedHrmsUrl('/employees'), { timeout: 10_000 });
    await expect(page.getByText('Dedicated HRMS production app')).toBeVisible();
  });
});