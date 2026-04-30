import { expect, test, type Page, type Route } from '@playwright/test';
import ExcelJS from 'exceljs';
import { MOCK_PROFILE, setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

test.describe.configure({ timeout: 90_000 });

const replacementHeaders = [
  'NO',
  'BRCH K1',
  'VAA\nDATE',
  'MODEL',
  'VAR',
  'COLOR',
  'CHASSIS NO.',
  'DTP\n(Dealer Transfer Price)',
  'PAYMENT\nMETHOD',
  'BG\nDATE',
  'FULL PAYMENT TYPE',
  'FULL PAYMENT DATE',
  'SHIPMENT\nNAME',
  'SHIPMENT\nETD PKG',
  'DATE SHIPMENT\nETA KK/TWU/SDK',
  'RECEIVED BY OUTLET',
  'AGING',
  'Aging PYT as at Today',
  'SA\nNAME',
  'CUST\nNAME',
  'PENDING LOAN',
  'LOU',
  'CONTRA\nSOLA',
  'REG\nNO',
  'REG\nDATE',
  'INV No.',
  'OBR',
  'DELIVERY\nDATE',
  'INVOICE DATE',
  'DISB.\nDATE',
  'AGING REG-DELIVER',
  'AGING DELIVER-DISB',
  'REMARK',
  'COMM PAYOUT',
];

const replacementOwnerRow = replacementHeaders.map(() => '');
replacementOwnerRow[1] = '(STOCK IN MS LEONG)';
replacementOwnerRow[8] = '(DEPOSIT PAYMENT) SHENNY';
replacementOwnerRow[10] = '(FULL PAYMENT) SHENNY';
replacementOwnerRow[12] = '(OUTLET ADMIN) ANN';
replacementOwnerRow[18] = '(SALES MANAGER) UMAR & ROSALIE';
replacementOwnerRow[23] = '(OUTLET ADMIN) VEE';

function addReplacementSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: Array<Record<string, unknown>>,
  sectionLabel?: string,
) {
  const worksheet = workbook.addWorksheet(name);
  worksheet.addRow(replacementOwnerRow);
  worksheet.addRow(replacementHeaders);
  if (sectionLabel) {
    worksheet.addRow([sectionLabel]);
  }

  rows.forEach((row, index) => {
    worksheet.addRow([
      row['NO'] ?? index + 1,
      row['BRCH K1'] ?? '',
      row['VAA DATE'] ?? '',
      row['MODEL'] ?? '',
      row['VAR'] ?? '',
      row['COLOR'] ?? '',
      row['CHASSIS NO.'] ?? '',
      row['DTP'] ?? '',
      row['PAYMENT METHOD'] ?? '',
      row['BG DATE'] ?? '',
      row['FULL PAYMENT TYPE'] ?? '',
      row['FULL PAYMENT DATE'] ?? '',
      row['SHIPMENT NAME'] ?? '',
      row['SHIPMENT ETD PKG'] ?? '',
      row['DATE SHIPMENT ETA KK/TWU/SDK'] ?? '',
      row['RECEIVED BY OUTLET'] ?? '',
      row['AGING'] ?? '',
      row['Aging PYT as at Today'] ?? '',
      row['SA NAME'] ?? '',
      row['CUST NAME'] ?? '',
      row['PENDING LOAN'] ?? '',
      row['LOU'] ?? '',
      row['CONTRA SOLA'] ?? '',
      row['REG NO'] ?? '',
      row['REG DATE'] ?? '',
      row['INV NO'] ?? '',
      row['OBR'] ?? '',
      row['DELIVERY DATE'] ?? '',
      row['INVOICE DATE'] ?? '',
      row['DISB DATE'] ?? '',
      row['AGING REG-DELIVER'] ?? '',
      row['AGING DELIVER-DISB'] ?? '',
      row['REMARK'] ?? '',
      row['COMM PAYOUT'] ?? '',
    ]);
  });
}

async function workbookBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  addReplacementSheet(workbook, 'Pending Deliver & Loan Disburse', [
    {
      'BRCH K1': ' FLAGSHIP ',
      'VAA DATE': '2026-01-01',
      'MODEL': 'Ativa',
      'VAR': 'Ativa 1.0 Turbo',
      'COLOR': 'Solid White',
      'CHASSIS NO.': 'PW-IMPORT-0001',
      'DTP': 45308,
      'PAYMENT METHOD': 'PAS (BG)',
      'BG DATE': '2026-01-01',
      'FULL PAYMENT TYPE': 'FULL PAYMENT MBB FS',
      'FULL PAYMENT DATE': '2026-01-02',
      'SHIPMENT NAME': 'MTT BINTANGOR 26BG036E',
      'SHIPMENT ETD PKG': '2026-01-05',
      'DATE SHIPMENT ETA KK/TWU/SDK': '2026-01-10',
      'RECEIVED BY OUTLET': '2026-01-15',
      'REMARK': 'First duplicate row',
      'COMM PAYOUT': 'Comm not paid',
    },
  ]);

  addReplacementSheet(workbook, 'Pending Register & Free Stock', [
    {
      'BRCH K1': ' FLAGSHIP ',
      'VAA DATE': '2026-01-01',
      'MODEL': 'Ativa AV',
      'VAR': 'Ativa 1.0 Turbo AV',
      'COLOR': 'Solid White',
      'CHASSIS NO.': 'PW-IMPORT-0001',
      'DTP': 45308,
      'PAYMENT METHOD': 'TT',
      'BG DATE': '2026-01-01',
      'FULL PAYMENT TYPE': 'FULL PAYMENT TT',
      'FULL PAYMENT DATE': '2026-01-03',
      'SHIPMENT NAME': 'MTT BINTANGOR 26BG036E',
      'SHIPMENT ETD PKG': '2026-01-05',
      'DATE SHIPMENT ETA KK/TWU/SDK': '2026-01-10',
      'RECEIVED BY OUTLET': '2026-01-15',
      'REMARK': 'Second duplicate row with more complete model',
      'COMM PAYOUT': 'Paid 15/04',
    },
  ], 'PENDING REGISTER & FREE STOCK');

  const misc = workbook.addWorksheet('MISC');
  misc.addRow(['', 'BRANCH', '', 'BANK', '', '', 'MODEL', 'VARIANTS']);
  misc.addRow([1, 'FLAGSHIP', 1, 'AFFIN', 'AFFIN BANK', 1, 'ATIVA', 'ATIVA 1.0 TURBO']);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
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

async function gotoImportCenter(page: Page) {
  await page.goto('/auto-aging/import', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('button', { name: /choose consolidated inventory workbook to import/i }),
  ).toBeVisible({ timeout: 30_000 });
}

test('Auto-aging import smoke test uploads and publishes canonical data', async ({ page }) => {
  const { dialogs, vehicleWrites } = await setupAutoAgingImportMocks(page);

  await gotoImportCenter(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'Inventory Report - Consolidate.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await workbookBuffer(),
  });

  await expect(page.getByText('Inventory Report - Consolidate.xlsx', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/2 rows parsed/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/unknown branch codes/i)).toHaveCount(0);
  await expect(page.getByText(/missing data — will be published as incomplete/i)).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /publish/i }).click();

  await expect(page.getByText(/import published successfully/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/published as incomplete/i)).toBeVisible({ timeout: 30_000 });
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

    await gotoImportCenter(page);

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
      name: 'Inventory Report - Consolidate-Tablet.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await workbookBuffer(),
    });

    await expect(page.getByText(/reading file/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Inventory Report - Consolidate-Tablet.xlsx', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/2 rows parsed/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/missing data — will be published as incomplete/i)).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /publish/i }).click();

    await expect(page.getByText(/import published successfully/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/published as incomplete/i)).toBeVisible({ timeout: 30_000 });
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