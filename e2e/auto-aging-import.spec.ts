import { expect, test, type Page, type Route } from '@playwright/test';
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

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function replacementCsv(): string {
  const rows: unknown[][] = [
    replacementOwnerRow,
    replacementHeaders,
    [
      1, ' FLAGSHIP ', '2026-01-01', 'Ativa', 'Ativa 1.0 Turbo', 'Solid White',
      'PW-IMPORT-0001', 45308, 'PAS (BG)', '2026-01-01', 'FULL PAYMENT MBB FS',
      '2026-01-02', 'MTT BINTANGOR 26BG036E', '2026-01-05', '2026-01-10',
      '2026-01-15', '', '', 'ALEX TAN', 'LEE MEI', '', '', '', '', '', '', '', '',
      '', '', '', '', 'Clean row', 'Comm not paid',
    ],
    [
      2, ' FLAGSHIP ', '2026-01-01', 'Ativa AV', 'Ativa 1.0 Turbo AV', 'Solid White',
      'PW-IMPORT-0002', 45308, 'TT', '2026-01-01', 'FULL PAYMENT TT',
      '2026-01-03', 'MTT BINTANGOR 26BG036E', '2026-01-05', '2026-01-10',
      '2026-01-15', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', 'Incomplete row queued for review', 'Paid 15/04',
    ],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\n');
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

async function fulfillCsv(route: Route, body: string) {
  await route.fulfill({
    status: 200,
    contentType: 'text/csv',
    headers: { 'access-control-allow-origin': '*' },
    body,
  });
}

async function setupAutoAgingImportMocks(page: Page) {
  const batchId = '11111111-1111-1111-1111-111111111111';
  const vehicleWrites: Array<Record<string, unknown>[]> = [];
  const reviewWrites: Array<Record<string, unknown>[]> = [];
  const dialogs: string[] = [];

  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await setupAuthMocks(page);

  await page.route('**/spreadsheets/d/playwright-inventory/export**', async route => {
    await fulfillCsv(route, replacementCsv());
  });

  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, [
      {
        id: 'flag-import-review',
        code: 'phase3a.import-review-v2',
        enabled: true,
        rollout_pct: 100,
        description: null,
        company_id: null,
        updated_by: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
  });

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

  await page.route(`${SUPABASE_URL}/rest/v1/import_review_rows*`, async route => {
    if (route.request().method() === 'POST') {
      const payload = JSON.parse(route.request().postData() ?? '[]') as Record<string, unknown>[];
      reviewWrites.push(payload);
      await fulfillJson(route, [], 201);
      return;
    }

    await fulfillJson(route, []);
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

  return { dialogs, reviewWrites, vehicleWrites };
}

async function gotoImportCenter(page: Page) {
  await page.goto('/auto-aging/import', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel(/import from google sheet/i)).toBeVisible({ timeout: 30_000 });
}

async function importGoogleSheet(page: Page) {
  await page
    .getByLabel(/import from google sheet/i)
    .fill('https://docs.google.com/spreadsheets/d/playwright-inventory/edit#gid=0');
  await page.getByRole('button', { name: /import from google sheet/i }).click();
}

test('Auto-aging import smoke test imports Google Sheet data and publishes canonical data', async ({ page }) => {
  const { dialogs, reviewWrites, vehicleWrites } = await setupAutoAgingImportMocks(page);

  await gotoImportCenter(page);
  await importGoogleSheet(page);

  await expect(page.getByText('google-sheet-playwright-inventory', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/2 rows parsed/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/unknown branch codes/i)).toHaveCount(0);
  await expect(page.getByText(/1 record missing data — will be queued for review/i)).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /publish clean rows \(1 row queued for review\)/i }).click();

  await expect(page.getByText(/import processed successfully/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/1 record was queued for review/i)).toBeVisible({ timeout: 30_000 });
  expect(dialogs).toEqual([]);

  await expect.poll(() => vehicleWrites.length).toBeGreaterThan(0);
  await expect.poll(() => reviewWrites.length).toBeGreaterThan(0);

  const canonicalWrite = vehicleWrites.find(payload =>
    payload.length === 1 && payload[0]?.chassis_no === 'PW-IMPORT-0001'
  );
  const reviewWrite = reviewWrites.find(payload =>
    payload.length === 1 && payload[0]?.chassis_no === 'PW-IMPORT-0002'
  );

  expect(canonicalWrite).toBeDefined();
  expect(canonicalWrite?.[0]).toMatchObject({
    chassis_no: 'PW-IMPORT-0001',
    branch_code: 'KK',
    salesman_name: 'ALEX TAN',
    customer_name: 'LEE MEI',
  });
  expect(reviewWrite?.[0]).toMatchObject({
    chassis_no: 'PW-IMPORT-0002',
    review_reason: 'incomplete',
  });
});

test('Auto-aging import touch regression imports Google Sheet data in tablet desktop-site layout', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: false,
  });

  const page = await context.newPage();

  try {
    const { dialogs, reviewWrites, vehicleWrites } = await setupAutoAgingImportMocks(page);

    await gotoImportCenter(page);
    await importGoogleSheet(page);

    await expect(page.getByText('google-sheet-playwright-inventory', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/2 rows parsed/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/1 record missing data — will be queued for review/i)).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /publish clean rows \(1 row queued for review\)/i }).click();

    await expect(page.getByText(/import processed successfully/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/1 record was queued for review/i)).toBeVisible({ timeout: 30_000 });
    expect(dialogs).toEqual([]);

    await expect.poll(() => vehicleWrites.length).toBeGreaterThan(0);
    await expect.poll(() => reviewWrites.length).toBeGreaterThan(0);

    const canonicalWrite = vehicleWrites.find(payload =>
      payload.length === 1 && payload[0]?.chassis_no === 'PW-IMPORT-0001'
    );
    const reviewWrite = reviewWrites.find(payload =>
      payload.length === 1 && payload[0]?.chassis_no === 'PW-IMPORT-0002'
    );

    expect(canonicalWrite).toBeDefined();
    expect(canonicalWrite?.[0]).toMatchObject({
      chassis_no: 'PW-IMPORT-0001',
      branch_code: 'KK',
      salesman_name: 'ALEX TAN',
      customer_name: 'LEE MEI',
    });
    expect(reviewWrite?.[0]).toMatchObject({
      chassis_no: 'PW-IMPORT-0002',
      review_reason: 'incomplete',
    });
  } finally {
    await context.close();
  }
});
