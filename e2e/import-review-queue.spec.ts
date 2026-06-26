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

async function setupImportReviewMocks(page: Page) {
  const batchId = '11111111-1111-1111-1111-111111111111';

  await setupAuthMocks(page);

  // Mock import_batches
  await page.route(`${SUPABASE_URL}/rest/v1/import_batches*`, async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await fulfillJson(route, [
        {
          id: batchId,
          file_name: 'test-inventory.xlsx',
          uploaded_by: MOCK_PROFILE.id,
          uploaded_at: '2026-05-25T00:00:00Z',
          status: 'published_with_review',
          total_rows: 10,
          valid_rows: 8,
          error_rows: 2,
          duplicate_rows: 0,
          company_id: MOCK_PROFILE.company_id,
          published_rows: 8,
          review_rows: 2,
          published_at: '2026-05-25T01:00:00Z',
        },
      ]);
      return;
    }

    await fulfillJson(route, {});
  });

  // Mock import_review_rows
  await page.route(`${SUPABASE_URL}/rest/v1/import_review_rows*`, async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await fulfillJson(route, [
        {
          id: 'review-1',
          import_batch_id: batchId,
          company_id: MOCK_PROFILE.company_id,
          row_number: 1,
          source_row_id: null,
          chassis_no: 'TEST-001',
          branch_code: 'KCH',
          raw_payload: { field: 'value' },
          normalized_payload: { field: 'value' },
          validation_errors: [
            {
              field: 'model',
              message: 'Missing model',
              code: 'REQUIRED_FIELD_MISSING',
              severity: 'error',
              rowNumber: 1,
            },
          ],
          review_reason: 'incomplete',
          review_status: 'pending',
          assigned_to: null,
          resolved_vehicle_id: null,
          resolved_at: null,
          created_at: '2026-05-25T00:00:00Z',
          updated_at: '2026-05-25T00:00:00Z',
        },
        {
          id: 'review-2',
          import_batch_id: batchId,
          company_id: MOCK_PROFILE.company_id,
          row_number: 2,
          source_row_id: null,
          chassis_no: 'DUPLICATE-001',
          branch_code: 'KCH',
          raw_payload: { field: 'value' },
          normalized_payload: { field: 'value' },
          validation_errors: [
            {
              field: 'chassis_no',
              message: 'Duplicate chassis number',
              code: 'DUPLICATE_CHASSIS',
              severity: 'error',
              rowNumber: 2,
            },
          ],
          review_reason: 'blocking',
          review_status: 'pending',
          assigned_to: null,
          resolved_vehicle_id: null,
          resolved_at: null,
          created_at: '2026-05-25T00:00:00Z',
          updated_at: '2026-05-25T00:00:00Z',
        },
      ]);
      return;
    }

    if (method === 'PATCH') {
      const payload = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      await fulfillJson(route, { ...payload });
      return;
    }

    await fulfillJson(route, {});
  });

  // Mock feature flags to enable review queue
  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'flag-1',
          company_id: null,
          code: 'phase3a.import-review-v2',
          enabled: true,
          rollout_pct: 100,
          description: null,
          created_at: '2026-05-25T00:00:00Z',
          updated_at: '2026-05-25T00:00:00Z',
        },
      ]);
      return;
    }

    await fulfillJson(route, {});
  });

  return { batchId };
}

test('Import Review Queue displays pending review items from import batch', async ({ page }) => {
  await setupImportReviewMocks(page);

  await page.goto('/auto-aging/review', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /review queue/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('cell', { name: '2', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/test-inventory.xlsx/i)).toBeVisible({ timeout: 30_000 });
});

test('Import Review Queue shows feature unavailable when flag is disabled', async ({ page }) => {
  await setupAuthMocks(page);

  // Mock with feature flag disabled
  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'flag-1',
          company_id: null,
          code: 'phase3a.import-review-v2',
          enabled: false,
          rollout_pct: 0,
          description: null,
          created_at: '2026-05-25T00:00:00Z',
          updated_at: '2026-05-25T00:00:00Z',
        },
      ]);
      return;
    }

    await fulfillJson(route, {});
  });

  await page.goto('/auto-aging/review', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /review queue unavailable/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/phase3a\.import-review-v2/i)).toBeVisible({ timeout: 30_000 });
});

test('Import Review Detail page displays review items and their validation errors', async ({ page }) => {
  const { batchId } = await setupImportReviewMocks(page);

  // Mock import_batches for detail page
  await page.route(`${SUPABASE_URL}/rest/v1/import_batches*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: batchId,
          file_name: 'test-inventory.xlsx',
          uploaded_by: MOCK_PROFILE.id,
          uploaded_at: '2026-05-25T00:00:00Z',
          status: 'published_with_review',
          total_rows: 10,
          valid_rows: 8,
          error_rows: 2,
          duplicate_rows: 0,
          company_id: MOCK_PROFILE.company_id,
          published_rows: 8,
          review_rows: 2,
        },
      ]);
      return;
    }

    await fulfillJson(route, {});
  });

  await page.goto(`/auto-aging/review/${batchId}`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /review.*test-inventory.xlsx/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/2 queued row/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Missing model/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Duplicate chassis/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /accept/i }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /discard/i }).first()).toBeVisible({ timeout: 30_000 });
});

test('Import Review Detail accepts a row and marks it resolved', async ({ page }) => {
  const { batchId } = await setupImportReviewMocks(page);

  let updateCallCount = 0;

  // Mock import_batches
  await page.route(`${SUPABASE_URL}/rest/v1/import_batches*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: batchId,
          file_name: 'test-inventory.xlsx',
          uploaded_by: MOCK_PROFILE.id,
          uploaded_at: '2026-05-25T00:00:00Z',
          status: 'published_with_review',
          total_rows: 10,
          valid_rows: 8,
          error_rows: 2,
          duplicate_rows: 0,
          company_id: MOCK_PROFILE.company_id,
          published_rows: 8,
          review_rows: 2,
        },
      ]);
      return;
    }

    await fulfillJson(route, {});
  });

  // Mock import_review_rows and track PATCH calls
  await page.route(`${SUPABASE_URL}/rest/v1/import_review_rows*`, async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await fulfillJson(route, [
        {
          id: 'review-1',
          import_batch_id: batchId,
          company_id: MOCK_PROFILE.company_id,
          row_number: 1,
          chassis_no: 'TEST-001',
          branch_code: 'KCH',
          validation_errors: [
            { field: 'model', message: 'Missing model', code: 'REQUIRED_FIELD_MISSING', severity: 'error' },
          ],
          review_reason: 'incomplete',
          review_status: 'pending',
          assigned_to: null,
          resolved_at: null,
          created_at: '2026-05-25T00:00:00Z',
          updated_at: '2026-05-25T00:00:00Z',
        },
      ]);
      return;
    }

    if (method === 'PATCH') {
      updateCallCount++;
      const data = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      expect(data.review_status).toBe('resolved');
      expect(data.resolved_at).toBeTruthy();
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, {});
  });

  await page.goto(`/auto-aging/review/${batchId}`, { waitUntil: 'domcontentloaded' });

  const acceptButtons = page.getByRole('button', { name: /accept/i });
  await acceptButtons.first().click();

  await expect(page.getByText(/row accepted/i)).toBeVisible({ timeout: 30_000 });
  expect(updateCallCount).toBeGreaterThan(0);
});

test('Import Review Detail discards a row and prevents publish', async ({ page }) => {
  const { batchId } = await setupImportReviewMocks(page);

  let updateCallCount = 0;

  // Mock import_batches
  await page.route(`${SUPABASE_URL}/rest/v1/import_batches*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: batchId,
          file_name: 'test-inventory.xlsx',
          uploaded_by: MOCK_PROFILE.id,
          uploaded_at: '2026-05-25T00:00:00Z',
          status: 'published_with_review',
          total_rows: 10,
          valid_rows: 8,
          error_rows: 2,
          duplicate_rows: 0,
          company_id: MOCK_PROFILE.company_id,
          published_rows: 8,
          review_rows: 2,
        },
      ]);
      return;
    }

    await fulfillJson(route, {});
  });

  // Mock import_review_rows and track PATCH calls
  await page.route(`${SUPABASE_URL}/rest/v1/import_review_rows*`, async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await fulfillJson(route, [
        {
          id: 'review-1',
          import_batch_id: batchId,
          company_id: MOCK_PROFILE.company_id,
          row_number: 1,
          chassis_no: 'TEST-001',
          branch_code: 'KCH',
          validation_errors: [
            { field: 'model', message: 'Missing model', code: 'REQUIRED_FIELD_MISSING', severity: 'error' },
          ],
          review_reason: 'incomplete',
          review_status: 'pending',
          assigned_to: null,
          resolved_at: null,
          created_at: '2026-05-25T00:00:00Z',
          updated_at: '2026-05-25T00:00:00Z',
        },
      ]);
      return;
    }

    if (method === 'PATCH') {
      updateCallCount++;
      const data = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      expect(data.review_status).toBe('discarded');
      expect(data.resolved_at).toBeTruthy();
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, {});
  });

  await page.goto(`/auto-aging/review/${batchId}`, { waitUntil: 'domcontentloaded' });

  const discardButtons = page.getByRole('button', { name: /discard/i });
  await discardButtons.first().click();

  await expect(page.getByText(/row discarded/i)).toBeVisible({ timeout: 30_000 });
  expect(updateCallCount).toBeGreaterThan(0);
});
