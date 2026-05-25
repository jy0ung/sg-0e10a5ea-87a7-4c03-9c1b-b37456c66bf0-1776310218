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

async function setupReconciliationMocks(page: Page, opts: {
  featureEnabled?: boolean;
  counts?: unknown[];
  queue?: unknown[];
  detail?: Record<string, unknown> | null;
} = {}) {
  const { featureEnabled = true, counts, queue, detail } = opts;
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'flag-3d',
          company_id: null,
          code: 'phase3d.reconciliation-review-v2',
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

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_reconciliation_status_counts*`, async route => {
    const defaultCounts = [
      { match_status: 'candidate', total: 12 },
      { match_status: 'conflict',  total: 3 },
      { match_status: 'accepted',  total: 540 },
    ];
    await fulfillJson(route, counts ?? defaultCounts);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_reconciliation_queue*`, async route => {
    const defaultQueue = [
      {
        id: 'match-1', object_type: 'sales_order', source_system: 'dms',
        source_table: 'dms_raw_sales_orders', source_record_id: '11111111-1111-1111-1111-111111111111',
        canonical_table: 'sales_orders', canonical_record_id: '22222222-2222-2222-2222-222222222222',
        match_status: 'candidate', confidence_score: 0.85, match_rule: 'dms_so_no_match',
        source_priority: 10, review_owner: null, reviewed_at: null,
        created_at: '2026-05-25T08:00:00Z', updated_at: '2026-05-25T08:00:00Z',
      },
      {
        id: 'match-2', object_type: 'vehicle', source_system: 'dms',
        source_table: 'dms_raw_vehicle_stock', source_record_id: '33333333-3333-3333-3333-333333333333',
        canonical_table: 'vehicles', canonical_record_id: '44444444-4444-4444-4444-444444444444',
        match_status: 'conflict', confidence_score: 0.62, match_rule: 'chassis_no_fuzzy',
        source_priority: 5, review_owner: null, reviewed_at: null,
        created_at: '2026-05-24T08:00:00Z', updated_at: '2026-05-24T08:00:00Z',
      },
    ];
    await fulfillJson(route, queue ?? defaultQueue);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_reconciliation_match_detail*`, async route => {
    const defaultDetail = {
      id: 'match-1', object_type: 'sales_order', source_system: 'dms',
      source_table: 'dms_raw_sales_orders', source_record_id: 'raw-1',
      canonical_table: 'sales_orders', canonical_record_id: 'canon-1',
      match_status: 'candidate', confidence_score: 0.85, match_rule: 'dms_so_no_match',
      match_basis: { dms_so_no: '12345' }, conflict_payload: {},
      source_priority: 10, review_owner: null, reviewed_at: null, review_notes: null,
      source_payload:    { dms_so_no: '12345', customer_name: 'ACME',     branch_code: 'KCH' },
      canonical_payload: { vso_no:    '12345', customer_name: 'ACME Sdn', branch_code: 'KCH' },
      created_at: '2026-05-25T08:00:00Z', updated_at: '2026-05-25T08:00:00Z',
    };
    if (detail === null) {
      await fulfillJson(route, []);
      return;
    }
    await fulfillJson(route, [detail ?? defaultDetail]);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/decide_reconciliation_match*`, async route => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    await fulfillJson(route, body.p_match_id ?? 'match-1');
  });
}

test('Reconciliation Queue renders status counts and action-needed banner', async ({ page }) => {
  await setupReconciliationMocks(page);

  await page.goto('/admin/reconciliation', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /reconciliation queue/i })).toBeVisible({ timeout: 30_000 });
  // Total action-needed = 12 candidate + 3 conflict = 15
  await expect(page.getByTestId('action-needed-banner')).toContainText(/15 matches require review/i);
  await expect(page.getByTestId('status-count-candidate')).toContainText('12');
  await expect(page.getByTestId('status-count-conflict')).toContainText('3');
  await expect(page.getByTestId('status-count-accepted')).toContainText('540');
});

test('Reconciliation Queue lists matches with review buttons', async ({ page }) => {
  await setupReconciliationMocks(page);

  await page.goto('/admin/reconciliation', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('recon-row-match-1')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('recon-row-match-2')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('recon-review-match-1')).toBeVisible();
});

test('Reconciliation Detail shows side-by-side diff and decision form', async ({ page }) => {
  await setupReconciliationMocks(page);

  await page.goto('/admin/reconciliation/match-1', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /reconciliation/i })).toBeVisible({ timeout: 30_000 });
  // 3 comparable fields between payloads (dms_so_no/vso_no map differently, customer_name same, branch_code same)
  // Our diff function compares by key, so dms_so_no, vso_no, customer_name, branch_code => 4 keys
  // customer_name and branch_code match in both, dms_so_no only in source, vso_no only in canonical => 2 differing
  await expect(page.getByTestId('diff-count')).toContainText('2');
  await expect(page.getByTestId('diff-field-customer_name')).toBeVisible();
  await expect(page.getByTestId('decide-accept')).toBeVisible();
  await expect(page.getByTestId('decide-reject')).toBeVisible();
  await expect(page.getByTestId('decide-ignore')).toBeVisible();
});

test('Reconciliation Detail accepts a match and shows confirmation toast', async ({ page }) => {
  await setupReconciliationMocks(page);

  await page.goto('/admin/reconciliation/match-1', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('decide-accept').click();

  await expect(page.getByText(/match accepted/i)).toBeVisible({ timeout: 30_000 });
});

test('Reconciliation Queue shows feature unavailable when flag is disabled', async ({ page }) => {
  await setupReconciliationMocks(page, { featureEnabled: false });

  await page.goto('/admin/reconciliation', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/feature not available/i)).toBeVisible({ timeout: 30_000 });
});

test('Reconciliation Detail shows terminal-state banner for accepted matches', async ({ page }) => {
  await setupReconciliationMocks(page, {
    detail: {
      id: 'match-1', object_type: 'sales_order', source_system: 'dms',
      source_table: 'dms_raw_sales_orders', source_record_id: 'raw-1',
      canonical_table: 'sales_orders', canonical_record_id: 'canon-1',
      match_status: 'accepted', confidence_score: 0.95, match_rule: 'dms_so_no_match',
      match_basis: {}, conflict_payload: {},
      source_priority: 10, review_owner: 'user-1', reviewed_at: '2026-05-20T08:00:00Z',
      review_notes: 'Looks right',
      source_payload: { x: 1 }, canonical_payload: { x: 1 },
      created_at: '2026-05-20T08:00:00Z', updated_at: '2026-05-20T08:00:00Z',
    },
  });

  await page.goto('/admin/reconciliation/match-1', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/terminal state/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/looks right/i)).toBeVisible();
});
