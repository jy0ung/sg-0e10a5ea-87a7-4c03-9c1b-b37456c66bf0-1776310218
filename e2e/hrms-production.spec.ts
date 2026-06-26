import { expect, test } from '@playwright/test';
import { setupAuthMocks } from './helpers/auth-mock';

const externalHrmsAppUrl = process.env.E2E_EXPECTED_HRMS_APP_URL?.trim();
const expectsExternalHrms = Boolean(externalHrmsAppUrl);
const externalHrmsBase = externalHrmsAppUrl ? new URL(externalHrmsAppUrl).origin : null;
const localAppBase = process.env.BASE_URL ?? 'http://127.0.0.1:3001';

function expectedHrmsUrl(path: string, search = '', hash = ''): string {
  if (!externalHrmsAppUrl) {
    const url = new URL(localAppBase);
    url.pathname = `/hrms${path === '/' ? '/' : path.replace(/\/$/, '')}`;
    url.search = search;
    url.hash = hash;
    return url.toString();
  }

  const url = new URL(externalHrmsAppUrl);
  url.pathname = path;
  url.search = search;
  url.hash = hash;
  return url.toString();
}

test.describe('HRMS production deployment handoff', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page);
    if (externalHrmsBase) {
      await page.route(`${externalHrmsBase}/**`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><title>FLC HRMS</title><main>Dedicated HRMS production app</main>',
        });
      });
    }
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
    if (expectsExternalHrms) {
      await expect(page.getByText('Dedicated HRMS production app')).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'Opening HRMS Workspace' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open HRMS', exact: true })).toHaveAttribute('href', '/hrms/employees');
    }
  });
});
