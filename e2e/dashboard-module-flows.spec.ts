import { expect, test, type Page, type Route } from '@playwright/test';
import { MOCK_PROFILE, setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

function isoDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function chooseAdvancedScope(
  page: Page,
  options: {
    branchCode?: string;
    periodLabel?: string;
    modelLabel?: string;
  },
) {
  await page.getByRole('button', { name: /^Filter$/ }).click({ force: true });
  const scopeDialog = page.getByRole('dialog').filter({ hasText: 'Advanced Filter' });
  await expect(scopeDialog).toBeVisible();

  const comboboxes = scopeDialog.locator('button[role="combobox"]');
  if (options.branchCode) {
    await comboboxes.nth(0).click();
    await page.getByRole('option', { name: options.branchCode, exact: true }).click();
  }

  if (options.periodLabel) {
    await comboboxes.nth(1).click();
    await page.getByRole('option', { name: options.periodLabel, exact: true }).click();
  }

  if (options.modelLabel) {
    await comboboxes.nth(2).click();
    await page.getByRole('option', { name: options.modelLabel, exact: true }).click();
  }

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(scopeDialog).toBeHidden();
}

async function setupAppFlowMocks(page: Page) {
  const companyId = MOCK_PROFILE.company_id;
  const recentBookingDate = isoDaysAgo(2);
  const recentDeliveryDate = isoDaysAgo(1);
  const olderBookingDate = isoDaysAgo(20);
  const olderDeliveryDate = isoDaysAgo(19);
  const nowTimestamp = `${isoDaysAgo(0)}T08:00:00.000Z`;

  const moduleSettings: Array<Record<string, unknown>> = [];
  let nextModuleSettingId = 1;
  let dashboardPreference: Record<string, unknown> | null = {
    id: 'dashboard-pref-1',
    user_id: MOCK_PROFILE.id,
    selected_kpis: [
      'bg_to_delivery',
      'bg_to_shipment_etd',
      'etd_to_outlet',
      'outlet_to_reg',
      'reg_to_delivery',
      'bg_to_disb',
      'delivery_to_disb',
    ],
    show_advanced_kpis: true,
    personal_dashboard: {
      widgets: [
        { id: 'snapshot', type: 'section', enabled: true },
        { id: 'scorecards', type: 'section', enabled: true },
        {
          id: 'custom-slowest-delivery-branch',
          type: 'custom-metric',
          enabled: true,
          title: 'Slowest Delivery Branch',
          metricId: 'slowest_delivery_branch',
        },
        {
          id: 'custom-highest-booking-branch',
          type: 'custom-metric',
          enabled: true,
          title: 'Highest Booking Branch',
          metricId: 'highest_booking_branch',
        },
        { id: 'kpi-analytics', type: 'section', enabled: true },
        { id: 'branch-comparison', type: 'section', enabled: true },
      ],
    },
    created_at: nowTimestamp,
    updated_at: nowTimestamp,
  };

  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/module_settings*`, async route => {
    const method = route.request().method();

    if (method === 'GET') {
      await fulfillJson(route, moduleSettings);
      return;
    }


      await page.route(`${SUPABASE_URL}/rest/v1/dashboard_preferences*`, async route => {
        const method = route.request().method();

        if (method === 'GET') {
          await fulfillJson(route, dashboardPreference);
          return;
        }

        if (method === 'POST') {
          const rawPayload = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown> | Record<string, unknown>[];
          const payload = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload;
          const personalDashboard = typeof payload.personal_dashboard === 'string'
            ? JSON.parse(payload.personal_dashboard)
            : payload.personal_dashboard;

          dashboardPreference = {
            id: payload.id ?? 'dashboard-pref-1',
            user_id: payload.user_id ?? MOCK_PROFILE.id,
            selected_kpis: payload.selected_kpis ?? ['bg_to_delivery'],
            show_advanced_kpis: payload.show_advanced_kpis ?? true,
            personal_dashboard: personalDashboard ?? null,
            created_at: payload.created_at ?? nowTimestamp,
            updated_at: payload.updated_at ?? nowTimestamp,
          };

          await fulfillJson(route, dashboardPreference, 201);
          return;
        }

        await fulfillJson(route, {});
      });
    if (method === 'POST') {
      const rawPayload = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown> | Record<string, unknown>[];
      const payload = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload;
      const updatedRow = {
        id: payload.id ?? `module-setting-${nextModuleSettingId++}`,
        company_id: payload.company_id,
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

  await page.route(`${SUPABASE_URL}/rest/v1/vehicles*`, async route => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, [
      {
        id: 'vehicle-recent-kk',
        company_id: companyId,
        created_at: nowTimestamp,
        is_deleted: false,
        chassis_no: 'VEH-RECENT-KK',
        bg_date: recentBookingDate,
        delivery_date: recentDeliveryDate,
        branch_code: 'KK',
        model: 'Alpha',
        payment_method: 'Cash',
        salesman_name: 'Alex',
        customer_name: 'Alice Tan',
        bg_to_delivery: 5,
      },
      {
        id: 'vehicle-older-twu',
        company_id: companyId,
        created_at: `${olderBookingDate}T08:00:00.000Z`,
        is_deleted: false,
        chassis_no: 'VEH-OLDER-TWU',
        bg_date: olderBookingDate,
        delivery_date: olderDeliveryDate,
        branch_code: 'TWU',
        model: 'Beta',
        payment_method: 'Loan',
        salesman_name: 'Benny',
        customer_name: 'Brian Lee',
        bg_to_delivery: 12,
      },
    ]);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/import_batches*`, async route => {
    await fulfillJson(route, []);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/quality_issues*`, async route => {
    await fulfillJson(route, []);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/sla_policies*`, async route => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, [
      {
        id: 'sla-bg-to-delivery',
        company_id: companyId,
        kpi_id: 'bg_to_delivery',
        label: 'BG to Delivery',
        sla_days: 7,
      },
    ]);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/customers*`, async route => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, [
      {
        id: 'customer-kk',
        company_id: companyId,
        is_deleted: false,
        name: 'Alice Tan',
        created_at: `${recentBookingDate}T09:00:00.000Z`,
        updated_at: `${recentBookingDate}T09:00:00.000Z`,
      },
      {
        id: 'customer-twu',
        company_id: companyId,
        is_deleted: false,
        name: 'Brian Lee',
        created_at: `${olderBookingDate}T09:00:00.000Z`,
        updated_at: `${olderBookingDate}T09:00:00.000Z`,
      },
    ]);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/sales_orders*`, async route => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, [
      {
        id: 'sales-order-kk',
        company_id: companyId,
        is_deleted: false,
        order_no: 'SO-KK-001',
        customer_id: 'customer-kk',
        customer_name: 'Alice Tan',
        branch_code: 'KK',
        salesman_name: 'Alex',
        model: 'Alpha',
        booking_date: recentBookingDate,
        delivery_date: recentDeliveryDate,
        total_price: 120000,
        status: 'booked',
        created_at: `${recentBookingDate}T09:00:00.000Z`,
        updated_at: `${recentBookingDate}T09:00:00.000Z`,
      },
      {
        id: 'sales-order-twu',
        company_id: companyId,
        is_deleted: false,
        order_no: 'SO-TWU-001',
        customer_id: 'customer-twu',
        customer_name: 'Brian Lee',
        branch_code: 'TWU',
        salesman_name: 'Benny',
        model: 'Beta',
        booking_date: olderBookingDate,
        delivery_date: olderDeliveryDate,
        total_price: 99000,
        status: 'booked',
        created_at: `${olderBookingDate}T09:00:00.000Z`,
        updated_at: `${olderBookingDate}T09:00:00.000Z`,
      },
    ]);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/deal_stages*`, async route => {
    await fulfillJson(route, []);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/invoices*`, async route => {
    await fulfillJson(route, []);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/salesman_targets*`, async route => {
    await fulfillJson(route, []);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/branches*`, async route => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, [
      { id: 'branch-kk', company_id: companyId, code: 'KK', name: 'Kota Kinabalu' },
      { id: 'branch-twu', company_id: companyId, code: 'TWU', name: 'Tawau' },
    ]);
  });

  return { moduleSettings };
}

test('advanced dashboard filters unify scoping and persist across reloads', async ({ page }) => {
  await setupAppFlowMocks(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /my dashboard/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/^Filters$/)).toHaveCount(0);

  await chooseAdvancedScope(page, { modelLabel: 'Alpha' });

  await expect(page.getByText('All branches • All time • Alpha').first()).toBeVisible();

  const bookingsCard = page.getByText('Bookings').locator('xpath=ancestor::div[contains(@class, "glass-panel")][1]');
  const vehiclesInScopeCard = page.getByText('Vehicles in Scope').locator('xpath=ancestor::div[contains(@class, "glass-panel")][1]');

  await expect(bookingsCard).toContainText('1');
  await expect(vehiclesInScopeCard).toContainText('1');

  await page.reload();
  await expect(page.getByText('All branches • All time • Alpha').first()).toBeVisible();
  await expect(bookingsCard).toContainText('1');
  await expect(vehiclesInScopeCard).toContainText('1');

  await page.goto('/auto-aging');
  await expect(page.getByRole('heading', { name: /auto aging overview/i })).toBeVisible({ timeout: 10000 });

  await chooseAdvancedScope(page, { branchCode: 'TWU', modelLabel: 'Beta' });

  await expect(page.getByText('TWU • All time • Beta').first()).toBeVisible();
  await expect(page.getByText(/1 vehicles sampled/i)).toBeVisible();
});

test('personal dashboard insights can be added and persist across reloads', async ({ page }) => {
  await setupAppFlowMocks(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /my dashboard/i })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: /customize/i }).click();
  const settingsDialog = page.getByRole('dialog').filter({ hasText: 'Personal Dashboard Settings' });
  await expect(settingsDialog).toBeVisible();

  await settingsDialog.locator('#custom-insight-type').click();
  await page.getByRole('option', { name: 'Largest Booking Value Branch', exact: true }).click();
  await settingsDialog.getByLabel('Card title').fill('Value Hotspot');
  await Promise.all([
    page.waitForResponse(response => (
      response.url().includes('/rest/v1/dashboard_preferences')
      && response.request().method() === 'POST'
    )),
    settingsDialog.getByRole('button', { name: /add insight/i }).click(),
  ]);
  await settingsDialog.getByRole('button', { name: /close/i }).click();
  await expect(settingsDialog).toBeHidden();

  const valueHotspotCard = page.getByText('Value Hotspot').last().locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
  await expect(valueHotspotCard).toBeVisible();
  await expect(valueHotspotCard).toContainText('RM 120k');
  await expect(valueHotspotCard).toContainText('KK');

  await page.reload();

  const persistedValueHotspotCard = page.getByText('Value Hotspot').last().locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
  await expect(persistedValueHotspotCard).toBeVisible();
  await expect(persistedValueHotspotCard).toContainText('RM 120k');
  await expect(persistedValueHotspotCard).toContainText('KK');
});

test('deactivated modules move to coming soon and guard direct routes', async ({ page }) => {
  const { moduleSettings } = await setupAppFlowMocks(page);

  await page.goto('/admin/settings');
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 10000 });

  const salesToggle = page.getByLabel('Toggle Sales Intelligence');
  await expect(salesToggle).toHaveAttribute('aria-checked', 'true');

  await salesToggle.click();
  await expect(page.getByText(/sales intelligence deactivated/i)).toBeVisible();
  await expect.poll(() => moduleSettings.find(setting => setting.module_id === 'sales')?.is_active).toBe(false);

  await page.goto('/modules');
  const salesModuleCard = page.getByText('Sales Intelligence').locator('xpath=ancestor::div[contains(@class, "glass-panel")][1]');
  await expect(salesModuleCard).toContainText(/coming soon/i);
  await expect(page.getByRole('link', { name: /sales overview/i })).toHaveCount(0);

  await page.goto('/sales');
  await expect(page.getByRole('heading', { name: /coming soon/i })).toBeVisible();
  await expect(page.getByText(/currently disabled for your company/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /open module directory/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: /coming soon/i })).toBeVisible();
  await expect(page.getByText(/currently disabled for your company/i)).toBeVisible();
});
