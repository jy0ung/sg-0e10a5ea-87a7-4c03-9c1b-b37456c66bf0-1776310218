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

async function setupLeadMocks(page: Page, opts: {
  featureEnabled?: boolean;
  feed?: unknown[];
  detail?: Record<string, unknown> | null;
} = {}) {
  const { featureEnabled = true, feed, detail } = opts;
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'flag-3f',
          company_id: null,
          code: 'phase3f.lead-intake-v2',
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

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_leads_feed*`, async route => {
    const defaultFeed = [
      {
        source_kind: 'lead', source_raw_id: 'raw-1',
        dms_external_id: 'L-001', dms_customer_id: 'CUST-1',
        branch_code: 'KCH', salesperson_code: 'SP1', status: 'new',
        source_created_at: '2026-05-20T08:00:00Z', fetched_at: '2026-05-25T08:00:00Z',
        followup_count: 2, last_followup_at: '2026-05-22T10:00:00Z',
        last_followup_outcome: 'contacted', next_action_date: '2020-01-01',  // past due
      },
      {
        source_kind: 'prospect', source_raw_id: 'raw-2',
        dms_external_id: 'P-001', dms_customer_id: 'CUST-2',
        branch_code: 'BTU', salesperson_code: 'SP2', status: 'open',
        source_created_at: '2026-05-21T08:00:00Z', fetched_at: '2026-05-25T08:00:00Z',
        followup_count: 0, last_followup_at: null,
        last_followup_outcome: null, next_action_date: null,
      },
    ];
    await fulfillJson(route, feed ?? defaultFeed);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_lead_detail*`, async route => {
    const defaultDetail = {
      source_kind: 'lead', source_raw_id: 'raw-1',
      dms_external_id: 'L-001', dms_customer_id: 'CUST-1',
      branch_code: 'KCH', salesperson_code: 'SP1', status: 'new',
      source_created_at: '2026-05-20T08:00:00Z', fetched_at: '2026-05-25T08:00:00Z',
      raw_payload: { name: 'ACME', phone: '0123456789' },
      followups: [
        { id: 'f1', company_id: 'co-1', source_kind: 'lead', source_raw_id: 'raw-1',
          notes: 'First call — interested in Hilux', outcome: 'contacted',
          next_action_date: '2026-05-30', author_id: 'user-1',
          created_at: '2026-05-22T10:00:00Z', updated_at: '2026-05-22T10:00:00Z' },
      ],
    };
    if (detail === null) {
      await fulfillJson(route, []);
      return;
    }
    await fulfillJson(route, [detail ?? defaultDetail]);
  });

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/add_lead_followup*`, async route => {
    await fulfillJson(route, 'new-followup-id');
  });
}

test('Lead Intake renders feed with KPI cards', async ({ page }) => {
  await setupLeadMocks(page);

  await page.goto('/sales/lead-intake', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /lead intake/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('leads-total')).toHaveText('2');
  // raw-1 has past-due next_action_date 2020-01-01
  await expect(page.getByTestId('leads-pastdue')).toHaveText('1');
  // raw-2 has zero follow-ups
  await expect(page.getByTestId('leads-never-contacted')).toHaveText('1');
  await expect(page.getByTestId('lead-row-raw-1')).toBeVisible();
  await expect(page.getByTestId('lead-row-raw-2')).toBeVisible();
});

test('Lead Intake Detail renders metadata, follow-up timeline, and convert button', async ({ page }) => {
  await setupLeadMocks(page);

  await page.goto('/sales/lead-intake/lead/raw-1', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /Lead L-001/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('followup-count')).toHaveText('1');
  await expect(page.getByTestId('followup-f1')).toContainText(/first call/i);
  await expect(page.getByTestId('convert-to-so')).toBeVisible();
});

test('Lead Intake Detail saves a new follow-up and shows toast', async ({ page }) => {
  let postCalled = false;
  await setupLeadMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/add_lead_followup*`, async route => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    postCalled = true;
    expect(body.p_notes).toBe('New outreach attempt');
    expect(body.p_outcome).toBe('callback_scheduled');
    await fulfillJson(route, 'new-id');
  });

  await page.goto('/sales/lead-intake/lead/raw-1', { waitUntil: 'domcontentloaded' });

  await page.getByTestId('followup-notes').fill('New outreach attempt');
  // Open outcome dropdown and pick callback_scheduled
  await page.locator('button:has-text("No outcome set")').click();
  await page.getByRole('option', { name: /callback scheduled/i }).click();
  await page.getByTestId('save-followup').click();

  await expect(page.getByText(/follow-up recorded/i)).toBeVisible({ timeout: 30_000 });
  expect(postCalled).toBe(true);
});

test('Lead Intake shows feature unavailable when flag is disabled', async ({ page }) => {
  await setupLeadMocks(page, { featureEnabled: false });

  await page.goto('/sales/lead-intake', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /lead intake unavailable/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/phase3f\.lead-intake-v2/i)).toBeVisible({ timeout: 30_000 });
});

test('Lead Intake shows empty state when feed is empty', async ({ page }) => {
  await setupLeadMocks(page, { feed: [] });

  await page.goto('/sales/lead-intake', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/no leads or prospects match/i)).toBeVisible({ timeout: 30_000 });
});
