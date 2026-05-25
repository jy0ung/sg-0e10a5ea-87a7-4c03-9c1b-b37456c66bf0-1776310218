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

const PERIOD_ID = '44444444-4444-4444-4444-444444444444';

async function setupPeriodCloseMocks(page: Page, opts: {
  featureEnabled?: boolean;
  summary?: Record<string, unknown> | null;
  unposted?: unknown[];
} = {}) {
  const { featureEnabled = true, summary, unposted } = opts;
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'flag-3b',
          company_id: null,
          code: 'phase3b.financial-reports-v2',
          enabled: featureEnabled,
          rollout_pct: featureEnabled ? 100 : 0,
          description: null,
          created_at: '2026-05-25T00:00:00Z',
          updated_at: '2026-05-25T00:00:00Z',
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/accounting_periods*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: PERIOD_ID,
          company_id: MOCK_PROFILE.company_id,
          name: 'May 2026',
          period_year: 2026,
          period_month: 5,
          start_date: '2026-05-01',
          end_date:   '2026-05-31',
          status: 'open',
          closed_at: null,
          closed_by: null,
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_period_close_summary*`, async route => {
    const defaultSummary = {
      period_status: 'open',
      period_start_date: '2026-05-01',
      period_end_date:   '2026-05-31',
      journal_entry_count: 12,
      total_debit:  100_000,
      total_credit: 100_000,
      unposted_ar_payment_count: 2,
      unposted_ar_payment_amount: 4_500,
      unposted_ap_payment_count: 1,
      unposted_ap_payment_amount: 3_000,
      open_ar_invoice_count: 5,
      open_ar_invoice_outstanding: 25_000,
      open_ap_invoice_count: 3,
      open_ap_invoice_outstanding: 18_000,
    };
    const body = summary === undefined ? [defaultSummary] : summary === null ? [] : [summary];
    await fulfillJson(route, body);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_period_close_unposted*`, async route => {
    const defaultUnposted = [
      { kind: 'ar_payment', event_id: 'pe-1',  document_id: 'inv-1', payment_date: '2026-05-15', amount: 1_500, reference: 'RCPT-001' },
      { kind: 'ar_payment', event_id: 'pe-2',  document_id: 'inv-2', payment_date: '2026-05-12', amount: 3_000, reference: null },
      { kind: 'ap_payment', event_id: 'spe-1', document_id: 'pi-1',  payment_date: '2026-05-10', amount: 3_000, reference: 'CHQ-9001' },
    ];
    await fulfillJson(route, unposted ?? defaultUnposted);
  });
}

test('Period Close drilldown renders KPIs and unposted rows', async ({ page }) => {
  await setupPeriodCloseMocks(page);

  await page.goto('/accounts/period-close', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /period close/i })).toBeVisible({ timeout: 30_000 });

  await expect(page.getByTestId('pc-je-count')).toHaveText('12');
  await expect(page.getByTestId('pc-unposted-ar')).toHaveText('2');
  await expect(page.getByTestId('pc-unposted-ap')).toHaveText('1');

  // Not-ready banner
  await expect(page.getByTestId('pc-readiness')).toContainText(/not ready/i);
  await expect(page.getByTestId('pc-readiness')).toContainText(/3 unposted/i);

  // Drilldown rows present
  await expect(page.getByTestId('pc-unposted-row-pe-1')).toBeVisible();
  await expect(page.getByTestId('pc-unposted-row-spe-1')).toBeVisible();
});

test('Period Close shows ready banner when no unposted payments and JEs balance', async ({ page }) => {
  await setupPeriodCloseMocks(page, {
    summary: {
      period_status: 'open',
      period_start_date: '2026-05-01',
      period_end_date:   '2026-05-31',
      journal_entry_count: 8,
      total_debit:  50_000,
      total_credit: 50_000,
      unposted_ar_payment_count: 0,
      unposted_ar_payment_amount: 0,
      unposted_ap_payment_count: 0,
      unposted_ap_payment_amount: 0,
      open_ar_invoice_count: 0,
      open_ar_invoice_outstanding: 0,
      open_ap_invoice_count: 0,
      open_ap_invoice_outstanding: 0,
    },
    unposted: [],
  });

  await page.goto('/accounts/period-close', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('pc-readiness')).toContainText(/ready to close/i);
  await expect(page.getByText(/no unposted payment events in this period/i)).toBeVisible();
});

test('Period Close shows read-only banner when period is closed', async ({ page }) => {
  await setupPeriodCloseMocks(page, {
    summary: {
      period_status: 'closed',
      period_start_date: '2026-04-01',
      period_end_date:   '2026-04-30',
      journal_entry_count: 20,
      total_debit:  200_000,
      total_credit: 200_000,
      unposted_ar_payment_count: 0,
      unposted_ar_payment_amount: 0,
      unposted_ap_payment_count: 0,
      unposted_ap_payment_amount: 0,
      open_ar_invoice_count: 0,
      open_ar_invoice_outstanding: 0,
      open_ap_invoice_count: 0,
      open_ap_invoice_outstanding: 0,
    },
    unposted: [],
  });

  await page.goto('/accounts/period-close', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('pc-readiness')).toContainText(/read-only/i);
});

test('Period Close shows feature unavailable when flag is disabled', async ({ page }) => {
  await setupPeriodCloseMocks(page, { featureEnabled: false });

  await page.goto('/accounts/period-close', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/feature not available/i)).toBeVisible({ timeout: 30_000 });
});
