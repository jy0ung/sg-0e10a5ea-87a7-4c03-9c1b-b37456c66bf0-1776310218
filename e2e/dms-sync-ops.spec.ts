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

async function setupSyncOpsMocks(page: Page, opts: {
  featureEnabled?: boolean;
  summary?: unknown[];
  staging?: unknown[];
  runs?: unknown[];
} = {}) {
  const { featureEnabled = true, summary, staging, runs } = opts;
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'flag-3c',
          company_id: null,
          code: 'phase3c.dms-sync-ops-v2',
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

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_dms_sync_runs_summary*`, async route => {
    const defaultSummary = [
      { source_system: 'dms', total_runs: 42, succeeded_runs: 40, failed_runs: 1, running_runs: 1, pending_runs: 0,
        last_run_at: '2026-05-25T08:00:00Z', last_run_status: 'succeeded', total_record_count: 12345 },
      { source_system: 'legacy_fookloi', total_runs: 5, succeeded_runs: 4, failed_runs: 1, running_runs: 0, pending_runs: 0,
        last_run_at: '2026-05-24T08:30:00Z', last_run_status: 'failed', total_record_count: 500 },
    ];
    await fulfillJson(route, summary ?? defaultSummary);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_dms_raw_staging_counts*`, async route => {
    const defaultStaging = [
      { table_name: 'dms_raw_sales_orders', total_rows: 1000, normalized_rows: 980, pending_rows: 20, latest_fetched_at: '2026-05-25T08:00:00Z' },
      { table_name: 'dms_raw_vehicle_stock', total_rows: 500, normalized_rows: 500, pending_rows: 0, latest_fetched_at: '2026-05-25T07:00:00Z' },
      { table_name: 'dms_raw_leads', total_rows: 0, normalized_rows: 0, pending_rows: 0, latest_fetched_at: null },
    ];
    await fulfillJson(route, staging ?? defaultStaging);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/sync_runs*`, async route => {
    if (route.request().method() === 'GET') {
      const defaultRuns = [
        {
          id: 'run-1', company_id: MOCK_PROFILE.company_id, source_system: 'dms',
          sync_type: 'sales_orders.full', source_endpoint: '/api/2b/dms.retail/manfacturer/order/pageorders',
          request_filters: {}, status: 'succeeded', record_count: 500,
          started_at: '2026-05-25T08:00:00Z', finished_at: '2026-05-25T08:01:30Z',
          error_code: null, error_message: null,
          created_at: '2026-05-25T08:00:00Z', updated_at: '2026-05-25T08:01:30Z',
        },
        {
          id: 'run-2', company_id: MOCK_PROFILE.company_id, source_system: 'dms',
          sync_type: 'vehicle_stock.full', source_endpoint: '/api/vehicle/stock',
          request_filters: {}, status: 'failed', record_count: 0,
          started_at: '2026-05-24T08:00:00Z', finished_at: '2026-05-24T08:00:15Z',
          error_code: 'TIMEOUT', error_message: 'Connection timed out',
          created_at: '2026-05-24T08:00:00Z', updated_at: '2026-05-24T08:00:15Z',
        },
      ];
      await fulfillJson(route, runs ?? defaultRuns);
      return;
    }
    await fulfillJson(route, {});
  });
}

test('DMS Sync Ops renders per-source summary cards and staging counts', async ({ page }) => {
  await setupSyncOpsMocks(page);

  await page.goto('/admin/dms-sync', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /dms sync operations/i })).toBeVisible({ timeout: 30_000 });

  // Per-source summary cards
  await expect(page.getByTestId('sync-summary-dms')).toBeVisible();
  await expect(page.getByTestId('sync-summary-legacy_fookloi')).toBeVisible();

  // Staging counts
  await expect(page.getByTestId('staging-row-dms_raw_sales_orders')).toBeVisible();
  await expect(page.getByTestId('staging-overview')).toContainText(/1,500 total rows/);
  await expect(page.getByTestId('staging-overview')).toContainText(/20 pending normalization/i);
});

test('DMS Sync Ops lists recent sync runs with status badges', async ({ page }) => {
  await setupSyncOpsMocks(page);

  await page.goto('/admin/dms-sync', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('sync-run-run-1')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('sync-run-run-2')).toBeVisible({ timeout: 30_000 });
  // The error message is rendered for failed runs
  await expect(page.getByText(/connection timed out/i)).toBeVisible();
});

test('DMS Sync Ops shows feature unavailable when flag is disabled', async ({ page }) => {
  await setupSyncOpsMocks(page, { featureEnabled: false });

  await page.goto('/admin/dms-sync', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/feature not available/i)).toBeVisible({ timeout: 30_000 });
});

test('DMS Sync Ops shows empty state when no runs exist', async ({ page }) => {
  await setupSyncOpsMocks(page, { summary: [], staging: [], runs: [] });

  await page.goto('/admin/dms-sync', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/no sync runs recorded yet/i)).toBeVisible({ timeout: 30_000 });
});
