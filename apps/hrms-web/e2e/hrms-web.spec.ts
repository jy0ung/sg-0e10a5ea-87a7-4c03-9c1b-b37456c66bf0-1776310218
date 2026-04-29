import { test, expect, type Page } from '@playwright/test';
import { MOCK_PROFILE, SUPABASE_URL, setupAuthMocks } from '../../../e2e/helpers/auth-mock';

async function setupAnonymousMocks(page: Page) {
  await page.route(`${SUPABASE_URL}/auth/v1/token*`, (route) => {
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'No session' }) });
  });
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (route) => {
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'JWT missing' }) });
  });
  await page.route(`${SUPABASE_URL}/realtime/**`, (route) => route.abort());
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function setupDedicatedHrmsMocks(page: Page, options: { hrmsModuleActive?: boolean } = {}) {
  await setupAuthMocks(page);
  const hrmsModuleActive = options.hrmsModuleActive ?? true;

  await page.route(`${SUPABASE_URL}/rest/v1/module_settings*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'module-setting-hrms',
          company_id: MOCK_PROFILE.company_id,
          module_id: 'hrms',
          is_active: hrmsModuleActive,
          updated_at: '2026-04-28T00:00:00.000Z',
          updated_by: MOCK_PROFILE.id,
        },
      ]),
    });
  });
}

async function assertDedicatedHrmsShell(page: Page) {
  await expect(page.locator('text=Route Error')).toHaveCount(0);
  await expect(page.locator('aside').first()).toBeVisible();
  await expect(page.getByText('FLC HRMS').first()).toBeVisible();
  await expect(page.getByText('HRMS-only access')).toBeVisible();
  expect(page.url()).not.toMatch(/\/login$/);
}

test.describe('HRMS web dedicated app', () => {
  test('redirects anonymous protected routes to the HRMS login page', async ({ page }) => {
    await setupAnonymousMocks(page);

    await page.goto('/leave', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'FLC HRMS' })).toBeVisible();
  });

  test('blocks authenticated users when the HRMS module is disabled for their company', async ({ page }) => {
    await setupDedicatedHrmsMocks(page, { hrmsModuleActive: false });

    await page.goto('/leave', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/leave$/);
    await expect(page.getByRole('heading', { name: 'HRMS is unavailable' })).toBeVisible();
    await expect(page.getByText('HRMS access is disabled for your company.')).toBeVisible();
  });

  test('loads the protected HRMS workspace shell with mocked auth', async ({ page }) => {
    await setupDedicatedHrmsMocks(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/leave$/);
    await assertDedicatedHrmsShell(page);
    await expect(page.getByRole('link', { name: 'Leave', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Approvals' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('loads priority HRMS pages in the dedicated app', async ({ page }) => {
    await setupDedicatedHrmsMocks(page);

    const routes = [
      { path: '/leave', text: /leave/i },
      { path: '/attendance', text: /attendance/i },
      { path: '/approvals', text: /approval/i },
      { path: '/appraisals', text: /appraisal/i },
      { path: '/announcements', text: /announcements/i },
      { path: '/profile', text: /profile|account/i },
    ];

    for (const route of routes) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await assertDedicatedHrmsShell(page);
      await expect(page.locator('main').getByText(route.text).first()).toBeVisible();
    }
  });

  test('maps legacy nested HRMS paths to dedicated-app paths', async ({ page }) => {
    await setupDedicatedHrmsMocks(page);

    await page.goto('/hrms/leave', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/leave$/);
    await assertDedicatedHrmsShell(page);
  });

  test('maps mounted legacy aliases to dedicated-app paths', async ({ page }) => {
    await setupDedicatedHrmsMocks(page);

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/settings$/);
    await assertDedicatedHrmsShell(page);

    await page.goto('/leave-calendar?view=team#month', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/leave\/calendar\?view=team#month$/);
    await assertDedicatedHrmsShell(page);
  });
});