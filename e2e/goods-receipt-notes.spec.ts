import { expect, test, type Page, type Route } from '@playwright/test';
import { MOCK_PROFILE, setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

test.describe.configure({ timeout: 90_000 });

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

const PO_ID  = '66666666-6666-6666-6666-666666666666';
const GRN_ID = '77777777-7777-7777-7777-777777777777';

async function setupGrnMocks(page: Page, opts: {
  featureEnabled?: boolean;
  grnList?: unknown[];
  grnDetail?: Record<string, unknown> | null;
  grnLines?: unknown[];
  receipts?: unknown[];
} = {}) {
  const { featureEnabled = true, grnList, grnDetail, grnLines, receipts } = opts;
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'flag-3e', company_id: null, code: 'phase3e.po-grn-v2',
          enabled: featureEnabled, rollout_pct: featureEnabled ? 100 : 0,
          description: null, created_at: '2026-05-25T00:00:00Z', updated_at: '2026-05-25T00:00:00Z',
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/purchase_orders*`, async route => {
    const url = route.request().url();
    if (route.request().method() === 'GET') {
      const po = {
        id: PO_ID, company_id: MOCK_PROFILE.company_id, po_no: 'PO-2026-100',
        supplier: 'Proton', order_date: '2026-05-20', expected_delivery_date: '2026-06-01',
        lifecycle_status: 'approved', total_amount: 200000, notes: null,
        created_by: 'user-1', approved_by: 'user-2', approved_at: '2026-05-21T10:00:00Z',
        created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-21T10:00:00Z',
      };
      if (url.includes('id=eq.')) {
        await fulfillJson(route, [po]);
        return;
      }
      await fulfillJson(route, [po]);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/purchase_order_lines*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, []);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/goods_receipt_notes*`, async route => {
    const url = route.request().url();
    if (route.request().method() === 'GET') {
      const defaultList = [
        {
          id: GRN_ID, company_id: MOCK_PROFILE.company_id, grn_no: 'GRN-2026-001',
          purchase_order_id: PO_ID, received_date: '2026-05-24',
          supplier_dn_no: 'DN-9001', notes: 'partial first',
          received_by: 'user-1',
          created_at: '2026-05-24T08:00:00Z', updated_at: '2026-05-24T08:00:00Z',
        },
      ];
      const list = grnList ?? defaultList;
      if (url.includes('id=eq.')) {
        const detail = grnDetail === undefined ? list[0] : grnDetail;
        await fulfillJson(route, detail ? [detail] : []);
        return;
      }
      await fulfillJson(route, list);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/grn_lines*`, async route => {
    if (route.request().method() === 'GET') {
      const defaultLines = [
        {
          id: 'gl-1', company_id: MOCK_PROFILE.company_id, goods_receipt_note_id: GRN_ID,
          purchase_order_line_id: 'pol-1', received_quantity: 1, line_notes: 'good',
          created_at: '2026-05-24T08:00:00Z',
        },
      ];
      await fulfillJson(route, grnLines ?? defaultLines);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_po_line_receipts*`, async route => {
    const defaultReceipts = [
      { purchase_order_line_id: 'pol-1', line_no: 1, chassis_no: 'CHASS-001',
        model: 'Hilux', variant: '2.4L', ordered_quantity: 2, received_quantity: 0, remaining_quantity: 2 },
      { purchase_order_line_id: 'pol-2', line_no: 2, chassis_no: 'CHASS-002',
        model: 'Vios', variant: null, ordered_quantity: 1, received_quantity: 1, remaining_quantity: 0 },
    ];
    await fulfillJson(route, receipts ?? defaultReceipts);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/create_grn*`, async route => {
    await fulfillJson(route, GRN_ID);
  });
}

test('GRN list renders existing receipts', async ({ page }) => {
  await setupGrnMocks(page);

  await page.goto('/purchasing/grn', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /goods receipt notes/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`grn-row-${GRN_ID}`)).toBeVisible();
  await expect(page.getByTestId(`grn-row-${GRN_ID}`)).toContainText('GRN-2026-001');
  await expect(page.getByTestId(`grn-row-${GRN_ID}`)).toContainText('DN-9001');
});

test('GRN detail page shows line count and links back to PO', async ({ page }) => {
  await setupGrnMocks(page);

  await page.goto(`/purchasing/grn/${GRN_ID}`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /GRN GRN-2026-001/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('grn-line-count')).toHaveText('1');
  await expect(page.getByTestId('grn-open-po')).toBeVisible();
});

test('GRN new form lists ordered / received / remaining and posts create_grn', async ({ page }) => {
  let postCalled = false;
  await setupGrnMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/create_grn*`, async route => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    postCalled = true;
    expect(body.p_grn_no).toBe('GRN-NEW-001');
    expect(body.p_po_id).toBe(PO_ID);
    const lines = body.p_lines as Array<{ purchase_order_line_id: string; received_quantity: number }>;
    expect(lines).toHaveLength(1);
    expect(lines[0].purchase_order_line_id).toBe('pol-1');
    expect(lines[0].received_quantity).toBe(2);
    await fulfillJson(route, GRN_ID);
  });

  await page.goto(`/purchasing/grn/new?poId=${PO_ID}`, { waitUntil: 'domcontentloaded' });

  await page.getByTestId('grn-no-input').fill('GRN-NEW-001');
  // Line 1: receive 2 of 2 remaining
  await page.getByTestId('receive-qty-1').fill('2');
  // Line 2 is fully received already so input is disabled (remaining=0)

  await expect(page.getByTestId('total-receiving')).toHaveText('2');

  await page.getByTestId('save-grn-button').click();
  await expect(page.getByText(/grn created/i)).toBeVisible({ timeout: 30_000 });
  expect(postCalled).toBe(true);
});

test('GRN list shows empty state when no GRNs exist', async ({ page }) => {
  await setupGrnMocks(page, { grnList: [] });

  await page.goto('/purchasing/grn', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/no goods receipt notes yet/i)).toBeVisible({ timeout: 30_000 });
});

test('GRN feature unavailable when flag disabled', async ({ page }) => {
  await setupGrnMocks(page, { featureEnabled: false });

  await page.goto('/purchasing/grn', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /goods receipt notes unavailable/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/phase3e\.po-grn-v2/i)).toBeVisible({ timeout: 30_000 });
});
