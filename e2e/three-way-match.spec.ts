import { expect, test, type Page, type Route } from '@playwright/test';
import { setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

test.describe.configure({ timeout: 90_000 });

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function setupMatchMocks(page: Page, opts: {
  featureEnabled?: boolean;
  counts?: unknown[];
  queue?: unknown[];
} = {}) {
  const { featureEnabled = true, counts, queue } = opts;
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

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_three_way_match_status_counts*`, async route => {
    const defaultCounts = [
      { match_status: 'amount_variance', total: 2 },
      { match_status: 'pending_receipt', total: 5 },
      { match_status: 'unmatched',       total: 1 },
      { match_status: 'matched',         total: 42 },
    ];
    await fulfillJson(route, counts ?? defaultCounts);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_three_way_match_queue*`, async route => {
    const defaultQueue = [
      {
        purchase_invoice_id: 'pi-1', invoice_no: 'PI-2026-001', supplier: 'Proton',
        chassis_no: 'CHASS-001', pi_amount: 99000, invoice_date: '2026-05-22',
        po_no: 'PO-2026-100', po_line_no: 1, ordered_quantity: 1, expected_amount: 100000,
        received_quantity: 1, amount_variance: 1000, match_status: 'amount_variance',
      },
      {
        purchase_invoice_id: 'pi-2', invoice_no: 'PI-2026-002', supplier: 'Toyota',
        chassis_no: 'CHASS-005', pi_amount: 80000, invoice_date: '2026-05-23',
        po_no: 'PO-2026-101', po_line_no: 1, ordered_quantity: 2, expected_amount: 160000,
        received_quantity: 1, amount_variance: 80000, match_status: 'pending_receipt',
      },
      {
        purchase_invoice_id: 'pi-3', invoice_no: 'PI-2026-003', supplier: 'Honda',
        chassis_no: null, pi_amount: 50000, invoice_date: '2026-05-24',
        po_no: null, po_line_no: null, ordered_quantity: null, expected_amount: null,
        received_quantity: 0, amount_variance: null, match_status: 'unmatched',
      },
    ];
    await fulfillJson(route, queue ?? defaultQueue);
  });
}

test('3-way Match renders action-needed banner and status counts', async ({ page }) => {
  await setupMatchMocks(page);

  await page.goto('/purchasing/three-way-match', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /3-way match/i })).toBeVisible({ timeout: 30_000 });
  // Action needed = 2 + 5 + 1 = 8
  await expect(page.getByTestId('action-needed-banner')).toContainText(/8 invoices need attention/i);
  await expect(page.getByTestId('tw-count-amount_variance')).toContainText('2');
  await expect(page.getByTestId('tw-count-pending_receipt')).toContainText('5');
  await expect(page.getByTestId('tw-count-unmatched')).toContainText('1');
  await expect(page.getByTestId('tw-count-matched')).toContainText('42');
});

test('3-way Match queue lists rows with variance / pending / unmatched first', async ({ page }) => {
  await setupMatchMocks(page);

  await page.goto('/purchasing/three-way-match', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('tw-row-pi-1')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('tw-row-pi-1')).toContainText(/amount variance/i);
  await expect(page.getByTestId('tw-row-pi-2')).toContainText(/pending receipt/i);
  await expect(page.getByTestId('tw-row-pi-3')).toContainText(/unmatched/i);
  await expect(page.getByTestId('tw-open-pi-1')).toBeVisible();
});

test('3-way Match shows feature unavailable when flag is disabled', async ({ page }) => {
  await setupMatchMocks(page, { featureEnabled: false });

  await page.goto('/purchasing/three-way-match', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /3-way match unavailable/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/phase3e\.po-grn-v2/i)).toBeVisible({ timeout: 30_000 });
});

test('3-way Match shows empty state when queue is empty', async ({ page }) => {
  await setupMatchMocks(page, { counts: [], queue: [] });

  await page.goto('/purchasing/three-way-match', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/no purchase invoices match the current filter/i)).toBeVisible({ timeout: 30_000 });
});
