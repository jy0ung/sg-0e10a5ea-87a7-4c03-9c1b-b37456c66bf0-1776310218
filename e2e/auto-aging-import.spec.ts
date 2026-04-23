import { expect, test, type Page, type Route } from '@playwright/test';
import * as XLSX from 'xlsx';
import { MOCK_PROFILE, setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

function workbookBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet([
    {
      'Chassis No.': 'PW-IMPORT-0001',
      'BG Date': '2026-01-01',
      'Shipment ETD PKG': '2026-01-05',
      'Date Received by Outlet': '2026-01-10',
      'Reg Date': '2026-01-15',
      'Delivery Date': '2026-01-20',
      'Disb. Date': '2026-01-25',
      BRCH: ' FLAGSHIP ',
      Model: 'Ativa',
      'Payment Method': '',
      'SA Name': '',
      'Cust Name': '',
      Remark: 'First duplicate row',
    },
    {
      'Chassis No.': 'PW-IMPORT-0001',
      'BG Date': '2026-01-01',
      'Shipment ETD PKG': '2026-01-05',
      'Date Received by Outlet': '2026-01-10',
      'Reg Date': '2026-01-15',
      'Delivery Date': '2026-01-20',
      'Disb. Date': '2026-01-25',
      BRCH: ' FLAGSHIP ',
      Model: 'Ativa AV',
      'Payment Method': '',
      'SA Name': '',
      'Cust Name': '',
      Remark: 'Second duplicate row with more complete model',
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Combine Data');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function wantsSingleObject(route: Route): boolean {
  const accept = route.request().headers().accept ?? '';
  return accept.includes('application/vnd.pgrst.object+json');
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function setupAutoAgingImportMocks(page: Page) {
  const batchId = '11111111-1111-1111-1111-111111111111';
  const vehicleWrites: Array<Record<string, unknown>[]> = [];
  const dialogs: string[] = [];

  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/companies*`, async route => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, {});
      return;
    }

    const company = {
      id: MOCK_PROFILE.company_id,
      name: 'Playwright Test Company',
      code: 'PW',
    };
    await fulfillJson(route, wantsSingleObject(route) ? company : [company]);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/branches*`, async route => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, [{ id: 'branch-kk', code: 'KK', company_id: MOCK_PROFILE.company_id }]);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/branch_mappings*`, async route => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, [
      {
        id: 'mapping-flagship',
        raw_value: 'FLAGSHIP',
        canonical_code: 'KK',
        notes: null,
        company_id: MOCK_PROFILE.company_id,
      },
    ]);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/payment_method_mappings*`, async route => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, []);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/import_batches*`, async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if (method === 'POST') {
      const payload = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      await fulfillJson(route, {
        id: batchId,
        file_name: payload.file_name,
        uploaded_by: payload.uploaded_by,
        uploaded_at: payload.uploaded_at,
        status: payload.status,
        total_rows: payload.total_rows,
        valid_rows: payload.valid_rows,
        error_rows: payload.error_rows,
        duplicate_rows: payload.duplicate_rows,
        company_id: payload.company_id,
      }, 201);
      return;
    }

    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/vehicles*`, async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await fulfillJson(route, wantsSingleObject(route) ? null : []);
      return;
    }

    if (method === 'POST') {
      const payload = JSON.parse(route.request().postData() ?? '[]') as Record<string, unknown>[];
      vehicleWrites.push(payload);
      await fulfillJson(route, [], 201);
      return;
    }

    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/quality_issues*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    await fulfillJson(route, {}, 201);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/sla_policies*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    await fulfillJson(route, {});
  });

  return { dialogs, vehicleWrites };
}

test('Auto-aging import smoke test uploads and publishes canonical data', async ({ page }) => {
  const { dialogs, vehicleWrites } = await setupAutoAgingImportMocks(page);

  await page.goto('/auto-aging/import');
  await expect(page.getByText(/import center/i)).toBeVisible({ timeout: 10000 });

  await page.locator('input[type="file"]').setInputFiles({
    name: 'Combined.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbookBuffer(),
  });

  await expect(page.getByText('Combined.xlsx', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/2 rows parsed/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/unknown branch codes/i)).toHaveCount(0);
  await expect(page.getByText(/missing data — will be published as incomplete/i)).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: /publish/i }).click();

  await expect(page.getByText(/import published successfully/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/published as incomplete/i)).toBeVisible({ timeout: 10000 });
  expect(dialogs).toEqual([]);

  await expect.poll(() => vehicleWrites.length).toBeGreaterThan(0);

  const canonicalWrite = vehicleWrites.find(payload =>
    payload.length === 1 && payload[0]?.chassis_no === 'PW-IMPORT-0001'
  );

  expect(canonicalWrite).toBeDefined();
  expect(canonicalWrite?.[0]).toMatchObject({
    chassis_no: 'PW-IMPORT-0001',
    branch_code: 'KK',
    salesman_name: 'Pending',
    customer_name: 'Pending',
  });
});

test('Auto-aging import touch regression opens native chooser in tablet desktop-site layout and publishes canonical data', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: false,
  });

  const page = await context.newPage();

  try {
    const { dialogs, vehicleWrites } = await setupAutoAgingImportMocks(page);

    await page.goto('/auto-aging/import');
    await expect(page.getByText(/import center/i)).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('#import-file-input');
    const inputBox = await fileInput.boundingBox();
    expect(inputBox).not.toBeNull();

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.touchscreen.tap(
        inputBox!.x + inputBox!.width / 2,
        inputBox!.y + inputBox!.height / 2,
      ),
    ]);

    await fileChooser.setFiles({
      name: 'Combined-Android-Tablet.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: workbookBuffer(),
    });

    await expect(page.getByText(/reading file/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Combined-Android-Tablet.xlsx', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/2 rows parsed/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/missing data — will be published as incomplete/i)).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /publish/i }).click();

    await expect(page.getByText(/import published successfully/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/published as incomplete/i)).toBeVisible({ timeout: 10000 });
    expect(dialogs).toEqual([]);

    await expect.poll(() => vehicleWrites.length).toBeGreaterThan(0);

    const canonicalWrite = vehicleWrites.find(payload =>
      payload.length === 1 && payload[0]?.chassis_no === 'PW-IMPORT-0001'
    );

    expect(canonicalWrite).toBeDefined();
    expect(canonicalWrite?.[0]).toMatchObject({
      chassis_no: 'PW-IMPORT-0001',
      branch_code: 'KK',
      salesman_name: 'Pending',
      customer_name: 'Pending',
    });
  } finally {
    await context.close();
  }
});