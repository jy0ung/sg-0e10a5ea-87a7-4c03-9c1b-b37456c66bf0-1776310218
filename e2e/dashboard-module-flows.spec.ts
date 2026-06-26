import { expect, test, type Page, type Route } from '@playwright/test';
import { MOCK_PROFILE, setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function setupModuleSettingsMocks(page: Page) {
  const moduleSettings: Array<Record<string, unknown>> = [];
  let nextModuleSettingId = 1;

  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/module_settings*`, async route => {
    const method = route.request().method();

    if (method === 'GET') {
      await fulfillJson(route, moduleSettings);
      return;
    }

    if (method === 'POST') {
      const rawPayload = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown> | Record<string, unknown>[];
      const payload = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload;
      const updatedRow = {
        id: payload.id ?? `module-setting-${nextModuleSettingId++}`,
        company_id: payload.company_id ?? MOCK_PROFILE.company_id,
        module_id: payload.module_id,
        is_active: payload.is_active,
        updated_at: payload.updated_at,
        updated_by: payload.updated_by ?? null,
      };

      const existingIndex = moduleSettings.findIndex(setting => setting.module_id === updatedRow.module_id);
      if (existingIndex >= 0) {
        moduleSettings.splice(existingIndex, 1, updatedRow);
      } else {
        moduleSettings.push(updatedRow);
      }

      await fulfillJson(route, [updatedRow], 201);
      return;
    }

    await fulfillJson(route, {});
  });

  return { moduleSettings };
}

test('deactivated modules disappear from Home and guard direct routes', async ({ page }) => {
  const { moduleSettings } = await setupModuleSettingsMocks(page);

  await page.goto('/admin/settings');
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 10000 });

  await page.getByRole('tab', { name: 'Modules' }).click();
  await expect(page.getByRole('heading', { name: /module availability/i })).toBeVisible();

  const salesToggle = page.getByRole('switch', { name: 'Toggle Sales Intelligence' });
  await expect(salesToggle).toHaveAttribute('aria-checked', 'true');

  await salesToggle.click();
  await expect(page.getByText(/sales intelligence deactivated/i)).toBeVisible();
  await expect.poll(() => moduleSettings.find(setting => setting.module_id === 'sales')?.is_active).toBe(false);

  // Home no longer surfaces the deactivated module as an active card.
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: /sales overview/i })).toHaveCount(0);

  // Direct route is guarded with a "coming soon" surface that links back to Home.
  await page.goto('/sales');
  await expect(page.getByRole('heading', { name: /coming soon/i })).toBeVisible();
  await expect(page.getByText(/currently disabled for your company/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible();
});
